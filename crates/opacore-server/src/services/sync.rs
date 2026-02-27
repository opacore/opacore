use bdk_esplora::EsploraAsyncExt;
use bdk_wallet::chain::ChainPosition;
use bdk_wallet::rusqlite::Connection as BdkConnection;
use bdk_wallet::PersistedWallet;
use esplora_client;
use serde::Deserialize;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};

const PARALLEL_REQUESTS: usize = 5;

#[derive(Debug, serde::Serialize)]
pub struct SyncResult {
    pub transactions_found: usize,
    pub new_transactions: usize,
    pub balance_sat: u64,
    pub last_sync_height: Option<u32>,
}

/// Run a full chain scan for a wallet and store discovered transactions
/// in the application database.
pub async fn full_scan(
    wallet: &mut PersistedWallet<BdkConnection>,
    bdk_conn: &mut BdkConnection,
    esplora_url: &str,
    stop_gap: usize,
    app_pool: &DbPool,
    app_wallet_id: &str,
    portfolio_id: &str,
) -> AppResult<SyncResult> {
    let client = esplora_client::Builder::new(esplora_url)
        .build_async()
        .map_err(|e| AppError::Internal(format!("Failed to build Esplora client: {e}")))?;

    tracing::info!("Starting full scan for wallet {app_wallet_id} via {esplora_url}");

    let request = wallet.start_full_scan().inspect({
        let wallet_id = app_wallet_id.to_string();
        let mut last_keychain = None;
        move |keychain, spk_i, _| {
            if last_keychain != Some(keychain) {
                tracing::debug!("Wallet {wallet_id}: scanning keychain {keychain:?}");
                last_keychain = Some(keychain);
            }
            if spk_i % 10 == 0 {
                tracing::debug!("Wallet {wallet_id}: keychain {keychain:?} index {spk_i}");
            }
        }
    });

    let update = client
        .full_scan(request, stop_gap, PARALLEL_REQUESTS)
        .await
        .map_err(|e| AppError::Internal(format!("Esplora full scan failed: {e}")))?;

    wallet.apply_update(update)
        .map_err(|e| AppError::Internal(format!("Failed to apply scan update: {e}")))?;

    wallet.persist(bdk_conn)
        .map_err(|e| AppError::Internal(format!("Failed to persist BDK wallet: {e}")))?;

    // Extract transactions and store in app DB
    let balance = wallet.balance();
    let txs: Vec<_> = wallet.transactions().collect();
    let total_txs = txs.len();

    let mut new_tx_count = 0;
    let mut max_height: Option<u32> = None;

    let app_conn = app_pool.get()?;

    for wallet_tx in &txs {
        let tx = &wallet_tx.tx_node.tx;
        let txid = tx.compute_txid().to_string();

        // Check if this transaction already exists in the app DB
        let exists: bool = app_conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM transactions WHERE txid = ?1 AND wallet_id = ?2)",
            rusqlite::params![txid, app_wallet_id],
            |row| row.get(0),
        )?;

        if exists {
            continue;
        }

        // Determine confirmation status
        let (block_height, block_time) = match &wallet_tx.chain_position {
            ChainPosition::Confirmed { anchor, .. } => {
                let height = anchor.block_id.height;
                if max_height.map_or(true, |h| height > h) {
                    max_height = Some(height);
                }
                (Some(height as i64), Some(
                    chrono::DateTime::from_timestamp(anchor.confirmation_time as i64, 0)
                        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
                        .unwrap_or_else(|| anchor.confirmation_time.to_string())
                ))
            }
            ChainPosition::Unconfirmed { .. } => (None, None),
        };

        // Calculate net amount for this wallet using sent_and_received
        let (sent, received) = wallet.sent_and_received(tx);
        let sent_sat = sent.to_sat() as i64;
        let received_sat = received.to_sat() as i64;

        let net_amount = received_sat - sent_sat;
        let (tx_type, amount_sat) = if net_amount >= 0 {
            ("receive", net_amount)
        } else {
            ("send", -net_amount)
        };

        // Calculate fee if we can
        let fee_sat: Option<i64> = wallet.calculate_fee(tx).ok().map(|f| f.to_sat() as i64);

        let tx_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();
        let transacted_at = block_time.as_deref().unwrap_or(&now);

        app_conn.execute(
            "INSERT INTO transactions (id, portfolio_id, wallet_id, tx_type, amount_sat, fee_sat, txid, block_height, block_time, source, transacted_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'chain', ?10, ?11, ?12)",
            rusqlite::params![
                tx_id, portfolio_id, app_wallet_id, tx_type,
                amount_sat, fee_sat, txid,
                block_height, block_time, transacted_at, now, now
            ],
        )?;

        new_tx_count += 1;
    }

    // Update wallet sync metadata in app DB
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();
    app_conn.execute(
        "UPDATE wallets SET last_synced_at = ?1, last_sync_height = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![now, max_height.map(|h| h as i64), now, app_wallet_id],
    )?;

    tracing::info!(
        "Wallet {app_wallet_id} sync complete: {} total txs, {} new, balance {} sats",
        total_txs, new_tx_count, balance.total().to_sat()
    );

    Ok(SyncResult {
        transactions_found: total_txs,
        new_transactions: new_tx_count,
        balance_sat: balance.total().to_sat(),
        last_sync_height: max_height,
    })
}

// ── Single address sync via Esplora REST API ──

// Esplora API response types — only capture fields we need,
// serde will silently ignore extra fields from the API.

#[derive(Debug, Deserialize)]
struct EsploraTx {
    txid: String,
    status: EsploraTxStatus,
    #[serde(default)]
    vin: Vec<EsploraVin>,
    #[serde(default)]
    vout: Vec<EsploraVout>,
    #[serde(default)]
    fee: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct EsploraTxStatus {
    #[serde(default)]
    confirmed: bool,
    #[serde(default)]
    block_height: Option<u64>,
    #[serde(default)]
    block_time: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct EsploraVin {
    #[serde(default)]
    prevout: Option<EsploraVout>,
}

#[derive(Debug, Deserialize)]
struct EsploraVout {
    #[serde(default)]
    scriptpubkey_address: Option<String>,
    #[serde(default)]
    value: u64,
}

#[derive(Debug, Deserialize)]
struct EsploraUtxo {
    txid: String,
    vout: u32,
    value: u64,
    status: EsploraTxStatus,
}

/// Sync a single address wallet by querying Esplora REST API directly
/// (BDK doesn't support addr() descriptors).
pub async fn address_sync(
    esplora_url: &str,
    address: &str,
    app_pool: &DbPool,
    app_wallet_id: &str,
    portfolio_id: &str,
) -> AppResult<SyncResult> {
    let http = reqwest::Client::builder()
        .user_agent("opacore/0.1")
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {e}")))?;

    tracing::info!("Starting address sync for {address} via {esplora_url}");

    let tx_url = format!("{esplora_url}/address/{address}/txs");
    tracing::debug!("Fetching transactions from {tx_url}");

    let tx_resp = http
        .get(&tx_url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora request failed for {tx_url}: {e}")))?;

    if !tx_resp.status().is_success() {
        let status = tx_resp.status();
        let body = tx_resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Esplora returned {status} for {tx_url}: {body}")));
    }

    let txs: Vec<EsploraTx> = tx_resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora response parse failed: {e}")))?;

    let utxo_url = format!("{esplora_url}/address/{address}/utxo");
    tracing::debug!("Fetching UTXOs from {utxo_url}");

    let utxo_resp = http
        .get(&utxo_url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora UTXO request failed for {utxo_url}: {e}")))?;

    if !utxo_resp.status().is_success() {
        let status = utxo_resp.status();
        let body = utxo_resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Esplora returned {status} for {utxo_url}: {body}")));
    }

    let utxos: Vec<EsploraUtxo> = utxo_resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora UTXO parse failed: {e}")))?;

    let balance_sat: u64 = utxos.iter().map(|u| u.value).sum();
    let total_txs = txs.len();
    let mut new_tx_count = 0;
    let mut max_height: Option<u32> = None;

    let app_conn = app_pool.get()?;

    for tx in &txs {
        // Skip if already exists
        let exists: bool = app_conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM transactions WHERE txid = ?1 AND wallet_id = ?2)",
            rusqlite::params![tx.txid, app_wallet_id],
            |row| row.get(0),
        )?;
        if exists {
            continue;
        }

        // Calculate received and sent for this address
        let received: u64 = tx.vout.iter()
            .filter(|v| v.scriptpubkey_address.as_deref() == Some(address))
            .map(|v| v.value)
            .sum();

        let sent: u64 = tx.vin.iter()
            .filter_map(|v| v.prevout.as_ref())
            .filter(|p| p.scriptpubkey_address.as_deref() == Some(address))
            .map(|p| p.value)
            .sum();

        let net = received as i64 - sent as i64;
        let (tx_type, amount_sat) = if net >= 0 {
            ("receive", net)
        } else {
            ("send", -net)
        };

        let (block_height, block_time) = if tx.status.confirmed {
            let h = tx.status.block_height.unwrap_or(0) as u32;
            if max_height.map_or(true, |mh| h > mh) {
                max_height = Some(h);
            }
            (
                Some(h as i64),
                tx.status.block_time.map(|t| {
                    chrono::DateTime::from_timestamp(t as i64, 0)
                        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
                        .unwrap_or_else(|| t.to_string())
                }),
            )
        } else {
            (None, None)
        };

        let tx_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let transacted_at = block_time.as_deref().unwrap_or(&now);

        app_conn.execute(
            "INSERT INTO transactions (id, portfolio_id, wallet_id, tx_type, amount_sat, fee_sat, txid, block_height, block_time, source, transacted_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'chain', ?10, ?11, ?12)",
            rusqlite::params![
                tx_id, portfolio_id, app_wallet_id, tx_type,
                amount_sat, tx.fee.map(|f| f as i64), tx.txid,
                block_height, block_time, transacted_at, now, now
            ],
        )?;

        new_tx_count += 1;
    }

    // Update wallet sync metadata
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    app_conn.execute(
        "UPDATE wallets SET last_synced_at = ?1, last_sync_height = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![now, max_height.map(|h| h as i64), now, app_wallet_id],
    )?;

    tracing::info!(
        "Address {address} sync complete: {} total txs, {} new, balance {} sats",
        total_txs, new_tx_count, balance_sat
    );

    Ok(SyncResult {
        transactions_found: total_txs,
        new_transactions: new_tx_count,
        balance_sat,
        last_sync_height: max_height,
    })
}

/// Fetch UTXOs for a single address via Esplora REST API.
/// Used by the get_utxos endpoint for address-type wallets.
pub async fn address_utxos(
    esplora_url: &str,
    address: &str,
) -> AppResult<Vec<super::wallet::UtxoInfo>> {
    let http = reqwest::Client::builder()
        .user_agent("opacore/0.1")
        .build()
        .map_err(|e| AppError::Internal(format!("Failed to build HTTP client: {e}")))?;

    let url = format!("{esplora_url}/address/{address}/utxo");
    let resp = http
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora UTXO request failed: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(AppError::Internal(format!("Esplora returned {status} for {url}: {body}")));
    }

    let utxos: Vec<EsploraUtxo> = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(format!("Esplora UTXO parse failed: {e}")))?;

    Ok(utxos
        .into_iter()
        .map(|u| super::wallet::UtxoInfo {
            txid: u.txid,
            vout: u.vout,
            value_sat: u.value,
            keychain: "external".to_string(),
        })
        .collect())
}
