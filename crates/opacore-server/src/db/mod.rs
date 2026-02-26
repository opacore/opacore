mod migrations;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::OpenFlags;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;

pub fn create_pool(sqlite_path: &str) -> DbPool {
    // Ensure parent directory exists
    if let Some(parent) = Path::new(sqlite_path).parent() {
        std::fs::create_dir_all(parent).expect("Failed to create database directory");
    }

    let manager = SqliteConnectionManager::file(sqlite_path)
        .with_flags(
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )
        .with_init(|conn| {
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;",
            )
        });

    let pool = Pool::builder()
        .max_size(10)
        .build(manager)
        .expect("Failed to create database pool");

    // Run migrations
    let conn = pool.get().expect("Failed to get connection for migrations");
    migrations::run(&conn).expect("Failed to run migrations");

    pool
}
