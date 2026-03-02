use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
pub struct FeeRates {
    #[serde(rename = "fastestFee")]
    pub fastest_fee: u32,
    #[serde(rename = "halfHourFee")]
    pub half_hour_fee: u32,
    #[serde(rename = "hourFee")]
    pub hour_fee: u32,
    #[serde(rename = "economyFee")]
    pub economy_fee: u32,
    #[serde(rename = "minimumFee")]
    pub minimum_fee: u32,
}

/// Fetch recommended fee rates from mempool.space.
pub async fn fetch_fee_rates() -> AppResult<FeeRates> {
    let client = Client::new();

    let rates: FeeRates = client
        .get("https://mempool.space/api/v1/fees/recommended")
        .header("Accept", "application/json")
        .header("User-Agent", "opacore/0.1")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("mempool.space request failed: {e}")))?
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("mempool.space parse failed: {e}")))?;

    Ok(rates)
}
