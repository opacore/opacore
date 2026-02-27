use reqwest::Client;
use serde::Deserialize;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};

#[derive(Debug, serde::Serialize)]
pub struct PriceInfo {
    pub currency: String,
    pub price: f64,
    pub source: String,
}

#[derive(Debug, serde::Serialize)]
pub struct HistoricalPrice {
    pub date: String,
    pub currency: String,
    pub price: f64,
    pub source: String,
}

#[derive(Debug, Deserialize)]
struct CoinGeckoSimplePrice {
    bitcoin: std::collections::HashMap<String, f64>,
}

#[derive(Debug, Deserialize)]
struct CoinGeckoHistoryResponse {
    market_data: Option<CoinGeckoMarketData>,
}

#[derive(Debug, Deserialize)]
struct CoinGeckoMarketData {
    current_price: std::collections::HashMap<String, f64>,
}

/// Fetch current BTC price from CoinGecko.
pub async fn fetch_current_price(
    api_url: &str,
    currency: &str,
) -> AppResult<f64> {
    let client = Client::new();
    let url = format!(
        "{api_url}/simple/price?ids=bitcoin&vs_currencies={currency}"
    );

    let resp: CoinGeckoSimplePrice = client
        .get(&url)
        .header("Accept", "application/json")
        .header("User-Agent", "opacore/0.1")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("CoinGecko request failed: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("CoinGecko parse failed: {e}")))?;

    resp.bitcoin
        .get(currency)
        .copied()
        .ok_or_else(|| AppError::Internal(format!("No price for currency: {currency}")))
}

/// Fetch historical BTC price for a specific date from CoinGecko.
/// Date format: "dd-mm-yyyy" (CoinGecko format)
pub async fn fetch_historical_price(
    api_url: &str,
    date: &str,
    currency: &str,
) -> AppResult<f64> {
    let client = Client::new();
    let url = format!(
        "{api_url}/coins/bitcoin/history?date={date}&localization=false"
    );

    let resp: CoinGeckoHistoryResponse = client
        .get(&url)
        .header("Accept", "application/json")
        .header("User-Agent", "opacore/0.1")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("CoinGecko history request failed: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("CoinGecko history parse failed: {e}")))?;

    resp.market_data
        .and_then(|md| md.current_price.get(currency).copied())
        .ok_or_else(|| {
            AppError::Internal(format!("No historical price for {date} in {currency}"))
        })
}

/// Get cached price from DB, or fetch and cache it.
pub async fn get_or_fetch_price(
    pool: &DbPool,
    api_url: &str,
    date: &str,
    currency: &str,
) -> AppResult<f64> {
    // Check cache first — scope the connection so it's dropped before await
    let cached = {
        let conn = pool.get()?;
        conn.query_row(
            "SELECT price FROM price_history WHERE date = ?1 AND currency = ?2",
            rusqlite::params![date, currency],
            |row| row.get::<_, f64>(0),
        )
        .ok()
    };

    if let Some(price) = cached {
        return Ok(price);
    }

    // Convert YYYY-MM-DD to DD-MM-YYYY for CoinGecko
    let parts: Vec<&str> = date.split('-').collect();
    if parts.len() != 3 {
        return Err(AppError::BadRequest(format!("Invalid date format: {date}")));
    }
    let cg_date = format!("{}-{}-{}", parts[2], parts[1], parts[0]);

    let price = fetch_historical_price(api_url, &cg_date, currency).await?;

    // Cache it — new connection scope
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT OR REPLACE INTO price_history (date, currency, price, source) VALUES (?1, ?2, ?3, 'coingecko')",
            rusqlite::params![date, currency, price],
        )?;
    }

    Ok(price)
}

/// Get cached prices for a date range.
pub fn get_cached_prices(
    pool: &DbPool,
    currency: &str,
    start_date: &str,
    end_date: &str,
) -> AppResult<Vec<HistoricalPrice>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT date, currency, price, source FROM price_history WHERE currency = ?1 AND date >= ?2 AND date <= ?3 ORDER BY date",
    )?;

    let rows = stmt.query_map(rusqlite::params![currency, start_date, end_date], |row| {
        Ok(HistoricalPrice {
            date: row.get(0)?,
            currency: row.get(1)?,
            price: row.get(2)?,
            source: row.get(3)?,
        })
    })?;

    let prices: Result<Vec<_>, _> = rows.collect();
    Ok(prices?)
}

/// Backfill prices for a date range (e.g., last 30 days for the chart).
pub async fn backfill_date_range(
    pool: &DbPool,
    api_url: &str,
    currency: &str,
    start_date: &str,
    end_date: &str,
) -> AppResult<Vec<HistoricalPrice>> {
    // First, find which dates in the range are missing
    let mut missing_dates: Vec<String> = Vec::new();
    let mut current = start_date.to_string();
    while current <= end_date.to_string() {
        missing_dates.push(current.clone());
        // Advance by one day
        if let Ok(date) = chrono::NaiveDate::parse_from_str(&current, "%Y-%m-%d") {
            current = (date + chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
        } else {
            break;
        }
    }

    // Check which ones are already cached
    let uncached: Vec<String> = {
        let conn = pool.get()?;
        missing_dates
            .into_iter()
            .filter(|d| {
                conn.query_row(
                    "SELECT 1 FROM price_history WHERE date = ?1 AND currency = ?2",
                    rusqlite::params![d, currency],
                    |_| Ok(()),
                )
                .is_err()
            })
            .collect()
    };

    // Fetch missing prices (with rate limiting for CoinGecko free tier)
    for date in &uncached {
        match get_or_fetch_price(pool, api_url, date, currency).await {
            Ok(price) => {
                tracing::debug!("Backfilled price for {date}: {price} {currency}");
            }
            Err(e) => {
                tracing::warn!("Failed to backfill price for {date}: {e}");
            }
        }
        // CoinGecko free tier rate limit
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
    }

    // Return all cached prices for the range
    get_cached_prices(pool, currency, start_date, end_date)
}

/// Backfill prices for all transaction dates that don't have cached prices.
pub async fn backfill_transaction_prices(
    pool: &DbPool,
    api_url: &str,
    currency: &str,
) -> AppResult<usize> {
    // Collect dates first, then drop the connection before async work
    let dates: Vec<String> = {
        let conn = pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT DISTINCT substr(transacted_at, 1, 10) as tx_date
             FROM transactions
             WHERE tx_date NOT IN (SELECT date FROM price_history WHERE currency = ?1)
             ORDER BY tx_date",
        )?;

        let result = stmt.query_map(rusqlite::params![currency], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    let total = dates.len();
    tracing::info!("Backfilling {total} missing price dates for {currency}");

    let mut fetched = 0;
    for date in &dates {
        match get_or_fetch_price(pool, api_url, date, currency).await {
            Ok(price) => {
                tracing::debug!("Fetched price for {date}: {price} {currency}");
                fetched += 1;
            }
            Err(e) => {
                tracing::warn!("Failed to fetch price for {date}: {e}");
            }
        }

        // Rate limit: CoinGecko free tier allows ~10-30 req/min
        tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
    }

    Ok(fetched)
}
