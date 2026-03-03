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

/// Fetch daily BTC/USD close prices from Kraken's free OHLC API.
/// Returns a map of YYYY-MM-DD -> close price for all available dates in [start_date, end_date].
/// Kraken returns up to 720 candles per call; makes additional calls for wider ranges.
async fn fetch_kraken_ohlc_range(
    start_date: &str,
    end_date: &str,
) -> AppResult<std::collections::HashMap<String, f64>> {
    let client = Client::new();
    let mut price_map = std::collections::HashMap::new();

    let start = chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|_| AppError::Internal(format!("Invalid start date: {start_date}")))?;
    let end = chrono::NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
        .map_err(|_| AppError::Internal(format!("Invalid end date: {end_date}")))?;

    let end_ts = (end + chrono::Duration::days(1))
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp();
    let mut since_ts = start.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp();

    loop {
        let url = format!(
            "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since={since_ts}"
        );

        let resp_val: serde_json::Value = match client
            .get(&url)
            .header("User-Agent", "opacore/0.1")
            .header("Accept", "application/json")
            .send()
            .await
        {
            Ok(r) => match r.json().await {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!("Kraken OHLC parse failed: {e}");
                    break;
                }
            },
            Err(e) => {
                tracing::warn!("Kraken OHLC request failed: {e}");
                break;
            }
        };

        if let Some(errors) = resp_val.get("error").and_then(|e| e.as_array()) {
            if !errors.is_empty() {
                tracing::warn!("Kraken returned errors: {:?}", errors);
                break;
            }
        }

        let result = match resp_val.get("result") {
            Some(r) => r,
            None => break,
        };

        let candles = match result.get("XXBTZUSD").and_then(|v| v.as_array()) {
            Some(c) if !c.is_empty() => c,
            _ => break,
        };

        let last_ts = result.get("last").and_then(|v| v.as_i64()).unwrap_or(0);

        let mut hit_end = false;
        for candle in candles {
            if let Some(arr) = candle.as_array() {
                let ts = arr.first().and_then(|v| v.as_i64()).unwrap_or(0);
                if ts >= end_ts {
                    hit_end = true;
                    break;
                }
                // close price is index 4 (string in Kraken response)
                let close = arr
                    .get(4)
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                if close > 0.0 {
                    if let Some(dt) = chrono::DateTime::from_timestamp(ts, 0) {
                        price_map.insert(dt.format("%Y-%m-%d").to_string(), close);
                    }
                }
            }
        }

        if hit_end || candles.len() < 720 || last_ts >= end_ts {
            break;
        }

        since_ts = last_ts + 1;
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    Ok(price_map)
}

/// Bulk-backfill prices for a set of (tx_id, date) pairs.
/// Uses Kraken OHLC for dates within the last 720 days (free, fast).
/// Falls back to CoinGecko per-date for older dates not covered by Kraken.
async fn bulk_backfill_prices(
    pool: &DbPool,
    api_url: &str,
    rows: &[(String, String)],
) -> std::collections::HashMap<String, f64> {
    let unique_dates: Vec<String> = {
        let mut seen = std::collections::HashSet::new();
        rows.iter()
            .map(|(_, d)| d.clone())
            .filter(|d| seen.insert(d.clone()))
            .collect()
    };

    let min_date = unique_dates.iter().min().cloned().unwrap_or_default();
    let max_date = unique_dates.iter().max().cloned().unwrap_or_default();

    // Step 1: Fetch from Kraken (covers last ~720 days, no rate limit)
    let mut date_price: std::collections::HashMap<String, f64> =
        match fetch_kraken_ohlc_range(&min_date, &max_date).await {
            Ok(map) => {
                tracing::info!(
                    "Kraken OHLC: fetched {} daily prices ({min_date} to {max_date})",
                    map.len()
                );
                if let Ok(conn) = pool.get() {
                    for (date, price) in &map {
                        let _ = conn.execute(
                            "INSERT OR REPLACE INTO price_history (date, currency, price, source) VALUES (?1, 'usd', ?2, 'kraken')",
                            rusqlite::params![date, price],
                        );
                    }
                }
                map
            }
            Err(e) => {
                tracing::warn!("Kraken OHLC request failed: {e}");
                std::collections::HashMap::new()
            }
        };

    // Step 2: For any dates not covered by Kraken (typically pre-2024), fall back to CoinGecko
    let missing: Vec<&String> = unique_dates
        .iter()
        .filter(|d| !date_price.contains_key(*d))
        .collect();

    if !missing.is_empty() {
        tracing::info!(
            "CoinGecko fallback: fetching {} dates not covered by Kraken",
            missing.len()
        );
        for date in missing {
            match get_or_fetch_price(pool, api_url, date, "usd").await {
                Ok(price) => {
                    date_price.insert(date.clone(), price);
                }
                Err(e) => {
                    tracing::warn!("CoinGecko: no price for {date}: {e}");
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
        }
    };

    // Update all transactions
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    let mut updated = 0usize;
    if let Ok(conn) = pool.get() {
        for (tx_id, date) in rows {
            if let Some(&price) = date_price.get(date) {
                if conn
                    .execute(
                        "UPDATE transactions SET price_usd = ?1, updated_at = ?2 WHERE id = ?3",
                        rusqlite::params![price, now, tx_id],
                    )
                    .is_ok()
                {
                    updated += 1;
                }
            }
        }
    }
    tracing::info!("bulk_backfill_prices: updated {updated}/{} transactions", rows.len());

    date_price
}

/// Backfill price_usd for all transactions in a wallet that are missing it.
/// Uses Kraken OHLC for fast bulk fetching; falls back to CoinGecko per-date.
/// Designed to run as a background task — errors are logged, not propagated.
pub async fn backfill_wallet_prices(
    pool: DbPool,
    api_url: String,
    wallet_id: String,
) {
    let rows: Vec<(String, String)> = {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("backfill_wallet_prices: db error: {e}");
                return;
            }
        };
        let mut stmt = match conn.prepare(
            "SELECT id, substr(transacted_at, 1, 10) FROM transactions
             WHERE wallet_id = ?1 AND price_usd IS NULL AND transacted_at IS NOT NULL",
        ) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("backfill_wallet_prices: prepare failed: {e}");
                return;
            }
        };
        stmt.query_map(rusqlite::params![wallet_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
    };

    if rows.is_empty() {
        return;
    }

    tracing::info!(
        "backfill_wallet_prices: {} transactions to price for wallet {wallet_id}",
        rows.len()
    );

    bulk_backfill_prices(&pool, &api_url, &rows).await;
}

/// Backfill price_usd for all transactions across every wallet in a portfolio.
/// Queries all unpriced transactions in one pass and bulk-fetches via Kraken.
/// Designed to run as a background task — errors are logged, not propagated.
pub async fn backfill_portfolio_prices(pool: DbPool, api_url: String, portfolio_id: String) {
    let rows: Vec<(String, String)> = {
        let conn = match pool.get() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("backfill_portfolio_prices: db error: {e}");
                return;
            }
        };
        let mut stmt = match conn.prepare(
            "SELECT id, substr(transacted_at, 1, 10) FROM transactions
             WHERE portfolio_id = ?1 AND price_usd IS NULL AND transacted_at IS NOT NULL",
        ) {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("backfill_portfolio_prices: prepare error: {e}");
                return;
            }
        };
        stmt.query_map(rusqlite::params![portfolio_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
    };

    if rows.is_empty() {
        tracing::info!("backfill_portfolio_prices: no unpriced transactions for portfolio {portfolio_id}");
        return;
    }

    tracing::info!(
        "backfill_portfolio_prices: {} unpriced transactions for portfolio {portfolio_id}",
        rows.len()
    );

    bulk_backfill_prices(&pool, &api_url, &rows).await;
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
