use chrono::{Duration, Utc};
use uuid::Uuid;

use crate::db::DbPool;
use crate::error::{AppError, AppResult};

/// Create a verification token for a user. Deletes any existing tokens for the user first.
pub fn create_verification_token(pool: &DbPool, user_id: &str) -> AppResult<String> {
    let conn = pool.get()?;

    // Delete any existing tokens for this user
    conn.execute(
        "DELETE FROM email_verification_tokens WHERE user_id = ?1",
        rusqlite::params![user_id],
    )?;

    let id = Uuid::new_v4().to_string();
    let token = generate_token();
    let expires_at = (Utc::now() + Duration::hours(24))
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    conn.execute(
        "INSERT INTO email_verification_tokens (id, user_id, token, expires_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, user_id, token, expires_at],
    )?;

    Ok(token)
}

/// Validate a verification token. Returns the user_id if valid.
/// Marks the user as verified and deletes the token.
pub fn validate_and_consume_token(pool: &DbPool, token: &str) -> AppResult<String> {
    let conn = pool.get()?;
    let now = Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    let user_id: String = conn
        .query_row(
            "SELECT user_id FROM email_verification_tokens WHERE token = ?1 AND expires_at > ?2",
            rusqlite::params![token, now],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::BadRequest("Invalid or expired verification token".to_string())
            }
            _ => AppError::Database(e),
        })?;

    // Mark user as verified
    conn.execute(
        "UPDATE users SET email_verified = 1, updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, user_id],
    )?;

    // Delete the consumed token (and any others for this user)
    conn.execute(
        "DELETE FROM email_verification_tokens WHERE user_id = ?1",
        rusqlite::params![user_id],
    )?;

    // Clean up any expired tokens while we're here
    conn.execute(
        "DELETE FROM email_verification_tokens WHERE expires_at < ?1",
        rusqlite::params![now],
    )?;

    Ok(user_id)
}

fn generate_token() -> String {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}
