use axum::{
    body::Bytes,
    extract::{Extension, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use hmac::{Hmac, Mac};
use serde::Serialize;
use sha2::Sha256;
use std::collections::HashMap;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::routes::AppState;

type HmacSha256 = Hmac<Sha256>;

// ── Public helper ──────────────────────────────────────────────────────────────

/// Returns true if the user has an active Pro subscription.
/// If billing is disabled (no STRIPE_SECRET_KEY), always returns true so
/// self-hosted instances get all features for free.
pub fn is_pro(pool: &DbPool, config: &crate::config::Config, user_id: &str) -> bool {
    if config.stripe_secret_key.is_none() {
        return true;
    }
    let conn = match pool.get() {
        Ok(c) => c,
        Err(_) => return false,
    };
    conn.query_row(
        "SELECT COUNT(*) FROM subscriptions
         WHERE user_id = ?1 AND plan = 'pro' AND status IN ('active', 'trialing')",
        rusqlite::params![user_id],
        |row| row.get::<_, i32>(0),
    )
    .map(|c| c > 0)
    .unwrap_or(false)
}

// ── Response types ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct BillingStatus {
    pub billing_enabled: bool,
    pub plan: String,
    pub status: String,
    pub current_period_end: Option<String>,
}

#[derive(Serialize)]
pub struct RedirectUrl {
    pub url: String,
}

// ── GET /api/v1/billing/status ─────────────────────────────────────────────────

pub async fn status(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> AppResult<Json<BillingStatus>> {

    if state.config.stripe_secret_key.is_none() {
        return Ok(Json(BillingStatus {
            billing_enabled: false,
            plan: "pro".to_string(),
            status: "active".to_string(),
            current_period_end: None,
        }));
    }

    let conn = state.db.get().map_err(AppError::Pool)?;
    let result = conn.query_row(
        "SELECT plan, status, current_period_end FROM subscriptions WHERE user_id = ?1",
        rusqlite::params![user.id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        },
    );

    match result {
        Ok((plan, sub_status, current_period_end)) => Ok(Json(BillingStatus {
            billing_enabled: true,
            plan,
            status: sub_status,
            current_period_end,
        })),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(Json(BillingStatus {
            billing_enabled: true,
            plan: "free".to_string(),
            status: "inactive".to_string(),
            current_period_end: None,
        })),
        Err(e) => Err(AppError::Database(e)),
    }
}

// ── POST /api/v1/billing/checkout ──────────────────────────────────────────────

pub async fn checkout(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> AppResult<Json<RedirectUrl>> {
    let secret_key = state
        .config
        .stripe_secret_key
        .as_deref()
        .ok_or_else(|| AppError::Internal("Billing not configured".to_string()))?;
    let price_id = state
        .config
        .stripe_price_id
        .as_deref()
        .ok_or_else(|| AppError::Internal("Stripe price not configured".to_string()))?;

    let http = reqwest::Client::new();

    // Get or create Stripe customer
    let stripe_customer_id = {
        let conn = state.db.get().map_err(AppError::Pool)?;
        let existing: Option<String> = conn
            .query_row(
                "SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?1",
                rusqlite::params![user.id],
                |row| row.get(0),
            )
            .ok();
        existing
    };

    let stripe_customer_id = match stripe_customer_id {
        Some(id) => id,
        None => {
            // Create customer in Stripe
            let mut params = HashMap::new();
            params.insert("email", user.email.clone());
            params.insert("metadata[user_id]", user.id.clone());

            let resp = http
                .post("https://api.stripe.com/v1/customers")
                .bearer_auth(secret_key)
                .form(&params)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("Stripe customer create failed: {e}")))?;

            if !resp.status().is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(AppError::Internal(format!("Stripe error: {body}")));
            }

            let data: serde_json::Value = resp
                .json()
                .await
                .map_err(|e| AppError::Internal(format!("Stripe response parse failed: {e}")))?;

            let customer_id = data["id"]
                .as_str()
                .ok_or_else(|| AppError::Internal("Missing customer id in Stripe response".to_string()))?
                .to_string();

            // Upsert subscription row with customer ID
            let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
            let sub_id = uuid::Uuid::new_v4().to_string();
            let conn = state.db.get().map_err(AppError::Pool)?;
            conn.execute(
                "INSERT INTO subscriptions (id, user_id, stripe_customer_id, plan, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'free', 'inactive', ?4, ?4)
                 ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, updated_at = ?4",
                rusqlite::params![sub_id, user.id, customer_id, now],
            )
            .map_err(AppError::Database)?;

            customer_id
        }
    };

    // Create Stripe Checkout Session
    let success_url = format!("{}/settings?billing=success", state.config.app_url);
    let cancel_url = format!("{}/settings?billing=canceled", state.config.app_url);

    let resp = http
        .post("https://api.stripe.com/v1/checkout/sessions")
        .bearer_auth(secret_key)
        .form(&[
            ("mode", "subscription"),
            ("customer", &stripe_customer_id),
            ("line_items[0][price]", price_id),
            ("line_items[0][quantity]", "1"),
            ("success_url", &success_url),
            ("cancel_url", &cancel_url),
            ("client_reference_id", &user.id),
        ])
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Stripe checkout create failed: {e}")))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Stripe error: {body}")));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Stripe response parse failed: {e}")))?;

    let url = data["url"]
        .as_str()
        .ok_or_else(|| AppError::Internal("Missing url in Stripe checkout response".to_string()))?
        .to_string();

    Ok(Json(RedirectUrl { url }))
}

// ── POST /api/v1/billing/portal ────────────────────────────────────────────────

pub async fn portal(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> AppResult<Json<RedirectUrl>> {
    let secret_key = state
        .config
        .stripe_secret_key
        .as_deref()
        .ok_or_else(|| AppError::Internal("Billing not configured".to_string()))?;

    let stripe_customer_id: String = {
        let conn = state.db.get().map_err(AppError::Pool)?;
        conn.query_row(
            "SELECT stripe_customer_id FROM subscriptions WHERE user_id = ?1",
            rusqlite::params![user.id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound("No billing account found".to_string()))?
    };

    let return_url = format!("{}/settings", state.config.app_url);

    let http = reqwest::Client::new();
    let resp = http
        .post("https://api.stripe.com/v1/billing_portal/sessions")
        .bearer_auth(secret_key)
        .form(&[("customer", &stripe_customer_id), ("return_url", &return_url)])
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Stripe portal create failed: {e}")))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Stripe error: {body}")));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Stripe response parse failed: {e}")))?;

    let url = data["url"]
        .as_str()
        .ok_or_else(|| AppError::Internal("Missing url in Stripe portal response".to_string()))?
        .to_string();

    Ok(Json(RedirectUrl { url }))
}

// ── POST /api/v1/webhooks/stripe ───────────────────────────────────────────────

pub async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, StatusCode> {
    let webhook_secret = match &state.config.stripe_webhook_secret {
        Some(s) => s.clone(),
        None => {
            tracing::warn!("Stripe webhook received but STRIPE_WEBHOOK_SECRET not set — ignoring");
            return Ok(StatusCode::OK);
        }
    };

    // ── 1. Verify signature ───────────────────────────────────────────────────
    let sig_header = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let (timestamp, expected_sig) = parse_stripe_signature(sig_header).ok_or(StatusCode::BAD_REQUEST)?;

    // Replay protection: reject if timestamp > 300s old
    let now_secs = chrono::Utc::now().timestamp();
    if (now_secs - timestamp).abs() > 300 {
        tracing::warn!("Stripe webhook rejected: timestamp too old ({timestamp})");
        return Err(StatusCode::BAD_REQUEST);
    }

    // Compute expected HMAC
    let signed_payload = format!("{}.{}", timestamp, String::from_utf8_lossy(&body));
    let mut mac = HmacSha256::new_from_slice(webhook_secret.as_bytes())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    mac.update(signed_payload.as_bytes());
    let computed = hex::encode(mac.finalize().into_bytes());

    if !constant_time_eq(&computed, &expected_sig) {
        tracing::warn!("Stripe webhook rejected: invalid signature");
        return Err(StatusCode::BAD_REQUEST);
    }

    // ── 2. Parse event ────────────────────────────────────────────────────────
    let event: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| StatusCode::BAD_REQUEST)?;

    let event_id = event["id"].as_str().unwrap_or("").to_string();
    let event_type = event["type"].as_str().unwrap_or("").to_string();

    if event_id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    // ── 3. Idempotency check ──────────────────────────────────────────────────
    {
        let conn = state.db.get().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let already_processed: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM stripe_events WHERE event_id = ?1",
                rusqlite::params![event_id],
                |row| row.get::<_, i32>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if already_processed {
            tracing::debug!("Stripe webhook event {event_id} already processed — skipping");
            return Ok(StatusCode::OK);
        }

        // Record before processing — prevents double-fire even on panic/crash recovery
        if let Err(e) = conn.execute(
            "INSERT OR IGNORE INTO stripe_events (event_id) VALUES (?1)",
            rusqlite::params![event_id],
        ) {
            tracing::error!("Failed to record stripe event {event_id}: {e}");
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    // ── 4. Handle event ───────────────────────────────────────────────────────
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    match event_type.as_str() {
        "checkout.session.completed" => {
            let obj = &event["data"]["object"];
            let user_id = obj["client_reference_id"].as_str().unwrap_or("");
            let customer_id = obj["customer"].as_str().unwrap_or("");
            let subscription_id = obj["subscription"].as_str().unwrap_or("");

            if user_id.is_empty() || customer_id.is_empty() {
                tracing::warn!("checkout.session.completed missing user/customer ids");
                return Ok(StatusCode::OK);
            }

            let conn = state.db.get().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let sub_id = uuid::Uuid::new_v4().to_string();
            if let Err(e) = conn.execute(
                "INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan, status, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'pro', 'active', ?5, ?5)
                 ON CONFLICT(user_id) DO UPDATE SET
                     stripe_customer_id      = excluded.stripe_customer_id,
                     stripe_subscription_id  = excluded.stripe_subscription_id,
                     plan                    = 'pro',
                     status                  = 'active',
                     updated_at              = ?5",
                rusqlite::params![sub_id, user_id, customer_id, subscription_id, now],
            ) {
                tracing::error!("Failed to upsert subscription on checkout: {e}");
            } else {
                tracing::info!("User {user_id} upgraded to Pro");
            }
        }

        "customer.subscription.updated" => {
            let obj = &event["data"]["object"];
            let subscription_id = obj["id"].as_str().unwrap_or("");
            let sub_status = obj["status"].as_str().unwrap_or("inactive");
            let period_end = obj["current_period_end"].as_i64().map(|ts| {
                chrono::DateTime::from_timestamp(ts, 0)
                    .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
                    .unwrap_or_default()
            });

            let conn = state.db.get().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            if let Err(e) = conn.execute(
                "UPDATE subscriptions SET status = ?1, current_period_end = ?2, updated_at = ?3
                 WHERE stripe_subscription_id = ?4",
                rusqlite::params![sub_status, period_end, now, subscription_id],
            ) {
                tracing::error!("Failed to update subscription {subscription_id}: {e}");
            }
        }

        "customer.subscription.deleted" => {
            let obj = &event["data"]["object"];
            let subscription_id = obj["id"].as_str().unwrap_or("");

            let conn = state.db.get().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            if let Err(e) = conn.execute(
                "UPDATE subscriptions SET plan = 'free', status = 'canceled', updated_at = ?1
                 WHERE stripe_subscription_id = ?2",
                rusqlite::params![now, subscription_id],
            ) {
                tracing::error!("Failed to cancel subscription {subscription_id}: {e}");
            } else {
                tracing::info!("Subscription {subscription_id} canceled");
            }
        }

        "invoice.payment_failed" => {
            let obj = &event["data"]["object"];
            let subscription_id = obj["subscription"].as_str().unwrap_or("");

            let conn = state.db.get().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            if let Err(e) = conn.execute(
                "UPDATE subscriptions SET status = 'past_due', updated_at = ?1
                 WHERE stripe_subscription_id = ?2",
                rusqlite::params![now, subscription_id],
            ) {
                tracing::error!("Failed to mark subscription {subscription_id} past_due: {e}");
            }
        }

        _ => {
            tracing::debug!("Stripe webhook event type '{event_type}' ignored");
        }
    }

    Ok(StatusCode::OK)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

fn parse_stripe_signature(header: &str) -> Option<(i64, String)> {
    let mut timestamp: Option<i64> = None;
    let mut signature: Option<String> = None;

    for part in header.split(',') {
        let part = part.trim();
        if let Some(t) = part.strip_prefix("t=") {
            timestamp = t.parse().ok();
        } else if let Some(s) = part.strip_prefix("v1=") {
            signature = Some(s.to_string());
        }
    }

    match (timestamp, signature) {
        (Some(t), Some(s)) => Some((t, s)),
        _ => None,
    }
}

/// Constant-time string comparison to prevent timing attacks.
fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0u8, |acc, (x, y)| acc | (x ^ y))
        == 0
}
