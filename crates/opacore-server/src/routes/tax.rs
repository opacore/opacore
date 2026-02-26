use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Extension, Json,
};
use serde::Deserialize;

use crate::error::AppResult;
use crate::models::User;
use crate::routes::AppState;
use crate::services::costbasis::CostBasisMethod;
use crate::services::tax;

#[derive(Debug, Deserialize)]
pub struct TaxQuery {
    pub year: i32,
    pub method: Option<CostBasisMethod>,
}

/// GET /api/v1/portfolios/:id/tax/report?year=2024&method=fifo
pub async fn tax_report(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(portfolio_id): Path<String>,
    Query(query): Query<TaxQuery>,
) -> AppResult<Json<tax::TaxReport>> {
    verify_portfolio_ownership(&state, &user, &portfolio_id)?;

    let method = query.method.unwrap_or_default();
    let report = tax::generate_tax_report(&state.db, &portfolio_id, query.year, method)?;

    Ok(Json(report))
}

/// GET /api/v1/portfolios/:id/tax/csv?year=2024&method=fifo
pub async fn tax_csv(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(portfolio_id): Path<String>,
    Query(query): Query<TaxQuery>,
) -> AppResult<impl IntoResponse> {
    verify_portfolio_ownership(&state, &user, &portfolio_id)?;

    let method = query.method.unwrap_or_default();
    let csv = tax::generate_form_8949_csv(&state.db, &portfolio_id, query.year, method)?;

    let filename = format!("form_8949_{}_{}.csv", query.year, method_name(method));

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        csv,
    ))
}

fn verify_portfolio_ownership(state: &AppState, user: &User, portfolio_id: &str) -> AppResult<()> {
    let conn = state.db.get()?;
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM portfolios WHERE id = ?1 AND user_id = ?2)",
        rusqlite::params![portfolio_id, user.id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(crate::error::AppError::NotFound(
            "Portfolio not found".into(),
        ));
    }
    Ok(())
}

fn method_name(method: CostBasisMethod) -> &'static str {
    match method {
        CostBasisMethod::Fifo => "fifo",
        CostBasisMethod::Lifo => "lifo",
        CostBasisMethod::Hifo => "hifo",
    }
}
