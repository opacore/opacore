use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Extension, Json,
};
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::Cookie;
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::{middleware::SESSION_COOKIE, password, session};
use crate::error::{AppError, AppResult};
use crate::models::{User, UserPublic};
use crate::routes::AppState;

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub name: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

pub async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<RegisterRequest>,
) -> AppResult<impl IntoResponse> {
    // Validate input
    if body.email.is_empty() || !body.email.contains('@') {
        return Err(AppError::BadRequest("Invalid email address".to_string()));
    }
    if body.name.is_empty() {
        return Err(AppError::BadRequest("Name is required".to_string()));
    }
    if body.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }

    let password_hash = password::hash_password(&body.password)?;
    let user_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string();

    // Insert user
    let conn = state.db.get()?;
    let result = conn.execute(
        "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![user_id, body.email, body.name, password_hash, now, now],
    );

    match result {
        Ok(_) => {}
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            return Err(AppError::Conflict(
                "An account with this email already exists".to_string(),
            ));
        }
        Err(e) => return Err(AppError::Database(e)),
    }

    // Create session
    let sess = session::create_session(&state.db, &user_id, None, None)?;

    let cookie = build_session_cookie(sess.token);
    let user_public = UserPublic {
        id: user_id,
        email: body.email,
        name: body.name,
        default_currency: "usd".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };

    Ok((StatusCode::CREATED, jar.add(cookie), Json(user_public)))
}

pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginRequest>,
) -> AppResult<impl IntoResponse> {
    let conn = state.db.get()?;

    let user_result = conn.query_row(
        "SELECT id, email, name, password_hash, default_currency, created_at, updated_at FROM users WHERE email = ?1",
        rusqlite::params![body.email],
        |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                password_hash: row.get(3)?,
                default_currency: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    );

    let user = match user_result {
        Ok(u) => u,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(AppError::Unauthorized);
        }
        Err(e) => return Err(AppError::Database(e)),
    };

    let valid = password::verify_password(&body.password, &user.password_hash)?;
    if !valid {
        return Err(AppError::Unauthorized);
    }

    let sess = session::create_session(&state.db, &user.id, None, None)?;
    let cookie = build_session_cookie(sess.token);
    let user_public: UserPublic = user.into();

    Ok((jar.add(cookie), Json(user_public)))
}

pub async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> AppResult<impl IntoResponse> {
    if let Some(cookie) = jar.get(SESSION_COOKIE) {
        session::delete_session(&state.db, cookie.value())?;
    }

    let removal = Cookie::build(SESSION_COOKIE)
        .path("/")
        .max_age(time::Duration::ZERO)
        .http_only(true)
        .build();

    Ok((jar.add(removal), Json(serde_json::json!({"ok": true}))))
}

pub async fn me(Extension(user): Extension<User>) -> Json<UserPublic> {
    Json(user.into())
}

fn build_session_cookie(token: String) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, token))
        .path("/")
        .max_age(time::Duration::days(30))
        .http_only(true)
        .same_site(axum_extra::extract::cookie::SameSite::Lax)
        .build()
}
