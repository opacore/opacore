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

use crate::auth::{middleware::SESSION_COOKIE, password, session, verification};
use crate::error::{AppError, AppResult};
use crate::models::{User, UserPublic};
use crate::routes::AppState;
use crate::services;

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

#[derive(Debug, Deserialize)]
pub struct VerifyEmailRequest {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct ResendVerificationRequest {
    pub email: String,
}

pub async fn register(
    State(state): State<AppState>,
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

    // Insert user with email_verified = 0
    {
        let conn = state.db.get()?;
        let result = conn.execute(
            "INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)",
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
    }

    // Create verification token
    let token = verification::create_verification_token(&state.db, &user_id)?;

    // Send emails in background (don't block response)
    let config = state.config.clone();
    let email = body.email.clone();
    let name = body.name.clone();
    tokio::spawn(async move {
        if let Err(e) =
            services::email::send_verification_email(&config, &email, &name, &token).await
        {
            tracing::error!("Failed to send verification email: {e}");
        }
        if let Err(e) = services::email::send_admin_notification(&config, &name, &email).await {
            tracing::error!("Failed to send admin notification: {e}");
        }
    });

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({
            "message": "Account created. Please check your email to verify your account.",
            "email": body.email,
        })),
    ))
}

pub async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginRequest>,
) -> AppResult<impl IntoResponse> {
    let user = {
        let conn = state.db.get()?;
        let user_result = conn.query_row(
            "SELECT id, email, name, password_hash, default_currency, email_verified, created_at, updated_at FROM users WHERE email = ?1",
            rusqlite::params![body.email],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    name: row.get(2)?,
                    password_hash: row.get(3)?,
                    default_currency: row.get(4)?,
                    email_verified: row.get::<_, i32>(5)? != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        );

        match user_result {
            Ok(u) => u,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(AppError::Unauthorized);
            }
            Err(e) => return Err(AppError::Database(e)),
        }
    };

    let valid = password::verify_password(&body.password, &user.password_hash)?;
    if !valid {
        return Err(AppError::Unauthorized);
    }

    // Check email verification
    if !user.email_verified {
        return Err(AppError::Forbidden(
            "Please verify your email before signing in. Check your inbox for the verification link.".to_string(),
        ));
    }

    let sess = session::create_session(&state.db, &user.id, None, None)?;
    let cookie = build_session_cookie(sess.token, state.config.secure_cookies);
    let user_public: UserPublic = user.into();

    Ok((jar.add(cookie), Json(user_public)))
}

pub async fn verify_email(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<VerifyEmailRequest>,
) -> AppResult<impl IntoResponse> {
    let user_id = verification::validate_and_consume_token(&state.db, &body.token)?;

    // Create a session so the user is logged in after verification
    let sess = session::create_session(&state.db, &user_id, None, None)?;
    let cookie = build_session_cookie(sess.token, state.config.secure_cookies);

    // Fetch the verified user for the response
    let user = {
        let conn = state.db.get()?;
        conn.query_row(
            "SELECT id, email, name, password_hash, default_currency, email_verified, created_at, updated_at FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| {
                Ok(User {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    name: row.get(2)?,
                    password_hash: row.get(3)?,
                    default_currency: row.get(4)?,
                    email_verified: row.get::<_, i32>(5)? != 0,
                    created_at: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )?
    };

    let user_public: UserPublic = user.into();
    Ok((jar.add(cookie), Json(user_public)))
}

pub async fn resend_verification(
    State(state): State<AppState>,
    Json(body): Json<ResendVerificationRequest>,
) -> AppResult<impl IntoResponse> {
    // Always return same response to prevent email enumeration
    let success_msg = serde_json::json!({
        "message": "If an account exists with that email, a verification link has been sent."
    });

    let user_info = {
        let conn = state.db.get()?;
        conn.query_row(
            "SELECT id, name, email_verified FROM users WHERE email = ?1",
            rusqlite::params![body.email],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                ))
            },
        )
        .ok()
    };

    let Some((user_id, name, verified)) = user_info else {
        return Ok(Json(success_msg));
    };

    if verified != 0 {
        return Ok(Json(success_msg));
    }

    let token = verification::create_verification_token(&state.db, &user_id)?;

    let config = state.config.clone();
    let email = body.email.clone();
    tokio::spawn(async move {
        if let Err(e) =
            services::email::send_verification_email(&config, &email, &name, &token).await
        {
            tracing::error!("Failed to send verification email: {e}");
        }
    });

    Ok(Json(success_msg))
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

fn build_session_cookie(token: String, secure: bool) -> Cookie<'static> {
    Cookie::build((SESSION_COOKIE, token))
        .path("/")
        .max_age(time::Duration::days(30))
        .http_only(true)
        .secure(secure)
        .same_site(axum_extra::extract::cookie::SameSite::Lax)
        .build()
}
