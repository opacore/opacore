use serde::Serialize;

use crate::db::DbPool;
use crate::error::AppResult;
use crate::services::costbasis::{self, CostBasisMethod};

#[derive(Debug, Serialize)]
pub struct TaxReport {
    pub year: i32,
    pub method: String,
    pub short_term_gains: f64,
    pub long_term_gains: f64,
    pub total_gains: f64,
    pub total_proceeds: f64,
    pub total_cost_basis: f64,
    pub disposition_count: usize,
    pub dispositions: Vec<TaxDisposition>,
}

#[derive(Debug, Serialize)]
pub struct TaxDisposition {
    pub description: String,
    pub date_acquired: String,
    pub date_sold: String,
    pub proceeds: f64,
    pub cost_basis: f64,
    pub gain_or_loss: f64,
    pub holding_period: String, // "Short-term" or "Long-term"
    pub holding_days: i64,
}

/// Generate a tax report for a given year.
pub fn generate_tax_report(
    pool: &DbPool,
    portfolio_id: &str,
    year: i32,
    method: CostBasisMethod,
) -> AppResult<TaxReport> {
    let result = costbasis::calculate_cost_basis(pool, portfolio_id, method, Some(year))?;

    let dispositions: Vec<TaxDisposition> = result
        .gains
        .iter()
        .map(|g| {
            let btc_amount = g.sell_amount_sat as f64 / 1e8;
            TaxDisposition {
                description: format!("{:.8} BTC", btc_amount),
                date_acquired: "Various".to_string(),
                date_sold: g.sell_date[..10.min(g.sell_date.len())].to_string(),
                proceeds: round2(g.proceeds_usd),
                cost_basis: round2(g.cost_basis_usd),
                gain_or_loss: round2(g.gain_usd),
                holding_period: if g.is_long_term {
                    "Long-term".to_string()
                } else {
                    "Short-term".to_string()
                },
                holding_days: g.holding_period_days,
            }
        })
        .collect();

    let total_proceeds: f64 = dispositions.iter().map(|d| d.proceeds).sum();
    let total_cost: f64 = dispositions.iter().map(|d| d.cost_basis).sum();

    let method_name = match method {
        CostBasisMethod::Fifo => "fifo",
        CostBasisMethod::Lifo => "lifo",
        CostBasisMethod::Hifo => "hifo",
    };

    Ok(TaxReport {
        year,
        method: method_name.to_string(),
        short_term_gains: round2(result.total_short_term_gain_usd),
        long_term_gains: round2(result.total_long_term_gain_usd),
        total_gains: round2(result.total_realized_gain_usd),
        total_proceeds: round2(total_proceeds),
        total_cost_basis: round2(total_cost),
        disposition_count: dispositions.len(),
        dispositions,
    })
}

/// Generate Form 8949 CSV content.
/// Columns: Description, Date Acquired, Date Sold, Proceeds, Cost Basis, Gain/Loss, Term
pub fn generate_form_8949_csv(
    pool: &DbPool,
    portfolio_id: &str,
    year: i32,
    method: CostBasisMethod,
) -> AppResult<String> {
    let report = generate_tax_report(pool, portfolio_id, year, method)?;

    let mut wtr = csv::Writer::from_writer(Vec::new());

    // Header
    wtr.write_record([
        "Description of Property",
        "Date Acquired",
        "Date Sold or Disposed Of",
        "Proceeds (Sales Price)",
        "Cost or Other Basis",
        "Gain or (Loss)",
        "Term",
    ])
    .map_err(|e| crate::error::AppError::Internal(format!("CSV write error: {e}")))?;

    for d in &report.dispositions {
        wtr.write_record([
            &d.description,
            &d.date_acquired,
            &d.date_sold,
            &format!("{:.2}", d.proceeds),
            &format!("{:.2}", d.cost_basis),
            &format!("{:.2}", d.gain_or_loss),
            &d.holding_period,
        ])
        .map_err(|e| crate::error::AppError::Internal(format!("CSV write error: {e}")))?;
    }

    // Summary row
    wtr.write_record([
        "TOTALS",
        "",
        "",
        &format!("{:.2}", report.total_proceeds),
        &format!("{:.2}", report.total_cost_basis),
        &format!("{:.2}", report.total_gains),
        "",
    ])
    .map_err(|e| crate::error::AppError::Internal(format!("CSV write error: {e}")))?;

    let data = wtr
        .into_inner()
        .map_err(|e| crate::error::AppError::Internal(format!("CSV flush error: {e}")))?;

    String::from_utf8(data)
        .map_err(|e| crate::error::AppError::Internal(format!("CSV encoding error: {e}")))
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}
