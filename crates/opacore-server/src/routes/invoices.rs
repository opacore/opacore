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
    #[serde(rename = "type")]
    pub record_type: String,
    pub reusable: bool,
    pub invoice_number: Option<String>,
    pub customer_name: Option<String>,
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
    #[serde(rename = "type")]
    pub record_type: Option<String>,
    pub reusable: Option<bool>,
    pub invoice_number: Option<String>,
    pub customer_name: Option<String>,
    pub customer_email: Option<String>,
    pub description: Option<String>,
    pub amount_sat: Option<i64>,
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
    #[serde(rename = "type")]
    pub record_type: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Public-facing invoice data (no sensitive fields)
#[derive(Debug, Serialize)]
pub struct PublicInvoice {
    #[serde(rename = "type")]
    pub record_type: String,
    pub reusable: bool,
    pub invoice_number: Option<String>,
    pub customer_name: Option<String>,
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

const INVOICE_COLS: &str = "id, portfolio_id, type, reusable, invoice_number, customer_name, customer_email, description, amount_sat, amount_fiat, fiat_currency, btc_price_at_creation, btc_address, wallet_id, status, share_token, issued_at, due_at, expires_at, paid_at, paid_txid, paid_amount_sat, created_at, updated_at";

fn row_to_invoice(row: &rusqlite::Row) -> rusqlite::Result<Invoice> {
    Ok(Invoice {
        id: row.get(0)?,
        portfolio_id: row.get(1)?,
        record_type: row.get(2)?,
        reusable: row.get::<_, i32>(3).map(|v| v != 0)?,
        invoice_number: row.get(4)?,
        customer_name: row.get(5)?,
        customer_email: row.get(6)?,
        description: row.get(7)?,
        amount_sat: row.get(8)?,
        amount_fiat: row.get(9)?,
        fiat_currency: row.get(10)?,
        btc_price_at_creation: row.get(11)?,
        btc_address: row.get(12)?,
        wallet_id: row.get(13)?,
        status: row.get(14)?,
        share_token: row.get(15)?,
        issued_at: row.get(16)?,
        due_at: row.get(17)?,
        expires_at: row.get(18)?,
        paid_at: row.get(19)?,
        paid_txid: row.get(20)?,
        paid_amount_sat: row.get(21)?,
        created_at: row.get(22)?,
        updated_at: row.get(23)?,
    })
}

fn invoice_to_public(invoice: &Invoice) -> PublicInvoice {
    PublicInvoice {
        record_type: invoice.record_type.clone(),
        reusable: invoice.reusable,
        invoice_number: invoice.invoice_number.clone(),
        customer_name: invoice.customer_name.clone(),
        description: invoice.description.clone(),
        amount_sat: invoice.amount_sat,
        amount_fiat: invoice.amount_fiat,
        fiat_currency: invoice.fiat_currency.clone(),
        btc_address: invoice.btc_address.clone(),
        status: invoice.status.clone(),
        expires_at: invoice.expires_at.clone(),
        paid_at: invoice.paid_at.clone(),
        paid_txid: invoice.paid_txid.clone(),
        paid_amount_sat: invoice.paid_amount_sat,
    }
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

    if let Some(ref record_type) = query.record_type {
        params.push(Box::new(record_type.clone()));
        where_clause.push_str(&format!(" AND type = ?{}", params.len()));
    }

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

    let record_type = body.record_type.as_deref().unwrap_or("invoice");
    let reusable = body.reusable.unwrap_or(false);

    // Type-specific validation
    match record_type {
        "invoice" => {
            let inv_num = body.invoice_number.as_deref().unwrap_or("");
            if inv_num.is_empty() {
                return Err(AppError::BadRequest("Invoice number is required".into()));
            }
            let cust_name = body.customer_name.as_deref().unwrap_or("");
            if cust_name.is_empty() {
                return Err(AppError::BadRequest("Customer name is required".into()));
            }
            if body.amount_sat.unwrap_or(0) <= 0 {
                return Err(AppError::BadRequest("Amount must be positive".into()));
            }
        }
        "payment_link" => {
            // Payment links only require btc_address (already required by struct)
        }
        _ => {
            return Err(AppError::BadRequest(
                "type must be 'invoice' or 'payment_link'".into(),
            ));
        }
    }

    if body.btc_address.is_empty() {
        return Err(AppError::BadRequest("BTC address is required".into()));
    }

    let id = Uuid::new_v4().to_string();
    let share_token = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let fiat_currency = body.fiat_currency.as_deref().unwrap_or("usd");
    let amount_sat = body.amount_sat.unwrap_or(0);
    let reusable_int: i32 = if reusable { 1 } else { 0 };

    conn.execute(
        "INSERT INTO invoices (id, portfolio_id, type, reusable, invoice_number, customer_name, customer_email, description, amount_sat, amount_fiat, fiat_currency, btc_price_at_creation, btc_address, wallet_id, status, share_token, issued_at, due_at, expires_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'draft', ?15, ?16, ?17, ?18, ?19, ?20)",
        rusqlite::params![
            id, body.portfolio_id, record_type, reusable_int,
            body.invoice_number, body.customer_name,
            body.customer_email, body.description, amount_sat,
            body.amount_fiat, fiat_currency, body.btc_price_at_creation,
            body.btc_address, body.wallet_id, share_token,
            now, body.due_at, body.expires_at, now, now
        ],
    )?;

    let invoice = Invoice {
        id,
        portfolio_id: body.portfolio_id,
        record_type: record_type.to_string(),
        reusable,
        invoice_number: body.invoice_number,
        customer_name: body.customer_name,
        customer_email: body.customer_email,
        description: body.description,
        amount_sat,
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
    let customer_name = body.customer_name.or(existing.customer_name);
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

    if invoice.status == "paid" && !invoice.reusable {
        return Ok(Json(invoice));
    }

    // Check for payment on-chain
    let updated = invoice_checker::check_invoice_payment(
        &state.config.esplora_url,
        &state.db,
        &invoice.id,
        &invoice.btc_address,
        invoice.amount_sat,
        invoice.reusable,
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
            invoice.reusable,
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

        return Ok(Json(invoice_to_public(&invoice)));
    }

    Ok(Json(invoice_to_public(&invoice)))
}
