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

    Ok(())
}
