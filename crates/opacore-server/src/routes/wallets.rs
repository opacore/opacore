use axum::{
    extract::{Path, State},
    Extension, Json,
};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::routes::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Wallet {
    pub id: String,
    pub portfolio_id: String,
    pub label: String,
    pub wallet_type: String,
    pub descriptor: Option<String>,
    pub xpub: Option<String>,
    pub address: Option<String>,
    pub network: String,
    pub derivation_path: Option<String>,
    pub gap_limit: i64,
    pub last_synced_at: Option<String>,
    pub last_sync_height: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub portfolio_id: String,
    pub label: String,
    pub wallet_type: Option<String>,
    pub descriptor: Option<String>,
    pub xpub: Option<String>,
    pub address: Option<String>,
    pub network: Option<String>,
    pub derivation_path: Option<String>,
    pub gap_limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWalletRequest {
    pub label: Option<String>,
    pub gap_limit: Option<i64>,
}

fn row_to_wallet(row: &rusqlite::Row) -> rusqlite::Result<Wallet> {
    Ok(Wallet {
        id: row.get(0)?,
        portfolio_id: row.get(1)?,
        label: row.get(2)?,
        wallet_type: row.get(3)?,
        descriptor: row.get(4)?,
        xpub: row.get(5)?,
        address: row.get(6)?,
        network: row.get(7)?,
        derivation_path: row.get(8)?,
        gap_limit: row.get(9)?,
        last_synced_at: row.get(10)?,
        last_sync_height: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

const WALLET_COLS: &str = "id, portfolio_id, label, wallet_type, descriptor, xpub, address, network, derivation_path, gap_limit, last_synced_at, last_sync_height, created_at, updated_at";

fn verify_portfolio_ownership(
    conn: &rusqlite::Connection,
    portfolio_id: &str,
    user_id: &str,
) -> AppResult<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM portfolios WHERE id = ?1 AND user_id = ?2)",
        rusqlite::params![portfolio_id, user_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("Portfolio not found".into()));
    }
    Ok(())
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(portfolio_id): Path<String>,
) -> AppResult<Json<Vec<Wallet>>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {WALLET_COLS} FROM wallets WHERE portfolio_id = ?1 ORDER BY created_at DESC"
    ))?;
    let rows = stmt.query_map(rusqlite::params![portfolio_id], row_to_wallet)?;
    let wallets: Result<Vec<_>, _> = rows.collect();
    Ok(Json(wallets?))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, wallet_id)): Path<(String, String)>,
) -> AppResult<Json<Wallet>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let wallet = conn
        .query_row(
            &format!("SELECT {WALLET_COLS} FROM wallets WHERE id = ?1 AND portfolio_id = ?2"),
            rusqlite::params![wallet_id, portfolio_id],
            row_to_wallet,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Wallet not found".into()),
            e => AppError::Database(e),
        })?;
    Ok(Json(wallet))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(body): Json<CreateWalletRequest>,
) -> AppResult<(StatusCode, Json<Wallet>)> {
    if body.label.is_empty() {
        return Err(AppError::BadRequest("Label is required".into()));
    }

    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &body.portfolio_id, &user.id)?;

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let wallet_type = body.wallet_type.as_deref().unwrap_or("descriptor");
    let network = body.network.as_deref().unwrap_or("bitcoin");
    let gap_limit = body.gap_limit.unwrap_or(20);

    conn.execute(
        "INSERT INTO wallets (id, portfolio_id, label, wallet_type, descriptor, xpub, address, network, derivation_path, gap_limit, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        rusqlite::params![
            id, body.portfolio_id, body.label, wallet_type,
            body.descriptor, body.xpub, body.address, network,
            body.derivation_path, gap_limit, now, now
        ],
    )?;

    let wallet = Wallet {
        id,
        portfolio_id: body.portfolio_id,
        label: body.label,
        wallet_type: wallet_type.to_string(),
        descriptor: body.descriptor,
        xpub: body.xpub,
        address: body.address,
        network: network.to_string(),
        derivation_path: body.derivation_path,
        gap_limit,
        last_synced_at: None,
        last_sync_height: None,
        created_at: now.clone(),
        updated_at: now,
    };

    Ok((StatusCode::CREATED, Json(wallet)))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, wallet_id)): Path<(String, String)>,
    Json(body): Json<UpdateWalletRequest>,
) -> AppResult<Json<Wallet>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let existing = conn
        .query_row(
            &format!("SELECT {WALLET_COLS} FROM wallets WHERE id = ?1 AND portfolio_id = ?2"),
            rusqlite::params![wallet_id, portfolio_id],
            row_to_wallet,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Wallet not found".into()),
            e => AppError::Database(e),
        })?;

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let label = body.label.unwrap_or(existing.label);
    let gap_limit = body.gap_limit.unwrap_or(existing.gap_limit);

    conn.execute(
        "UPDATE wallets SET label = ?1, gap_limit = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![label, gap_limit, now, wallet_id],
    )?;

    Ok(Json(Wallet {
        id: wallet_id,
        portfolio_id,
        label,
        gap_limit,
        updated_at: now,
        ..existing
    }))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, wallet_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let affected = conn.execute(
        "DELETE FROM wallets WHERE id = ?1 AND portfolio_id = ?2",
        rusqlite::params![wallet_id, portfolio_id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound("Wallet not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
