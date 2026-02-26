use bdk_esplora::EsploraAsyncExt;
use bdk_wallet::chain::ChainPosition;
use bdk_wallet::rusqlite::Connection as BdkConnection;
use bdk_wallet::PersistedWallet;
use esplora_client;

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
                (Some(height as i64), Some(anchor.confirmation_time.to_string()))
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
