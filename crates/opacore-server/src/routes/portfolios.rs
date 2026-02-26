use axum::{
    extract::{Path, State},
    Extension, Json,
};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::User;
use crate::routes::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct Portfolio {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePortfolioRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePortfolioRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> AppResult<Json<Vec<Portfolio>>> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, user_id, name, description, created_at, updated_at FROM portfolios WHERE user_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(rusqlite::params![user.id], |row| {
        Ok(Portfolio {
            id: row.get(0)?,
            user_id: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    let portfolios: Result<Vec<_>, _> = rows.collect();
    Ok(Json(portfolios?))
}

pub async fn get(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> AppResult<Json<Portfolio>> {
    let conn = state.db.get()?;
    let portfolio = conn
        .query_row(
            "SELECT id, user_id, name, description, created_at, updated_at FROM portfolios WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user.id],
            |row| {
                Ok(Portfolio {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Portfolio not found".into()),
            e => AppError::Database(e),
        })?;
    Ok(Json(portfolio))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(body): Json<CreatePortfolioRequest>,
) -> AppResult<(StatusCode, Json<Portfolio>)> {
    if body.name.is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let conn = state.db.get()?;

    conn.execute(
        "INSERT INTO portfolios (id, user_id, name, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, user.id, body.name, body.description, now, now],
    )?;

    let portfolio = Portfolio {
        id,
        user_id: user.id,
        name: body.name,
        description: body.description,
        created_at: now.clone(),
        updated_at: now,
    };

    Ok((StatusCode::CREATED, Json(portfolio)))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
    Json(body): Json<UpdatePortfolioRequest>,
) -> AppResult<Json<Portfolio>> {
    let conn = state.db.get()?;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    // Fetch existing
    let existing = conn
        .query_row(
            "SELECT id, user_id, name, description, created_at, updated_at FROM portfolios WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user.id],
            |row| {
                Ok(Portfolio {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    name: row.get(2)?,
                    description: row.get(3)?,
                    created_at: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Portfolio not found".into()),
            e => AppError::Database(e),
        })?;

    let name = body.name.unwrap_or(existing.name);
    let description = body.description.or(existing.description);

    conn.execute(
        "UPDATE portfolios SET name = ?1, description = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![name, description, now, id],
    )?;

    Ok(Json(Portfolio {
        id,
        user_id: user.id,
        name,
        description,
        created_at: existing.created_at,
        updated_at: now,
    }))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let conn = state.db.get()?;
    let affected = conn.execute(
        "DELETE FROM portfolios WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![id, user.id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound("Portfolio not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}
