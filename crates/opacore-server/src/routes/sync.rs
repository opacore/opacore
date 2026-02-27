use axum::{
    extract::{Path, State},
    Extension, Json,
};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::routes::AppState;
use crate::services::{sync, wallet as wallet_svc};

#[derive(Debug, Deserialize)]
pub struct SyncRequest {
    pub gap_limit: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct SyncResponse {
    pub transactions_found: usize,
    pub new_transactions: usize,
    pub balance_sat: u64,
    pub last_sync_height: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct AddressesResponse {
    pub addresses: Vec<wallet_svc::AddressInfo>,
}

#[derive(Debug, Serialize)]
pub struct UtxosResponse {
    pub utxos: Vec<wallet_svc::UtxoInfo>,
    pub total_sat: u64,
}

/// POST /api/v1/portfolios/:portfolio_id/wallets/:wallet_id/sync
pub async fn sync_wallet(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, wallet_id)): Path<(String, String)>,
    Json(body): Json<SyncRequest>,
) -> AppResult<Json<SyncResponse>> {
    let conn = state.db.get()?;

    // Verify ownership
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM wallets w JOIN portfolios p ON p.id = w.portfolio_id WHERE w.id = ?1 AND p.user_id = ?2)",
        rusqlite::params![wallet_id, user.id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("Wallet not found".into()));
    }

    // Get wallet details from app DB
    let (descriptor, xpub, derivation_path, address, network_str, wallet_type, gap_limit_db): (
        Option<String>, Option<String>, Option<String>, Option<String>, String, String, i64,
    ) = conn.query_row(
        "SELECT descriptor, xpub, derivation_path, address, network, wallet_type, gap_limit FROM wallets WHERE id = ?1",
        rusqlite::params![wallet_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
    )?;

    let network = wallet_svc::parse_network(&network_str)?;

    // Use correct Esplora URL based on network
    let esplora_url = match network {
        bdk_wallet::bitcoin::Network::Testnet => {
            state.config.esplora_url.replace("/api", "/testnet/api")
        }
        bdk_wallet::bitcoin::Network::Signet => {
            state.config.esplora_url.replace("/api", "/signet/api")
        }
        _ => state.config.esplora_url.clone(),
    };

    // For single address wallets, use direct Esplora API (BDK doesn't support addr() descriptors)
    let result = if wallet_type == "address" {
        let addr = address.as_deref().ok_or_else(|| {
            AppError::BadRequest("Address wallet missing address field".into())
        })?;
        sync::address_sync(&esplora_url, addr, &state.db, &wallet_id, &portfolio_id).await?
    } else {
        // Build descriptors for xpub/descriptor wallets
        let (external_desc, internal_desc) = wallet_svc::build_descriptors(
            descriptor.as_deref(),
            xpub.as_deref(),
            derivation_path.as_deref(),
            address.as_deref(),
        )?;

        let gap_limit = body.gap_limit.unwrap_or(gap_limit_db as usize);

        // Load or create BDK wallet
        let (mut bdk_wallet, mut bdk_conn) = wallet_svc::load_or_create_bdk_wallet(
            &state.config.bdk_wallets_dir,
            &wallet_id,
            &external_desc,
            &internal_desc,
            network,
        )?;

        // Run the full scan
        sync::full_scan(
            &mut bdk_wallet,
            &mut bdk_conn,
            &esplora_url,
            gap_limit,
            &state.db,
            &wallet_id,
            &portfolio_id,
        )
        .await?
    };

    Ok(Json(SyncResponse {
        transactions_found: result.transactions_found,
        new_transactions: result.new_transactions,
        balance_sat: result.balance_sat,
        last_sync_height: result.last_sync_height,
    }))
}

/// GET /api/v1/portfolios/:portfolio_id/wallets/:wallet_id/addresses
pub async fn get_addresses(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, wallet_id)): Path<(String, String)>,
) -> AppResult<Json<AddressesResponse>> {
    let conn = state.db.get()?;

    // Verify ownership
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM wallets w JOIN portfolios p ON p.id = w.portfolio_id WHERE w.id = ?1 AND p.user_id = ?2 AND w.portfolio_id = ?3)",
        rusqlite::params![wallet_id, user.id, portfolio_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("Wallet not found".into()));
    }

    let (descriptor, xpub, derivation_path, address, network_str, wallet_type, gap_limit): (
        Option<String>, Option<String>, Option<String>, Option<String>, String, String, i64,
    ) = conn.query_row(
        "SELECT descriptor, xpub, derivation_path, address, network, wallet_type, gap_limit FROM wallets WHERE id = ?1",
        rusqlite::params![wallet_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?, row.get(6)?)),
    )?;

    // For single address wallets, just return the address directly (no BDK)
    if wallet_type == "address" {
        let addresses = if let Some(addr) = address {
            vec![wallet_svc::AddressInfo {
                index: 0,
                address: addr,
                keychain: "external".to_string(),
            }]
        } else {
            vec![]
        };
        return Ok(Json(AddressesResponse { addresses }));
    }

    let (external_desc, internal_desc) = wallet_svc::build_descriptors(
        descriptor.as_deref(),
        xpub.as_deref(),
        derivation_path.as_deref(),
        address.as_deref(),
    )?;

    let network = wallet_svc::parse_network(&network_str)?;

    let (bdk_wallet, _bdk_conn) = wallet_svc::load_or_create_bdk_wallet(
        &state.config.bdk_wallets_dir,
        &wallet_id,
        &external_desc,
        &internal_desc,
        network,
    )?;

    let addresses = wallet_svc::get_wallet_addresses(&bdk_wallet, gap_limit as u32);

    Ok(Json(AddressesResponse { addresses }))
}

/// GET /api/v1/portfolios/:portfolio_id/wallets/:wallet_id/utxos
pub async fn get_utxos(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path((portfolio_id, wallet_id)): Path<(String, String)>,
) -> AppResult<Json<UtxosResponse>> {
    let conn = state.db.get()?;

    // Verify ownership
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM wallets w JOIN portfolios p ON p.id = w.portfolio_id WHERE w.id = ?1 AND p.user_id = ?2 AND w.portfolio_id = ?3)",
        rusqlite::params![wallet_id, user.id, portfolio_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("Wallet not found".into()));
    }

    let (descriptor, xpub, derivation_path, address, network_str, wallet_type): (
        Option<String>, Option<String>, Option<String>, Option<String>, String, String,
    ) = conn.query_row(
        "SELECT descriptor, xpub, derivation_path, address, network, wallet_type FROM wallets WHERE id = ?1",
        rusqlite::params![wallet_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
    )?;

    // For single address wallets, fetch UTXOs from Esplora directly (no BDK)
    if wallet_type == "address" {
        let addr = address.as_deref().ok_or_else(|| {
            AppError::BadRequest("Address wallet missing address field".into())
        })?;

        let network = wallet_svc::parse_network(&network_str)?;
        let esplora_url = match network {
            bdk_wallet::bitcoin::Network::Testnet => {
                state.config.esplora_url.replace("/api", "/testnet/api")
            }
            bdk_wallet::bitcoin::Network::Signet => {
                state.config.esplora_url.replace("/api", "/signet/api")
            }
            _ => state.config.esplora_url.clone(),
        };

        let utxos = sync::address_utxos(&esplora_url, addr).await?;
        let total_sat: u64 = utxos.iter().map(|u| u.value_sat).sum();

        return Ok(Json(UtxosResponse { utxos, total_sat }));
    }

    let (external_desc, internal_desc) = wallet_svc::build_descriptors(
        descriptor.as_deref(),
        xpub.as_deref(),
        derivation_path.as_deref(),
        address.as_deref(),
    )?;

    let network = wallet_svc::parse_network(&network_str)?;

    let (bdk_wallet, _bdk_conn) = wallet_svc::load_or_create_bdk_wallet(
        &state.config.bdk_wallets_dir,
        &wallet_id,
        &external_desc,
        &internal_desc,
        network,
    )?;

    let utxos = wallet_svc::get_wallet_utxos(&bdk_wallet);
    let total_sat: u64 = utxos.iter().map(|u| u.value_sat).sum();

    Ok(Json(UtxosResponse { utxos, total_sat }))
}
