use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use axum_extra::extract::CookieJar;

use crate::error::AppError;
use crate::models::User;
use crate::routes::AppState;
use crate::auth::session;

pub const SESSION_COOKIE: &str = "opacore_session";

pub async fn require_auth(
    State(state): State<AppState>,
    jar: CookieJar,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = jar
        .get(SESSION_COOKIE)
        .map(|c| c.value().to_string())
        .ok_or(AppError::Unauthorized)?;

    let (_session, user) = session::validate_session(&state.db, &token)?;

    request.extensions_mut().insert(user);
    Ok(next.run(request).await)
}

pub trait RequestExt {
    fn user(&self) -> &User;
}

impl RequestExt for axum::extract::Extension<User> {
    fn user(&self) -> &User {
        &self.0
    }
}
