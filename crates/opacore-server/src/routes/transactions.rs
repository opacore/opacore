use axum::{
    extract::{Path, Query, State},
    Extension, Json,
};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::routes::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub portfolio_id: String,
    pub wallet_id: Option<String>,
    pub tx_type: String,
    pub amount_sat: i64,
    pub fee_sat: Option<i64>,
    pub price_usd: Option<f64>,
    pub fiat_amount: Option<f64>,
    pub fiat_currency: String,
    pub txid: Option<String>,
    pub block_height: Option<i64>,
    pub block_time: Option<String>,
    pub source: String,
    pub transacted_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransactionRequest {
    pub portfolio_id: String,
    pub wallet_id: Option<String>,
    pub tx_type: String,
    pub amount_sat: i64,
    pub fee_sat: Option<i64>,
    pub price_usd: Option<f64>,
    pub fiat_amount: Option<f64>,
    pub fiat_currency: Option<String>,
    pub txid: Option<String>,
    pub block_height: Option<i64>,
    pub block_time: Option<String>,
    pub source: Option<String>,
    pub transacted_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTransactionRequest {
    pub tx_type: Option<String>,
    pub amount_sat: Option<i64>,
    pub fee_sat: Option<i64>,
    pub price_usd: Option<f64>,
    pub fiat_amount: Option<f64>,
    pub fiat_currency: Option<String>,
    pub transacted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListTransactionsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub tx_type: Option<String>,
    pub wallet_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TransactionListResponse {
    pub data: Vec<Transaction>,
    pub total: i64,
}

fn row_to_transaction(row: &rusqlite::Row) -> rusqlite::Result<Transaction> {
    Ok(Transaction {
        id: row.get(0)?,
        portfolio_id: row.get(1)?,
        wallet_id: row.get(2)?,
        tx_type: row.get(3)?,
        amount_sat: row.get(4)?,
        fee_sat: row.get(5)?,
        price_usd: row.get(6)?,
        fiat_amount: row.get(7)?,
        fiat_currency: row.get(8)?,
        txid: row.get(9)?,
        block_height: row.get(10)?,
        block_time: row.get(11)?,
        source: row.get(12)?,
        transacted_at: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

const TX_COLS: &str = "id, portfolio_id, wallet_id, tx_type, amount_sat, fee_sat, price_usd, fiat_amount, fiat_currency, txid, block_height, block_time, source, transacted_at, created_at, updated_at";

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
    Query(query): Query<ListTransactionsQuery>,
) -> AppResult<Json<TransactionListResponse>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let limit = query.limit.unwrap_or(50).min(200);
    let offset = query.offset.unwrap_or(0);

    let mut where_clause = "WHERE portfolio_id = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(portfolio_id.clone())];

    if let Some(ref tx_type) = query.tx_type {
        params.push(Box::new(tx_type.clone()));
        where_clause.push_str(&format!(" AND tx_type = ?{}", params.len()));
    }
    if let Some(ref wallet_id) = query.wallet_id {
        params.push(Box::new(wallet_id.clone()));
        where_clause.push_str(&format!(" AND wallet_id = ?{}", params.len()));
    }

    let total: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM transactions {where_clause}"),
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        |row| row.get(0),
    )?;

    params.push(Box::new(limit));
    let limit_idx = params.len();
    params.push(Box::new(offset));
    let offset_idx = params.len();

    let sql = format!(
        "SELECT {TX_COLS} FROM transactions {where_clause} ORDER BY transacted_at DESC LIMIT ?{limit_idx} OFFSET ?{offset_idx}"
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        row_to_transaction,
    )?;
    let data: Result<Vec<_>, _> = rows.collect();

    Ok(Json(TransactionListResponse {
        data: data?,
        total,
    }))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, tx_id)): Path<(String, String)>,
) -> AppResult<Json<Transaction>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let tx = conn
        .query_row(
            &format!("SELECT {TX_COLS} FROM transactions WHERE id = ?1 AND portfolio_id = ?2"),
            rusqlite::params![tx_id, portfolio_id],
            row_to_transaction,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("Transaction not found".into())
            }
            e => AppError::Database(e),
        })?;

    Ok(Json(tx))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(body): Json<CreateTransactionRequest>,
) -> AppResult<(StatusCode, Json<Transaction>)> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &body.portfolio_id, &user.id)?;

    let valid_types = ["buy", "sell", "receive", "send", "transfer"];
    if !valid_types.contains(&body.tx_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid tx_type. Must be one of: {}",
            valid_types.join(", ")
        )));
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let fiat_currency = body.fiat_currency.as_deref().unwrap_or("usd");
    let source = body.source.as_deref().unwrap_or("manual");

    conn.execute(
        "INSERT INTO transactions (id, portfolio_id, wallet_id, tx_type, amount_sat, fee_sat, price_usd, fiat_amount, fiat_currency, txid, block_height, block_time, source, transacted_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        rusqlite::params![
            id, body.portfolio_id, body.wallet_id, body.tx_type,
            body.amount_sat, body.fee_sat, body.price_usd, body.fiat_amount,
            fiat_currency, body.txid, body.block_height, body.block_time,
            source, body.transacted_at, now, now
        ],
    )?;

    let tx = Transaction {
        id,
        portfolio_id: body.portfolio_id,
        wallet_id: body.wallet_id,
        tx_type: body.tx_type,
        amount_sat: body.amount_sat,
        fee_sat: body.fee_sat,
        price_usd: body.price_usd,
        fiat_amount: body.fiat_amount,
        fiat_currency: fiat_currency.to_string(),
        txid: body.txid,
        block_height: body.block_height,
        block_time: body.block_time,
        source: source.to_string(),
        transacted_at: body.transacted_at,
        created_at: now.clone(),
        updated_at: now,
    };

    Ok((StatusCode::CREATED, Json(tx)))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, tx_id)): Path<(String, String)>,
    Json(body): Json<UpdateTransactionRequest>,
) -> AppResult<Json<Transaction>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let existing = conn
        .query_row(
            &format!("SELECT {TX_COLS} FROM transactions WHERE id = ?1 AND portfolio_id = ?2"),
            rusqlite::params![tx_id, portfolio_id],
            row_to_transaction,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("Transaction not found".into())
            }
            e => AppError::Database(e),
        })?;

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let tx_type = body.tx_type.unwrap_or(existing.tx_type);
    let amount_sat = body.amount_sat.unwrap_or(existing.amount_sat);
    let fee_sat = body.fee_sat.or(existing.fee_sat);
    let price_usd = body.price_usd.or(existing.price_usd);
    let fiat_amount = body.fiat_amount.or(existing.fiat_amount);
    let fiat_currency = body.fiat_currency.unwrap_or(existing.fiat_currency);
    let transacted_at = body.transacted_at.unwrap_or(existing.transacted_at);

    conn.execute(
        "UPDATE transactions SET tx_type = ?1, amount_sat = ?2, fee_sat = ?3, price_usd = ?4, fiat_amount = ?5, fiat_currency = ?6, transacted_at = ?7, updated_at = ?8 WHERE id = ?9",
        rusqlite::params![tx_type, amount_sat, fee_sat, price_usd, fiat_amount, fiat_currency, transacted_at, now, tx_id],
    )?;

    Ok(Json(Transaction {
        id: tx_id,
        portfolio_id,
        tx_type,
        amount_sat,
        fee_sat,
        price_usd,
        fiat_amount,
        fiat_currency,
        transacted_at,
        updated_at: now,
        ..existing
    }))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, tx_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let affected = conn.execute(
        "DELETE FROM transactions WHERE id = ?1 AND portfolio_id = ?2",
        rusqlite::params![tx_id, portfolio_id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound("Transaction not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
