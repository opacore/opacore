use serde::{Deserialize, Serialize};

use crate::db::DbPool;
use crate::error::AppResult;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CostBasisMethod {
    Fifo,
    Lifo,
    Hifo,
}

impl Default for CostBasisMethod {
    fn default() -> Self {
        Self::Fifo
    }
}

#[derive(Debug, Clone)]
struct Lot {
    amount_sat: i64,
    price_usd: f64,
    date: String,
}

#[derive(Debug, Serialize)]
pub struct GainLoss {
    pub sell_date: String,
    pub sell_amount_sat: i64,
    pub sell_price_usd: f64,
    pub cost_basis_usd: f64,
    pub proceeds_usd: f64,
    pub gain_usd: f64,
    pub is_long_term: bool,
    pub holding_period_days: i64,
}

#[derive(Debug, Serialize)]
pub struct PortfolioSummary {
    pub total_balance_sat: i64,
    pub total_cost_basis_usd: f64,
    pub current_value_usd: f64,
    pub unrealized_gain_usd: f64,
    pub realized_gain_usd: f64,
    pub total_received_sat: i64,
    pub total_sent_sat: i64,
    pub transaction_count: i64,
}

#[derive(Debug, Serialize)]
pub struct CostBasisResult {
    pub method: String,
    pub gains: Vec<GainLoss>,
    pub total_realized_gain_usd: f64,
    pub total_short_term_gain_usd: f64,
    pub total_long_term_gain_usd: f64,
    pub remaining_lots: usize,
    pub remaining_balance_sat: i64,
    pub remaining_cost_basis_usd: f64,
}

/// Calculate cost basis and realized gains/losses for a portfolio.
pub fn calculate_cost_basis(
    pool: &DbPool,
    portfolio_id: &str,
    method: CostBasisMethod,
    tax_year: Option<i32>,
) -> AppResult<CostBasisResult> {
    let conn = pool.get()?;

    // Get all transactions sorted by date
    let mut stmt = conn.prepare(
        "SELECT tx_type, amount_sat, price_usd, transacted_at
         FROM transactions
         WHERE portfolio_id = ?1
         ORDER BY transacted_at ASC",
    )?;

    let txs: Vec<(String, i64, Option<f64>, String)> = stmt
        .query_map(rusqlite::params![portfolio_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    let mut lots: Vec<Lot> = Vec::new();
    let mut gains: Vec<GainLoss> = Vec::new();

    for (tx_type, amount_sat, price_usd, date) in &txs {
        let price = price_usd.unwrap_or(0.0);

        match tx_type.as_str() {
            "buy" | "receive" => {
                lots.push(Lot {
                    amount_sat: *amount_sat,
                    price_usd: price,
                    date: date.clone(),
                });
            }
            "sell" | "send" => {
                let mut remaining = *amount_sat;
                let sell_price = price;

                // Sort lots based on method before depleting
                sort_lots(&mut lots, method);

                while remaining > 0 && !lots.is_empty() {
                    let lot = &mut lots[0];
                    let disposed = remaining.min(lot.amount_sat);

                    // Calculate gain/loss
                    let cost_basis = (disposed as f64 / 1e8) * lot.price_usd;
                    let proceeds = (disposed as f64 / 1e8) * sell_price;
                    let gain = proceeds - cost_basis;

                    let holding_days = days_between(&lot.date, date);
                    let is_long_term = holding_days > 365;

                    // Filter by tax year if specified
                    let sell_year = date.get(..4).and_then(|y| y.parse::<i32>().ok());
                    let include = tax_year
                        .map(|ty| sell_year == Some(ty))
                        .unwrap_or(true);

                    if include {
                        gains.push(GainLoss {
                            sell_date: date.clone(),
                            sell_amount_sat: disposed,
                            sell_price_usd: sell_price,
                            cost_basis_usd: cost_basis,
                            proceeds_usd: proceeds,
                            gain_usd: gain,
                            is_long_term,
                            holding_period_days: holding_days,
                        });
                    }

                    lot.amount_sat -= disposed;
                    remaining -= disposed;

                    if lot.amount_sat == 0 {
                        lots.remove(0);
                    }
                }
            }
            _ => {} // transfer, etc. — no tax event
        }
    }

    let total_realized = gains.iter().map(|g| g.gain_usd).sum();
    let short_term: f64 = gains.iter().filter(|g| !g.is_long_term).map(|g| g.gain_usd).sum();
    let long_term: f64 = gains.iter().filter(|g| g.is_long_term).map(|g| g.gain_usd).sum();
    let remaining_sat: i64 = lots.iter().map(|l| l.amount_sat).sum();
    let remaining_basis: f64 = lots
        .iter()
        .map(|l| (l.amount_sat as f64 / 1e8) * l.price_usd)
        .sum();

    let method_name = match method {
        CostBasisMethod::Fifo => "fifo",
        CostBasisMethod::Lifo => "lifo",
        CostBasisMethod::Hifo => "hifo",
    };

    Ok(CostBasisResult {
        method: method_name.to_string(),
        gains,
        total_realized_gain_usd: total_realized,
        total_short_term_gain_usd: short_term,
        total_long_term_gain_usd: long_term,
        remaining_lots: lots.len(),
        remaining_balance_sat: remaining_sat,
        remaining_cost_basis_usd: remaining_basis,
    })
}

/// Get a summary of a portfolio's holdings.
pub fn portfolio_summary(
    pool: &DbPool,
    portfolio_id: &str,
    current_price_usd: f64,
    method: CostBasisMethod,
) -> AppResult<PortfolioSummary> {
    let conn = pool.get()?;

    let (total_received, total_sent, tx_count): (i64, i64, i64) = conn.query_row(
        "SELECT
            COALESCE(SUM(CASE WHEN tx_type IN ('buy','receive') THEN amount_sat ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN tx_type IN ('sell','send') THEN amount_sat ELSE 0 END), 0),
            COUNT(*)
         FROM transactions WHERE portfolio_id = ?1",
        rusqlite::params![portfolio_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let balance = total_received - total_sent;
    let current_value = (balance as f64 / 1e8) * current_price_usd;

    let basis = calculate_cost_basis(pool, portfolio_id, method, None)?;
    let cost_basis = basis.remaining_cost_basis_usd;
    let unrealized = current_value - cost_basis;

    Ok(PortfolioSummary {
        total_balance_sat: balance,
        total_cost_basis_usd: cost_basis,
        current_value_usd: current_value,
        unrealized_gain_usd: unrealized,
        realized_gain_usd: basis.total_realized_gain_usd,
        total_received_sat: total_received,
        total_sent_sat: total_sent,
        transaction_count: tx_count,
    })
}

fn sort_lots(lots: &mut [Lot], method: CostBasisMethod) {
    match method {
        CostBasisMethod::Fifo => {} // already in chronological order
        CostBasisMethod::Lifo => lots.reverse(),
        CostBasisMethod::Hifo => lots.sort_by(|a, b| {
            b.price_usd
                .partial_cmp(&a.price_usd)
                .unwrap_or(std::cmp::Ordering::Equal)
        }),
    }
}

fn days_between(start: &str, end: &str) -> i64 {
    let parse = |s: &str| -> Option<chrono::NaiveDate> {
        // Handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SS..." formats
        let date_part = &s[..s.len().min(10)];
        chrono::NaiveDate::parse_from_str(date_part, "%Y-%m-%d").ok()
    };

    match (parse(start), parse(end)) {
        (Some(s), Some(e)) => (e - s).num_days(),
        _ => 0,
    }
}
