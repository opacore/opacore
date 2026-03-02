use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Extension, Json,
};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::routes::AppState;
use crate::services::prices;

#[derive(Debug, Deserialize)]
pub struct CurrentPriceQuery {
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HistoricalPriceQuery {
    pub date: String,
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PriceRangeQuery {
    pub start: String,
    pub end: String,
    pub currency: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BackfillQuery {
    pub currency: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CurrentPriceResponse {
    pub currency: String,
    pub price: f64,
}

#[derive(Debug, Serialize)]
pub struct BackfillResponse {
    pub fetched: usize,
}

/// GET /api/v1/prices/current?currency=usd
pub async fn current(
    State(state): State<AppState>,
    Extension(_user): Extension<User>,
    Query(query): Query<CurrentPriceQuery>,
) -> AppResult<Json<CurrentPriceResponse>> {
    let currency = query.currency.as_deref().unwrap_or("usd");

    let price = prices::fetch_current_price(&state.config.coingecko_api_url, currency).await?;

    Ok(Json(CurrentPriceResponse {
        currency: currency.to_string(),
        price,
    }))
}

/// GET /api/v1/prices/historical?date=2024-01-15&currency=usd
pub async fn historical(
    State(state): State<AppState>,
    Extension(_user): Extension<User>,
    Query(query): Query<HistoricalPriceQuery>,
) -> AppResult<Json<prices::HistoricalPrice>> {
    let currency = query.currency.as_deref().unwrap_or("usd");

    if query.date.len() != 10 || query.date.chars().filter(|c| *c == '-').count() != 2 {
        return Err(AppError::BadRequest(
            "Date must be in YYYY-MM-DD format".into(),
        ));
    }

    let price =
        prices::get_or_fetch_price(&state.db, &state.config.coingecko_api_url, &query.date, currency)
            .await?;

    Ok(Json(prices::HistoricalPrice {
        date: query.date,
        currency: currency.to_string(),
        price,
        source: "coingecko".to_string(),
    }))
}

/// GET /api/v1/prices/range?start=2024-01-01&end=2024-12-31&currency=usd
pub async fn range(
    State(state): State<AppState>,
    Extension(_user): Extension<User>,
    Query(query): Query<PriceRangeQuery>,
) -> AppResult<Json<Vec<prices::HistoricalPrice>>> {
    let currency = query.currency.as_deref().unwrap_or("usd");

    // Check if we have cached data
    let cached = prices::get_cached_prices(&state.db, currency, &query.start, &query.end)?;

    if cached.is_empty() {
        // No data — backfill the range (fetches from CoinGecko and caches)
        let result = prices::backfill_date_range(
            &state.db,
            &state.config.coingecko_api_url,
            currency,
            &query.start,
            &query.end,
        )
        .await?;
        Ok(Json(result))
    } else {
        Ok(Json(cached))
    }
}

/// POST /api/v1/portfolios/:portfolio_id/prices/backfill
/// Fires a background task to fill price_usd on all transactions in this portfolio.
/// Returns 202 Accepted immediately.
pub async fn backfill_portfolio(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(portfolio_id): Path<String>,
) -> AppResult<StatusCode> {
    let exists: bool = {
        let conn = state.db.get()?;
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM portfolios WHERE id = ?1 AND user_id = ?2)",
            rusqlite::params![portfolio_id, user.id],
            |row| row.get(0),
        )?
    };

    if !exists {
        return Err(AppError::NotFound("Portfolio not found".into()));
    }

    let pool = state.db.clone();
    let api_url = state.config.coingecko_api_url.clone();
    tokio::spawn(async move {
        prices::backfill_portfolio_prices(pool, api_url, portfolio_id).await;
    });

    Ok(StatusCode::ACCEPTED)
}

/// POST /api/v1/prices/backfill
pub async fn backfill(
    State(state): State<AppState>,
    Extension(_user): Extension<User>,
    Json(body): Json<BackfillQuery>,
) -> AppResult<Json<BackfillResponse>> {
    let currency = body.currency.as_deref().unwrap_or("usd");

    let fetched = prices::backfill_transaction_prices(
        &state.db,
        &state.config.coingecko_api_url,
        currency,
    )
    .await?;

    Ok(Json(BackfillResponse { fetched }))
}
