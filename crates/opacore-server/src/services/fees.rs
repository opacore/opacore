use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeRates {
    pub fastest_fee: u32,
    pub half_hour_fee: u32,
    pub hour_fee: u32,
    pub economy_fee: u32,
    pub minimum_fee: u32,
}

/// Fetch current recommended fee rates from mempool.space.
pub async fn fetch_fee_rates() -> AppResult<FeeRates> {
    let client = Client::builder()
        .user_agent("opacore/0.1")
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {e}")))?;

    let resp: FeeRates = client
        .get("https://mempool.space/api/v1/fees/recommended")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("mempool.space request failed: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("mempool.space response parse failed: {e}")))?;

    Ok(resp)
}
