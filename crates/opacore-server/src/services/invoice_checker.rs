use serde::Deserialize;
use crate::db::DbPool;
use crate::error::{AppError, AppResult};

#[derive(Debug, Deserialize)]
struct EsploraTx {
    txid: String,
    status: EsploraTxStatus,
    #[serde(default)]
    vout: Vec<EsploraVout>,
}

#[derive(Debug, Deserialize)]
struct EsploraTxStatus {
    #[serde(default)]
    confirmed: bool,
    #[serde(default)]
    block_time: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct EsploraVout {
    #[serde(default)]
    scriptpubkey_address: Option<String>,
    #[serde(default)]
    value: u64,
}

/// Check if a specific invoice has been paid by querying Esplora.
/// Returns true if payment was detected and the invoice was updated.
pub async fn check_invoice_payment(
    esplora_url: &str,
    pool: &DbPool,
    invoice_id: &str,
    btc_address: &str,
    amount_sat: i64,
) -> AppResult<bool> {
    let http = reqwest::Client::builder()
        .user_agent("opacore/0.1")
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {e}")))?;

    let url = format!("{esplora_url}/address/{btc_address}/txs");
    let resp = http
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        tracing::warn!("Esplora returned {status} for invoice check on {btc_address}: {body}");
        return Ok(false);
    }

    let txs: Vec<EsploraTx> = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora parse failed: {e}")))?;

    // Look for any transaction that pays to this address with sufficient amount
    for tx in &txs {
        let received: u64 = tx.vout.iter()
            .filter(|v| v.scriptpubkey_address.as_deref() == Some(btc_address))
            .map(|v| v.value)
            .sum();

        if received >= amount_sat as u64 {
            // Payment found — update invoice
            let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
            let conn = pool.get()?;
            conn.execute(
                "UPDATE invoices SET status = 'paid', paid_at = ?1, paid_txid = ?2, paid_amount_sat = ?3, updated_at = ?4 WHERE id = ?5 AND status != 'paid'",
                rusqlite::params![now, tx.txid, received as i64, now, invoice_id],
            )?;

            tracing::info!("Invoice {invoice_id} paid via txid {} ({} sats)", tx.txid, received);
            return Ok(true);
        }
    }

    Ok(false)
}

/// Background task that periodically checks pending invoices for payments.
pub async fn run_invoice_checker(pool: DbPool, esplora_url: String) {
    tracing::info!("Invoice checker background task started");

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;

        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

        // Get pending invoices (status = 'sent', not expired)
        let invoices_to_check: Vec<(String, String, i64)> = {
            let conn = match pool.get() {
                Ok(c) => c,
                Err(e) => {
                    tracing::error!("Invoice checker: failed to get DB connection: {e}");
                    continue;
                }
            };

            // Expire overdue invoices first
            if let Err(e) = conn.execute(
                "UPDATE invoices SET status = 'expired', updated_at = ?1 WHERE status = 'sent' AND expires_at IS NOT NULL AND expires_at < ?2",
                rusqlite::params![now, now],
            ) {
                tracing::error!("Invoice checker: failed to expire invoices: {e}");
            }

            // Fetch sent invoices to check for payment
            let mut stmt = match conn.prepare(
                "SELECT id, btc_address, amount_sat FROM invoices WHERE status = 'sent' LIMIT 10"
            ) {
                Ok(s) => s,
                Err(e) => {
                    tracing::error!("Invoice checker: failed to prepare query: {e}");
                    continue;
                }
            };

            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            });

            match rows {
                Ok(r) => r.filter_map(|r| r.ok()).collect(),
                Err(e) => {
                    tracing::error!("Invoice checker: failed to query invoices: {e}");
                    continue;
                }
            }
        };

        if invoices_to_check.is_empty() {
            continue;
        }

        tracing::debug!("Checking {} pending invoices for payment", invoices_to_check.len());

        for (invoice_id, btc_address, amount_sat) in &invoices_to_check {
            match check_invoice_payment(&esplora_url, &pool, invoice_id, btc_address, *amount_sat).await {
                Ok(true) => tracing::info!("Invoice {invoice_id} payment detected"),
                Ok(false) => {}
                Err(e) => tracing::warn!("Invoice {invoice_id} check failed: {e}"),
            }

            // Small delay between checks to avoid rate limiting
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
    }
}
