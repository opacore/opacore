mod analysis;
mod auth;
mod invoices;
mod labels;
mod portfolios;
mod prices;
mod sync;
mod tax;
mod transactions;
mod wallets;

use std::sync::Arc;

use axum::{
    middleware,
    routing::{get, post, put},
    Router,
};
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};

use crate::auth::middleware::require_auth;
use crate::config::Config;
use crate::db::DbPool;

#[derive(Clone)]
pub struct AppState {
    pub db: DbPool,
    pub config: Config,
}

async fn health() -> &'static str {
    "ok"
}

pub fn create_router(state: AppState) -> Router {
    // Rate limit: auth routes — 10 requests per 60 seconds per IP
    let auth_governor = GovernorConfigBuilder::default()
        .per_second(6)
        .burst_size(10)
        .finish()
        .unwrap();

    // Rate limit: public routes — 30 requests per 60 seconds per IP
    let public_governor = GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(30)
        .finish()
        .unwrap();

    // Rate limit: protected API — 120 requests per 60 seconds per IP
    let api_governor = GovernorConfigBuilder::default()
        .per_second(2)
        .burst_size(120)
        .finish()
        .unwrap();

    // Health checks — no rate limit
    let health_routes = Router::new()
        .route("/health", get(health))
        .route("/api/v1/health", get(health));

    // Auth routes — strict rate limit
    let auth_routes = Router::new()
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/logout", post(auth::logout))
        .layer(GovernorLayer::new(Arc::new(auth_governor)));

    // Public invoice page — moderate rate limit
    let public_invoice = Router::new()
        .route("/api/v1/invoices/pay/{share_token}", get(invoices::public_get))
        .layer(GovernorLayer::new(Arc::new(public_governor)));

    let protected = Router::new()
        // Auth
        .route("/api/v1/auth/me", get(auth::me))
        // Portfolios
        .route("/api/v1/portfolios", get(portfolios::list).post(portfolios::create))
        .route(
            "/api/v1/portfolios/{id}",
            get(portfolios::get)
                .put(portfolios::update)
                .delete(portfolios::delete),
        )
        // Wallets (nested under portfolios)
        .route(
            "/api/v1/portfolios/{portfolio_id}/wallets",
            get(wallets::list),
        )
        .route("/api/v1/wallets", post(wallets::create))
        .route(
            "/api/v1/portfolios/{portfolio_id}/wallets/{wallet_id}",
            get(wallets::get)
                .put(wallets::update)
                .delete(wallets::delete),
        )
        // Transactions (nested under portfolios)
        .route(
            "/api/v1/portfolios/{portfolio_id}/transactions",
            get(transactions::list),
        )
        .route("/api/v1/transactions", post(transactions::create))
        .route(
            "/api/v1/portfolios/{portfolio_id}/transactions/{tx_id}",
            get(transactions::get)
                .put(transactions::update)
                .delete(transactions::delete),
        )
        // Labels
        .route("/api/v1/labels", get(labels::list).post(labels::create))
        .route(
            "/api/v1/labels/{id}",
            put(labels::update).delete(labels::delete),
        )
        // Transaction labels
        .route(
            "/api/v1/transactions/{transaction_id}/labels",
            get(labels::get_transaction_labels).put(labels::assign_to_transaction),
        )
        // Wallet sync + BDK endpoints
        .route(
            "/api/v1/portfolios/{portfolio_id}/wallets/{wallet_id}/sync",
            post(sync::sync_wallet),
        )
        .route(
            "/api/v1/portfolios/{portfolio_id}/wallets/{wallet_id}/addresses",
            get(sync::get_addresses),
        )
        .route(
            "/api/v1/portfolios/{portfolio_id}/wallets/{wallet_id}/utxos",
            get(sync::get_utxos),
        )
        // Analysis (cost basis + summary)
        .route(
            "/api/v1/portfolios/{id}/cost-basis",
            get(analysis::cost_basis),
        )
        .route(
            "/api/v1/portfolios/{id}/summary",
            get(analysis::summary),
        )
        // Tax reports
        .route(
            "/api/v1/portfolios/{id}/tax/report",
            get(tax::tax_report),
        )
        .route(
            "/api/v1/portfolios/{id}/tax/csv",
            get(tax::tax_csv),
        )
        // Invoices
        .route(
            "/api/v1/portfolios/{portfolio_id}/invoices",
            get(invoices::list),
        )
        .route("/api/v1/invoices", post(invoices::create))
        .route(
            "/api/v1/portfolios/{portfolio_id}/invoices/{invoice_id}",
            get(invoices::get)
                .put(invoices::update)
                .delete(invoices::delete),
        )
        .route(
            "/api/v1/portfolios/{portfolio_id}/invoices/{invoice_id}/check-payment",
            post(invoices::check_payment),
        )
        // Prices
        .route("/api/v1/prices/current", get(prices::current))
        .route("/api/v1/prices/historical", get(prices::historical))
        .route("/api/v1/prices/range", get(prices::range))
        .route("/api/v1/prices/backfill", post(prices::backfill))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            require_auth,
        ))
        .layer(GovernorLayer::new(Arc::new(api_governor)));

    Router::new()
        .merge(health_routes)
        .merge(auth_routes)
        .merge(public_invoice)
        .merge(protected)
        .with_state(state)
}
