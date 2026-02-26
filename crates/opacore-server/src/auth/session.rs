use chrono::{Duration, Utc};
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};
use crate::models::{Session, User};

const SESSION_DURATION_DAYS: i64 = 30;

pub fn create_session(
    pool: &DbPool,
    user_id: &str,
    ip_address: Option<&str>,
    user_agent: Option<&str>,
) -> AppResult<Session> {
    let conn = pool.get()?;
    let id = Uuid::new_v4().to_string();
    let token = generate_token();
    let expires_at = (Utc::now() + Duration::days(SESSION_DURATION_DAYS))
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    conn.execute(
        "INSERT INTO sessions (id, user_id, token, expires_at, ip_address, user_agent) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, user_id, token, expires_at, ip_address, user_agent],
    )?;

    Ok(Session {
        id,
        user_id: user_id.to_string(),
        token,
        expires_at,
        ip_address: ip_address.map(|s| s.to_string()),
        user_agent: user_agent.map(|s| s.to_string()),
        created_at: Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    })
}

pub fn validate_session(pool: &DbPool, token: &str) -> AppResult<(Session, User)> {
    let conn = pool.get()?;
    let now = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    let mut stmt = conn.prepare(
        "SELECT s.id, s.user_id, s.token, s.expires_at, s.ip_address, s.user_agent, s.created_at,
                u.id, u.email, u.name, u.password_hash, u.default_currency, u.created_at, u.updated_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?1 AND s.expires_at > ?2",
    )?;

    let result = stmt.query_row(rusqlite::params![token, now], |row| {
        let session = Session {
            id: row.get(0)?,
            user_id: row.get(1)?,
            token: row.get(2)?,
            expires_at: row.get(3)?,
            ip_address: row.get(4)?,
            user_agent: row.get(5)?,
            created_at: row.get(6)?,
        };
        let user = User {
            id: row.get(7)?,
            email: row.get(8)?,
            name: row.get(9)?,
            password_hash: row.get(10)?,
            default_currency: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        };
        Ok((session, user))
    });

    match result {
        Ok(pair) => Ok(pair),
        Err(rusqlite::Error::QueryReturnedNoRows) => Err(AppError::Unauthorized),
        Err(e) => Err(AppError::Database(e)),
    }
}

pub fn delete_session(pool: &DbPool, token: &str) -> AppResult<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM sessions WHERE token = ?1", rusqlite::params![token])?;
    Ok(())
}

pub fn delete_user_sessions(pool: &DbPool, user_id: &str) -> AppResult<()> {
    let conn = pool.get()?;
    conn.execute("DELETE FROM sessions WHERE user_id = ?1", rusqlite::params![user_id])?;
    Ok(())
}

fn generate_token() -> String {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}
