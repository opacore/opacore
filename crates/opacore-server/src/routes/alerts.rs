use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::routes::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Alert {
    pub id: String,
    pub user_id: String,
    pub alert_type: String,
    pub threshold_usd: Option<f64>,
    pub portfolio_id: Option<String>,
    pub wallet_id: Option<String>,
    pub label: Option<String>,
    pub is_active: bool,
    pub last_triggered_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAlertRequest {
    pub alert_type: String,
    pub threshold_usd: Option<f64>,
    pub portfolio_id: Option<String>,
    pub wallet_id: Option<String>,
    pub label: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAlertRequest {
    pub is_active: Option<bool>,
    pub threshold_usd: Option<f64>,
    pub label: Option<String>,
}

const ALERT_COLS: &str =
    "id, user_id, alert_type, threshold_usd, portfolio_id, wallet_id, label, is_active, last_triggered_at, created_at, updated_at";

fn row_to_alert(row: &rusqlite::Row) -> rusqlite::Result<Alert> {
    Ok(Alert {
        id: row.get(0)?,
        user_id: row.get(1)?,
        alert_type: row.get(2)?,
        threshold_usd: row.get(3)?,
        portfolio_id: row.get(4)?,
        wallet_id: row.get(5)?,
        label: row.get(6)?,
        is_active: row.get::<_, i32>(7).map(|v| v != 0)?,
        last_triggered_at: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// GET /api/v1/alerts
pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> AppResult<Json<Vec<Alert>>> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT {ALERT_COLS} FROM alerts WHERE user_id = ?1 ORDER BY created_at DESC"
    ))?;
    let rows = stmt.query_map(rusqlite::params![user.id], row_to_alert)?;
    let data: Result<Vec<_>, _> = rows.collect();
    Ok(Json(data?))
}

/// POST /api/v1/alerts
pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(body): Json<CreateAlertRequest>,
) -> AppResult<(StatusCode, Json<Alert>)> {
    let valid_types = ["price_above", "price_below", "balance_change"];
    if !valid_types.contains(&body.alert_type.as_str()) {
        return Err(AppError::BadRequest(
            "alert_type must be 'price_above', 'price_below', or 'balance_change'".into(),
        ));
    }

    match body.alert_type.as_str() {
        "price_above" | "price_below" => {
            let threshold = body.threshold_usd.unwrap_or(0.0);
            if threshold <= 0.0 {
                return Err(AppError::BadRequest(
                    "threshold_usd must be a positive number for price alerts".into(),
                ));
            }
        }
        "balance_change" => {
            if body.wallet_id.is_none() && body.portfolio_id.is_none() {
                return Err(AppError::BadRequest(
                    "balance_change alerts require wallet_id or portfolio_id".into(),
                ));
            }
        }
        _ => {}
    }

    let conn = state.db.get()?;

    if let Some(ref portfolio_id) = body.portfolio_id {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM portfolios WHERE id = ?1 AND user_id = ?2)",
            rusqlite::params![portfolio_id, user.id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound("Portfolio not found".into()));
        }
    }

    if let Some(ref wallet_id) = body.wallet_id {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(
                SELECT 1 FROM wallets w
                JOIN portfolios p ON p.id = w.portfolio_id
                WHERE w.id = ?1 AND p.user_id = ?2
             )",
            rusqlite::params![wallet_id, user.id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound("Wallet not found".into()));
        }
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    // Set last_triggered_at to now for balance alerts to avoid emailing on historical txs
    let last_triggered_at = if body.alert_type == "balance_change" {
        Some(now.clone())
    } else {
        None
    };

    conn.execute(
        "INSERT INTO alerts (id, user_id, alert_type, threshold_usd, portfolio_id, wallet_id, label, is_active, last_triggered_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?10)",
        rusqlite::params![
            id, user.id, body.alert_type, body.threshold_usd,
            body.portfolio_id, body.wallet_id, body.label,
            last_triggered_at, now, now
        ],
    )?;

    let alert = Alert {
        id,
        user_id: user.id,
        alert_type: body.alert_type,
        threshold_usd: body.threshold_usd,
        portfolio_id: body.portfolio_id,
        wallet_id: body.wallet_id,
        label: body.label,
        is_active: true,
        last_triggered_at,
        created_at: now.clone(),
        updated_at: now,
    };

    Ok((StatusCode::CREATED, Json(alert)))
}

/// PUT /api/v1/alerts/{id}
pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(alert_id): Path<String>,
    Json(body): Json<UpdateAlertRequest>,
) -> AppResult<Json<Alert>> {
    let conn = state.db.get()?;

    let existing = conn
        .query_row(
            &format!("SELECT {ALERT_COLS} FROM alerts WHERE id = ?1 AND user_id = ?2"),
            rusqlite::params![alert_id, user.id],
            row_to_alert,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Alert not found".into()),
            e => AppError::Database(e),
        })?;

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let is_active = body.is_active.unwrap_or(existing.is_active);
    let is_active_int: i32 = if is_active { 1 } else { 0 };
    let threshold_usd = body.threshold_usd.or(existing.threshold_usd);
    let label = body.label.or(existing.label.clone());

    conn.execute(
        "UPDATE alerts SET is_active = ?1, threshold_usd = ?2, label = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![is_active_int, threshold_usd, label, now, alert_id],
    )?;

    Ok(Json(Alert {
        id: alert_id,
        is_active,
        threshold_usd,
        label,
        updated_at: now,
        ..existing
    }))
}

/// DELETE /api/v1/alerts/{id}
pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(alert_id): Path<String>,
) -> AppResult<StatusCode> {
    let conn = state.db.get()?;

    let affected = conn.execute(
        "DELETE FROM alerts WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![alert_id, user.id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound("Alert not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
