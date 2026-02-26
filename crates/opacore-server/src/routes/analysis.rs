use axum::{
    extract::{Path, Query, State},
    Extension, Json,
};
use serde::Deserialize;

use crate::error::AppResult;
use crate::models::User;
use crate::routes::AppState;
use crate::services::costbasis::{self, CostBasisMethod};
use crate::services::prices;

#[derive(Debug, Deserialize)]
pub struct CostBasisQuery {
    pub method: Option<CostBasisMethod>,
    pub year: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct SummaryQuery {
    pub method: Option<CostBasisMethod>,
}

/// GET /api/v1/portfolios/:id/cost-basis?method=fifo&year=2024
pub async fn cost_basis(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(portfolio_id): Path<String>,
    Query(query): Query<CostBasisQuery>,
) -> AppResult<Json<costbasis::CostBasisResult>> {
    // Verify ownership
    let conn = state.db.get()?;
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM portfolios WHERE id = ?1 AND user_id = ?2)",
        rusqlite::params![portfolio_id, user.id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(crate::error::AppError::NotFound("Portfolio not found".into()));
    }
    drop(conn);

    let method = query.method.unwrap_or_default();
    let result = costbasis::calculate_cost_basis(&state.db, &portfolio_id, method, query.year)?;

    Ok(Json(result))
}

/// GET /api/v1/portfolios/:id/summary?method=fifo
pub async fn summary(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(portfolio_id): Path<String>,
    Query(query): Query<SummaryQuery>,
) -> AppResult<Json<costbasis::PortfolioSummary>> {
    // Verify ownership
    let conn = state.db.get()?;
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM portfolios WHERE id = ?1 AND user_id = ?2)",
        rusqlite::params![portfolio_id, user.id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(crate::error::AppError::NotFound("Portfolio not found".into()));
    }
    drop(conn);

    // Get current BTC price
    let current_price = prices::fetch_current_price(
        &state.config.coingecko_api_url,
        "usd",
    )
    .await
    .unwrap_or(0.0);

    let method = query.method.unwrap_or_default();
    let result = costbasis::portfolio_summary(&state.db, &portfolio_id, current_price, method)?;

    Ok(Json(result))
}
