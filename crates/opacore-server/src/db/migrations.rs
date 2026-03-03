use rusqlite::Connection;

const SCHEMA: &str = include_str!("schema.sql");

pub fn run(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA)?;

    // Migration: add email_verified column if it doesn't exist (for existing databases)
    // Default 1 so existing users aren't locked out; new registrations explicitly set 0
    let has_email_verified: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('users') WHERE name='email_verified'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_email_verified {
        conn.execute_batch(
            "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1;",
        )?;
    }

    // Migration: add 'type' column to invoices (invoice vs payment_link)
    let has_invoice_type: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('invoices') WHERE name='type'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_invoice_type {
        conn.execute_batch(
            "ALTER TABLE invoices ADD COLUMN type TEXT NOT NULL DEFAULT 'invoice';",
        )?;
    }

    // Create index on (portfolio_id, type) — must run after type column exists
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_invoices_portfolio_type ON invoices(portfolio_id, type);",
    )?;

    // Migration: add 'reusable' column to invoices
    let has_reusable: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('invoices') WHERE name='reusable'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_reusable {
        conn.execute_batch(
            "ALTER TABLE invoices ADD COLUMN reusable INTEGER NOT NULL DEFAULT 0;",
        )?;
    }

    // Migration: add balance_sat to wallets
    let has_balance_sat: bool = conn
        .prepare("SELECT COUNT(*) FROM pragma_table_info('wallets') WHERE name='balance_sat'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_balance_sat {
        conn.execute_batch(
            "ALTER TABLE wallets ADD COLUMN balance_sat INTEGER NOT NULL DEFAULT 0;",
        )?;
    }

    // Migration: create password_reset_tokens table if missing
    let has_prt: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='password_reset_tokens'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_prt {
        conn.execute_batch(
            "CREATE TABLE password_reset_tokens (
                id          TEXT PRIMARY KEY NOT NULL,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token       TEXT NOT NULL UNIQUE,
                expires_at  TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE INDEX idx_prt_token ON password_reset_tokens(token);
            CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);",
        )?;
    }

    // Migration: create alerts table if missing
    let has_alerts: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='alerts'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_alerts {
        conn.execute_batch(
            "CREATE TABLE alerts (
                id                TEXT PRIMARY KEY NOT NULL,
                user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                alert_type        TEXT NOT NULL CHECK(alert_type IN ('price_above', 'price_below', 'balance_change')),
                threshold_usd     REAL,
                portfolio_id      TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
                wallet_id         TEXT REFERENCES wallets(id) ON DELETE CASCADE,
                label             TEXT,
                is_active         INTEGER NOT NULL DEFAULT 1,
                last_triggered_at TEXT,
                created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE INDEX idx_alerts_user_id ON alerts(user_id);
            CREATE INDEX idx_alerts_active ON alerts(is_active, alert_type);",
        )?;
    }

    // Migration: create subscriptions table if missing
    let has_subscriptions: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='subscriptions'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_subscriptions {
        conn.execute_batch(
            "CREATE TABLE subscriptions (
                id                      TEXT PRIMARY KEY NOT NULL,
                user_id                 TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                stripe_customer_id      TEXT NOT NULL UNIQUE,
                stripe_subscription_id  TEXT UNIQUE,
                plan                    TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'pro')),
                status                  TEXT NOT NULL DEFAULT 'inactive' CHECK(status IN ('active', 'inactive', 'past_due', 'canceled', 'trialing')),
                current_period_end      TEXT,
                created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);",
        )?;
    }

    // Migration: change transactions.wallet_id FK from ON DELETE SET NULL to CASCADE
    // SQLite doesn't support ALTER TABLE for FK changes; must rebuild the table.
    let wallet_fk_action: String = conn
        .prepare("SELECT on_delete FROM pragma_foreign_key_list('transactions') WHERE \"from\"='wallet_id'")?
        .query_row([], |row| row.get::<_, String>(0))
        .unwrap_or_else(|_| "CASCADE".to_string());

    if wallet_fk_action != "CASCADE" {
        conn.execute_batch(
            "PRAGMA foreign_keys=OFF;
            CREATE TABLE transactions_new (
                id              TEXT PRIMARY KEY NOT NULL,
                portfolio_id    TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
                wallet_id       TEXT REFERENCES wallets(id) ON DELETE CASCADE,
                tx_type         TEXT NOT NULL,
                amount_sat      INTEGER NOT NULL,
                fee_sat         INTEGER,
                price_usd       REAL,
                fiat_amount     REAL,
                fiat_currency   TEXT NOT NULL DEFAULT 'usd',
                txid            TEXT,
                block_height    INTEGER,
                block_time      TEXT,
                source          TEXT NOT NULL DEFAULT 'manual',
                transacted_at   TEXT NOT NULL,
                created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );
            INSERT INTO transactions_new SELECT * FROM transactions;
            DROP TABLE transactions;
            ALTER TABLE transactions_new RENAME TO transactions;
            CREATE INDEX idx_transactions_portfolio_date ON transactions(portfolio_id, transacted_at);
            CREATE INDEX idx_transactions_txid ON transactions(txid);
            CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
            PRAGMA foreign_keys=ON;",
        )?;
    }

    // Migration: create stripe_events table if missing
    let has_stripe_events: bool = conn
        .prepare("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='stripe_events'")?
        .query_row([], |row| row.get::<_, i32>(0))
        .map(|c| c > 0)
        .unwrap_or(false);

    if !has_stripe_events {
        conn.execute_batch(
            "CREATE TABLE stripe_events (
                event_id     TEXT PRIMARY KEY NOT NULL,
                processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            );",
        )?;
    }

    Ok(())
}
