mod config;
mod db;
mod error;
mod models;
mod services;
mod auth;
mod routes;

use config::Config;
use routes::{AppState, create_router};
use axum::http::{header, HeaderValue, Method};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // Load .env file (from repo root)
    dotenvy::from_filename("../../.env").ok();
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("opacore_server=debug,tower_http=debug")),
        )
        .init();

    let config = Config::from_env();
    let port = config.server_port;

    // Create database pool and run migrations
    let pool = db::create_pool(&config.sqlite_path);
    tracing::info!("Database initialized at {}", config.sqlite_path);

    // Build app state
    let state = AppState {
        db: pool,
        config: config.clone(),
    };

    // Spawn background invoice payment checker
    tokio::spawn(services::invoice_checker::run_invoice_checker(
        state.db.clone(),
        state.config.esplora_url.clone(),
    ));

    // Build router with middleware
    let cors = CorsLayer::new()
        .allow_origin(config.cors_origin.parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION, header::COOKIE])
        .allow_credentials(true);

    let app = create_router(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors);

    // Start server
    let addr = format!("0.0.0.0:{port}");
    tracing::info!("opacore-server listening on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind address");

    axum::serve(listener, app)
        .await
        .expect("Server failed");
}
