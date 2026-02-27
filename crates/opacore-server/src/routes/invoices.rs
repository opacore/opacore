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
use crate::services::invoice_checker;

#[derive(Debug, Serialize, Deserialize)]
pub struct Invoice {
    pub id: String,
    pub portfolio_id: String,
    pub invoice_number: String,
    pub customer_name: String,
    pub customer_email: Option<String>,
    pub description: Option<String>,
    pub amount_sat: i64,
    pub amount_fiat: Option<f64>,
    pub fiat_currency: String,
    pub btc_price_at_creation: Option<f64>,
    pub btc_address: String,
    pub wallet_id: Option<String>,
    pub status: String,
    pub share_token: String,
    pub issued_at: Option<String>,
    pub due_at: Option<String>,
    pub expires_at: Option<String>,
    pub paid_at: Option<String>,
    pub paid_txid: Option<String>,
    pub paid_amount_sat: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateInvoiceRequest {
    pub portfolio_id: String,
    pub invoice_number: String,
    pub customer_name: String,
    pub customer_email: Option<String>,
    pub description: Option<String>,
    pub amount_sat: i64,
    pub amount_fiat: Option<f64>,
    pub fiat_currency: Option<String>,
    pub btc_price_at_creation: Option<f64>,
    pub btc_address: String,
    pub wallet_id: Option<String>,
    pub due_at: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateInvoiceRequest {
    pub status: Option<String>,
    pub customer_name: Option<String>,
    pub customer_email: Option<String>,
    pub description: Option<String>,
    pub due_at: Option<String>,
    pub expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ListInvoicesQuery {
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Public-facing invoice data (no sensitive fields)
#[derive(Debug, Serialize)]
pub struct PublicInvoice {
    pub invoice_number: String,
    pub customer_name: String,
    pub description: Option<String>,
    pub amount_sat: i64,
    pub amount_fiat: Option<f64>,
    pub fiat_currency: String,
    pub btc_address: String,
    pub status: String,
    pub expires_at: Option<String>,
    pub paid_at: Option<String>,
    pub paid_txid: Option<String>,
    pub paid_amount_sat: Option<i64>,
}

const INVOICE_COLS: &str = "id, portfolio_id, invoice_number, customer_name, customer_email, description, amount_sat, amount_fiat, fiat_currency, btc_price_at_creation, btc_address, wallet_id, status, share_token, issued_at, due_at, expires_at, paid_at, paid_txid, paid_amount_sat, created_at, updated_at";

fn row_to_invoice(row: &rusqlite::Row) -> rusqlite::Result<Invoice> {
    Ok(Invoice {
        id: row.get(0)?,
        portfolio_id: row.get(1)?,
        invoice_number: row.get(2)?,
        customer_name: row.get(3)?,
        customer_email: row.get(4)?,
        description: row.get(5)?,
        amount_sat: row.get(6)?,
        amount_fiat: row.get(7)?,
        fiat_currency: row.get(8)?,
        btc_price_at_creation: row.get(9)?,
        btc_address: row.get(10)?,
        wallet_id: row.get(11)?,
        status: row.get(12)?,
        share_token: row.get(13)?,
        issued_at: row.get(14)?,
        due_at: row.get(15)?,
        expires_at: row.get(16)?,
        paid_at: row.get(17)?,
        paid_txid: row.get(18)?,
        paid_amount_sat: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
    })
}

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

/// GET /api/v1/portfolios/{portfolio_id}/invoices
pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(portfolio_id): Path<String>,
    Query(query): Query<ListInvoicesQuery>,
) -> AppResult<Json<Vec<Invoice>>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let limit = query.limit.unwrap_or(50).min(200);
    let offset = query.offset.unwrap_or(0);

    let mut where_clause = "WHERE portfolio_id = ?1".to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(portfolio_id)];

    if let Some(ref status) = query.status {
        params.push(Box::new(status.clone()));
        where_clause.push_str(&format!(" AND status = ?{}", params.len()));
    }

    params.push(Box::new(limit));
    let limit_idx = params.len();
    params.push(Box::new(offset));
    let offset_idx = params.len();

    let sql = format!(
        "SELECT {INVOICE_COLS} FROM invoices {where_clause} ORDER BY created_at DESC LIMIT ?{limit_idx} OFFSET ?{offset_idx}"
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
        row_to_invoice,
    )?;
    let data: Result<Vec<_>, _> = rows.collect();

    Ok(Json(data?))
}

/// POST /api/v1/invoices
pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(body): Json<CreateInvoiceRequest>,
) -> AppResult<(StatusCode, Json<Invoice>)> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &body.portfolio_id, &user.id)?;

    if body.invoice_number.is_empty() {
        return Err(AppError::BadRequest("Invoice number is required".into()));
    }
    if body.customer_name.is_empty() {
        return Err(AppError::BadRequest("Customer name is required".into()));
    }
    if body.btc_address.is_empty() {
        return Err(AppError::BadRequest("BTC address is required".into()));
    }
    if body.amount_sat <= 0 {
        return Err(AppError::BadRequest("Amount must be positive".into()));
    }

    let id = Uuid::new_v4().to_string();
    let share_token = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let fiat_currency = body.fiat_currency.as_deref().unwrap_or("usd");

    conn.execute(
        "INSERT INTO invoices (id, portfolio_id, invoice_number, customer_name, customer_email, description, amount_sat, amount_fiat, fiat_currency, btc_price_at_creation, btc_address, wallet_id, status, share_token, issued_at, due_at, expires_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'draft', ?13, ?14, ?15, ?16, ?17, ?18)",
        rusqlite::params![
            id, body.portfolio_id, body.invoice_number, body.customer_name,
            body.customer_email, body.description, body.amount_sat,
            body.amount_fiat, fiat_currency, body.btc_price_at_creation,
            body.btc_address, body.wallet_id, share_token,
            now, body.due_at, body.expires_at, now, now
        ],
    )?;

    let invoice = Invoice {
        id,
        portfolio_id: body.portfolio_id,
        invoice_number: body.invoice_number,
        customer_name: body.customer_name,
        customer_email: body.customer_email,
        description: body.description,
        amount_sat: body.amount_sat,
        amount_fiat: body.amount_fiat,
        fiat_currency: fiat_currency.to_string(),
        btc_price_at_creation: body.btc_price_at_creation,
        btc_address: body.btc_address,
        wallet_id: body.wallet_id,
        status: "draft".to_string(),
        share_token,
        issued_at: Some(now.clone()),
        due_at: body.due_at,
        expires_at: body.expires_at,
        paid_at: None,
        paid_txid: None,
        paid_amount_sat: None,
        created_at: now.clone(),
        updated_at: now,
    };

    Ok((StatusCode::CREATED, Json(invoice)))
}

/// GET /api/v1/portfolios/{portfolio_id}/invoices/{id}
pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, invoice_id)): Path<(String, String)>,
) -> AppResult<Json<Invoice>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let invoice = conn
        .query_row(
            &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1 AND portfolio_id = ?2"),
            rusqlite::params![invoice_id, portfolio_id],
            row_to_invoice,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("Invoice not found".into())
            }
            e => AppError::Database(e),
        })?;

    Ok(Json(invoice))
}

/// PUT /api/v1/portfolios/{portfolio_id}/invoices/{id}
pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, invoice_id)): Path<(String, String)>,
    Json(body): Json<UpdateInvoiceRequest>,
) -> AppResult<Json<Invoice>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let existing = conn
        .query_row(
            &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1 AND portfolio_id = ?2"),
            rusqlite::params![invoice_id, portfolio_id],
            row_to_invoice,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("Invoice not found".into())
            }
            e => AppError::Database(e),
        })?;

    // Validate status transitions
    if let Some(ref new_status) = body.status {
        let valid = ["draft", "sent", "paid", "expired", "cancelled"];
        if !valid.contains(&new_status.as_str()) {
            return Err(AppError::BadRequest(format!(
                "Invalid status. Must be one of: {}",
                valid.join(", ")
            )));
        }
    }

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let status = body.status.unwrap_or(existing.status);
    let customer_name = body.customer_name.unwrap_or(existing.customer_name);
    let customer_email = body.customer_email.or(existing.customer_email);
    let description = body.description.or(existing.description);
    let due_at = body.due_at.or(existing.due_at);
    let expires_at = body.expires_at.or(existing.expires_at);

    conn.execute(
        "UPDATE invoices SET status = ?1, customer_name = ?2, customer_email = ?3, description = ?4, due_at = ?5, expires_at = ?6, updated_at = ?7 WHERE id = ?8",
        rusqlite::params![status, customer_name, customer_email, description, due_at, expires_at, now, invoice_id],
    )?;

    Ok(Json(Invoice {
        id: invoice_id,
        portfolio_id,
        status,
        customer_name,
        customer_email,
        description,
        due_at,
        expires_at,
        updated_at: now,
        ..existing
    }))
}

/// DELETE /api/v1/portfolios/{portfolio_id}/invoices/{id}
pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, invoice_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let affected = conn.execute(
        "DELETE FROM invoices WHERE id = ?1 AND portfolio_id = ?2",
        rusqlite::params![invoice_id, portfolio_id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound("Invoice not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/portfolios/{portfolio_id}/invoices/{id}/check-payment
pub async fn check_payment(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, invoice_id)): Path<(String, String)>,
) -> AppResult<Json<Invoice>> {
    let conn = state.db.get()?;
    verify_portfolio_ownership(&conn, &portfolio_id, &user.id)?;

    let invoice = conn
        .query_row(
            &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1 AND portfolio_id = ?2"),
            rusqlite::params![invoice_id, portfolio_id],
            row_to_invoice,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("Invoice not found".into())
            }
            e => AppError::Database(e),
        })?;

    if invoice.status == "paid" {
        return Ok(Json(invoice));
    }

    // Check for payment on-chain
    let updated = invoice_checker::check_invoice_payment(
        &state.config.esplora_url,
        &state.db,
        &invoice.id,
        &invoice.btc_address,
        invoice.amount_sat,
    )
    .await?;

    if updated {
        // Re-fetch the updated invoice
        let invoice = conn
            .query_row(
                &format!("SELECT {INVOICE_COLS} FROM invoices WHERE id = ?1"),
                rusqlite::params![invoice_id],
                row_to_invoice,
            )?;
        Ok(Json(invoice))
    } else {
        Ok(Json(invoice))
    }
}

/// GET /api/v1/invoices/pay/{share_token} — Public endpoint (no auth)
pub async fn public_get(
    State(state): State<AppState>,
    Path(share_token): Path<String>,
) -> AppResult<Json<PublicInvoice>> {
    let conn = state.db.get()?;

    let invoice = conn
        .query_row(
            &format!("SELECT {INVOICE_COLS} FROM invoices WHERE share_token = ?1"),
            rusqlite::params![share_token],
            row_to_invoice,
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound("Invoice not found".into())
            }
            e => AppError::Database(e),
        })?;

    // Also trigger a payment check if status is 'sent'
    if invoice.status == "sent" {
        let _ = invoice_checker::check_invoice_payment(
            &state.config.esplora_url,
            &state.db,
            &invoice.id,
            &invoice.btc_address,
            invoice.amount_sat,
        )
        .await;

        // Re-fetch to get updated status
        let invoice = conn
            .query_row(
                &format!("SELECT {INVOICE_COLS} FROM invoices WHERE share_token = ?1"),
                rusqlite::params![share_token],
                row_to_invoice,
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    AppError::NotFound("Invoice not found".into())
                }
                e => AppError::Database(e),
            })?;

        return Ok(Json(PublicInvoice {
            invoice_number: invoice.invoice_number,
            customer_name: invoice.customer_name,
            description: invoice.description,
            amount_sat: invoice.amount_sat,
            amount_fiat: invoice.amount_fiat,
            fiat_currency: invoice.fiat_currency,
            btc_address: invoice.btc_address,
            status: invoice.status,
            expires_at: invoice.expires_at,
            paid_at: invoice.paid_at,
            paid_txid: invoice.paid_txid,
            paid_amount_sat: invoice.paid_amount_sat,
        }));
    }

    Ok(Json(PublicInvoice {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        description: invoice.description,
        amount_sat: invoice.amount_sat,
        amount_fiat: invoice.amount_fiat,
        fiat_currency: invoice.fiat_currency,
        btc_address: invoice.btc_address,
        status: invoice.status,
        expires_at: invoice.expires_at,
        paid_at: invoice.paid_at,
        paid_txid: invoice.paid_txid,
        paid_amount_sat: invoice.paid_amount_sat,
    }))
}
