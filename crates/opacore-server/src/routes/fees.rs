use axum::{extract::State, Extension, Json};

use crate::error::AppResult;
use crate::models::User;
use crate::routes::AppState;
use crate::services::fees;

/// GET /api/v1/fees/recommended
pub async fn recommended(
    State(_state): State<AppState>,
    Extension(_user): Extension<User>,
) -> AppResult<Json<fees::FeeRates>> {
    let rates = fees::fetch_fee_rates().await?;
    Ok(Json(rates))
}
