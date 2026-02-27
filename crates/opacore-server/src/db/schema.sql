-- ============================================================
-- AUTH
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    default_currency TEXT NOT NULL DEFAULT 'usd',
    email_verified  INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY NOT NULL,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE,
    expires_at      TEXT NOT NULL,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id              TEXT PRIMARY KEY NOT NULL,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT NOT NULL UNIQUE,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_evt_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_evt_user_id ON email_verification_tokens(user_id);

-- ============================================================
-- PORTFOLIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolios (
    id              TEXT PRIMARY KEY NOT NULL,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);

-- ============================================================
-- WALLETS / DESCRIPTORS
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
    id              TEXT PRIMARY KEY NOT NULL,
    portfolio_id    TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    label           TEXT NOT NULL,
    wallet_type     TEXT NOT NULL DEFAULT 'descriptor',
    descriptor      TEXT,
    xpub            TEXT,
    address         TEXT,
    network         TEXT NOT NULL DEFAULT 'bitcoin',
    derivation_path TEXT,
    gap_limit       INTEGER NOT NULL DEFAULT 20,
    last_synced_at  TEXT,
    last_sync_height INTEGER,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_wallets_portfolio_id ON wallets(portfolio_id);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id              TEXT PRIMARY KEY NOT NULL,
    portfolio_id    TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    wallet_id       TEXT REFERENCES wallets(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_date ON transactions(portfolio_id, transacted_at);
CREATE INDEX IF NOT EXISTS idx_transactions_txid ON transactions(txid);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);

-- ============================================================
-- LABELS
-- ============================================================
CREATE TABLE IF NOT EXISTS labels (
    id              TEXT PRIMARY KEY NOT NULL,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    color           TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_labels_user_name ON labels(user_id, name);

CREATE TABLE IF NOT EXISTS transaction_labels (
    transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    label_id        TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, label_id)
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
    id                  TEXT PRIMARY KEY NOT NULL,
    portfolio_id        TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    type                TEXT NOT NULL DEFAULT 'invoice',
    reusable            INTEGER NOT NULL DEFAULT 0,
    invoice_number      TEXT,
    customer_name       TEXT,
    customer_email      TEXT,
    description         TEXT,
    amount_sat          INTEGER NOT NULL DEFAULT 0,
    amount_fiat         REAL,
    fiat_currency       TEXT NOT NULL DEFAULT 'usd',
    btc_price_at_creation REAL,
    btc_address         TEXT NOT NULL,
    wallet_id           TEXT REFERENCES wallets(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'draft',
    share_token         TEXT NOT NULL UNIQUE,
    issued_at           TEXT,
    due_at              TEXT,
    expires_at          TEXT,
    paid_at             TEXT,
    paid_txid           TEXT,
    paid_amount_sat     INTEGER,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_portfolio_id ON invoices(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_invoices_portfolio_type ON invoices(portfolio_id, type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_share_token ON invoices(share_token);
CREATE INDEX IF NOT EXISTS idx_invoices_btc_address ON invoices(btc_address);

-- ============================================================
-- PRICE HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS price_history (
    date            TEXT NOT NULL,
    currency        TEXT NOT NULL,
    price           REAL NOT NULL,
    source          TEXT NOT NULL DEFAULT 'coingecko',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (date, currency)
);
