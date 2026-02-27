use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub server_port: u16,
    pub sqlite_path: String,
    pub bdk_wallets_dir: String,
    pub session_secret: String,
    pub esplora_url: String,
    pub coingecko_api_url: String,
    pub cors_origin: String,
    pub secure_cookies: bool,
    pub resend_api_key: Option<String>,
    pub admin_email: Option<String>,
    pub from_email: String,
    pub app_url: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "4000".to_string())
                .parse()
                .expect("SERVER_PORT must be a valid port number"),
            sqlite_path: env::var("SQLITE_PATH")
                .unwrap_or_else(|_| "./data/opacore.db".to_string()),
            bdk_wallets_dir: env::var("BDK_WALLETS_DIR")
                .unwrap_or_else(|_| "./data/wallets".to_string()),
            session_secret: env::var("SESSION_SECRET")
                .unwrap_or_else(|_| "change-me-to-a-random-32-char-string".to_string()),
            esplora_url: env::var("ESPLORA_URL")
                .unwrap_or_else(|_| "https://blockstream.info/api".to_string()),
            coingecko_api_url: env::var("COINGECKO_API_URL")
                .unwrap_or_else(|_| "https://api.coingecko.com/api/v3".to_string()),
            cors_origin: env::var("CORS_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            secure_cookies: env::var("SECURE_COOKIES")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),
            resend_api_key: env::var("RESEND_API_KEY").ok(),
            admin_email: env::var("ADMIN_EMAIL").ok(),
            from_email: env::var("FROM_EMAIL")
                .unwrap_or_else(|_| "noreply@opacore.com".to_string()),
            app_url: env::var("APP_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
        }
    }
}
