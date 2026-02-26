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
pub struct Label {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateLabelRequest {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateLabelRequest {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AssignLabelsRequest {
    pub label_ids: Vec<String>,
}

pub async fn list(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> AppResult<Json<Vec<Label>>> {
    let conn = state.db.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, user_id, name, color, created_at FROM labels WHERE user_id = ?1 ORDER BY name",
    )?;
    let rows = stmt.query_map(rusqlite::params![user.id], |row| {
        Ok(Label {
            id: row.get(0)?,
            user_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let labels: Result<Vec<_>, _> = rows.collect();
    Ok(Json(labels?))
}

pub async fn create(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(body): Json<CreateLabelRequest>,
) -> AppResult<(StatusCode, Json<Label>)> {
    if body.name.is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }

    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let conn = state.db.get()?;

    let result = conn.execute(
        "INSERT INTO labels (id, user_id, name, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, user.id, body.name, body.color, now],
    );

    match result {
        Ok(_) => {}
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            return Err(AppError::Conflict("Label with this name already exists".into()));
        }
        Err(e) => return Err(AppError::Database(e)),
    }

    Ok((StatusCode::CREATED, Json(Label {
        id,
        user_id: user.id,
        name: body.name,
        color: body.color,
        created_at: now,
    })))
}

pub async fn update(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
    Json(body): Json<UpdateLabelRequest>,
) -> AppResult<Json<Label>> {
    let conn = state.db.get()?;

    let existing = conn
        .query_row(
            "SELECT id, user_id, name, color, created_at FROM labels WHERE id = ?1 AND user_id = ?2",
            rusqlite::params![id, user.id],
            |row| {
                Ok(Label {
                    id: row.get(0)?,
                    user_id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Label not found".into()),
            e => AppError::Database(e),
        })?;

    let name = body.name.unwrap_or(existing.name);
    let color = body.color.or(existing.color);

    conn.execute(
        "UPDATE labels SET name = ?1, color = ?2 WHERE id = ?3",
        rusqlite::params![name, color, id],
    )?;

    Ok(Json(Label {
        id,
        user_id: user.id,
        name,
        color,
        created_at: existing.created_at,
    }))
}

pub async fn delete(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let conn = state.db.get()?;
    let affected = conn.execute(
        "DELETE FROM labels WHERE id = ?1 AND user_id = ?2",
        rusqlite::params![id, user.id],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound("Label not found".into()));
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn assign_to_transaction(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(transaction_id): Path<String>,
    Json(body): Json<AssignLabelsRequest>,
) -> AppResult<StatusCode> {
    let conn = state.db.get()?;

    // Verify transaction belongs to user (via portfolio)
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM transactions t JOIN portfolios p ON p.id = t.portfolio_id WHERE t.id = ?1 AND p.user_id = ?2)",
        rusqlite::params![transaction_id, user.id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("Transaction not found".into()));
    }

    // Clear existing labels for this transaction
    conn.execute(
        "DELETE FROM transaction_labels WHERE transaction_id = ?1",
        rusqlite::params![transaction_id],
    )?;

    // Insert new labels
    for label_id in &body.label_ids {
        // Verify label belongs to user
        let label_exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM labels WHERE id = ?1 AND user_id = ?2)",
            rusqlite::params![label_id, user.id],
            |row| row.get(0),
        )?;
        if !label_exists {
            return Err(AppError::NotFound(format!("Label {label_id} not found")));
        }

        conn.execute(
            "INSERT INTO transaction_labels (transaction_id, label_id) VALUES (?1, ?2)",
            rusqlite::params![transaction_id, label_id],
        )?;
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_transaction_labels(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(transaction_id): Path<String>,
) -> AppResult<Json<Vec<Label>>> {
    let conn = state.db.get()?;

    // Verify transaction belongs to user
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM transactions t JOIN portfolios p ON p.id = t.portfolio_id WHERE t.id = ?1 AND p.user_id = ?2)",
        rusqlite::params![transaction_id, user.id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound("Transaction not found".into()));
    }

    let mut stmt = conn.prepare(
        "SELECT l.id, l.user_id, l.name, l.color, l.created_at
         FROM labels l
         JOIN transaction_labels tl ON tl.label_id = l.id
         WHERE tl.transaction_id = ?1
         ORDER BY l.name",
    )?;
    let rows = stmt.query_map(rusqlite::params![transaction_id], |row| {
        Ok(Label {
            id: row.get(0)?,
            user_id: row.get(1)?,
            name: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let labels: Result<Vec<_>, _> = rows.collect();
    Ok(Json(labels?))
}
