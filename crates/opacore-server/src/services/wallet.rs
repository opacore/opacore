use std::path::Path;

use bdk_wallet::bitcoin::Network;
use bdk_wallet::rusqlite::Connection as BdkConnection;
use bdk_wallet::{KeychainKind, PersistedWallet};

use crate::error::{AppError, AppResult};

/// Parse a network string into a BDK Network enum.
pub fn parse_network(network: &str) -> AppResult<Network> {
    match network {
        "bitcoin" | "mainnet" => Ok(Network::Bitcoin),
        "testnet" | "testnet3" => Ok(Network::Testnet),
        "signet" => Ok(Network::Signet),
        "regtest" => Ok(Network::Regtest),
        _ => Err(AppError::BadRequest(format!("Unknown network: {network}"))),
    }
}

/// Build a wpkh descriptor pair (external + internal) from an xpub.
///
/// If the user provides a full descriptor string, it's returned as-is for external,
/// and with /1/* for internal (change). If the user provides just an xpub with optional
/// fingerprint and derivation path, we construct wpkh descriptors.
pub fn build_descriptors(
    descriptor: Option<&str>,
    xpub: Option<&str>,
    derivation_path: Option<&str>,
) -> AppResult<(String, String)> {
    if let Some(desc) = descriptor {
        let external = desc.to_string();
        let internal = if external.contains("/0/*") {
            external.replace("/0/*", "/1/*")
        } else {
            external.clone()
        };
        return Ok((external, internal));
    }

    let xpub = xpub.ok_or_else(|| {
        AppError::BadRequest("Either descriptor or xpub must be provided".into())
    })?;

    let deriv_path = derivation_path.unwrap_or("84'/0'/0'");
    let fingerprint = "00000000";

    let external = format!("wpkh([{fingerprint}/{deriv_path}]{xpub}/0/*)");
    let internal = format!("wpkh([{fingerprint}/{deriv_path}]{xpub}/1/*)");

    Ok((external, internal))
}

/// Load or create a BDK wallet backed by a per-wallet SQLite file.
/// Returns a PersistedWallet (which Derefs to Wallet) and the connection.
pub fn load_or_create_bdk_wallet(
    wallets_dir: &str,
    wallet_id: &str,
    external_desc: &str,
    internal_desc: &str,
    network: Network,
) -> AppResult<(PersistedWallet<BdkConnection>, BdkConnection)> {
    std::fs::create_dir_all(wallets_dir).map_err(|e| {
        AppError::Internal(format!("Failed to create wallets directory: {e}"))
    })?;

    let db_path = Path::new(wallets_dir).join(format!("{wallet_id}.db"));
    let mut conn = BdkConnection::open(&db_path).map_err(|e| {
        AppError::Internal(format!("Failed to open BDK wallet database: {e}"))
    })?;

    let wallet_opt = bdk_wallet::Wallet::load()
        .descriptor(KeychainKind::External, Some(external_desc.to_string()))
        .descriptor(KeychainKind::Internal, Some(internal_desc.to_string()))
        .extract_keys()
        .check_network(network)
        .load_wallet(&mut conn)
        .map_err(|e| AppError::Internal(format!("Failed to load BDK wallet: {e}")))?;

    let wallet = match wallet_opt {
        Some(w) => {
            tracing::info!("Loaded existing BDK wallet for {wallet_id}");
            w
        }
        None => {
            tracing::info!("Creating new BDK wallet for {wallet_id}");
            bdk_wallet::Wallet::create(external_desc.to_string(), internal_desc.to_string())
                .network(network)
                .create_wallet(&mut conn)
                .map_err(|e| AppError::Internal(format!("Failed to create BDK wallet: {e}")))?
        }
    };

    Ok((wallet, conn))
}

/// Get addresses from a BDK wallet.
pub fn get_wallet_addresses(
    wallet: &bdk_wallet::Wallet,
    count: u32,
) -> Vec<AddressInfo> {
    let mut addresses = Vec::new();

    for index in 0..count {
        let addr = wallet.peek_address(KeychainKind::External, index);
        addresses.push(AddressInfo {
            index,
            address: addr.address.to_string(),
            keychain: "external".to_string(),
        });
    }

    addresses
}

#[derive(Debug, serde::Serialize)]
pub struct AddressInfo {
    pub index: u32,
    pub address: String,
    pub keychain: String,
}

#[derive(Debug, serde::Serialize)]
pub struct UtxoInfo {
    pub txid: String,
    pub vout: u32,
    pub value_sat: u64,
    pub keychain: String,
}

/// Get UTXOs from a BDK wallet.
pub fn get_wallet_utxos(wallet: &bdk_wallet::Wallet) -> Vec<UtxoInfo> {
    wallet
        .list_unspent()
        .map(|utxo| UtxoInfo {
            txid: utxo.outpoint.txid.to_string(),
            vout: utxo.outpoint.vout,
            value_sat: utxo.txout.value.to_sat(),
            keychain: format!("{:?}", utxo.keychain),
        })
        .collect()
}
