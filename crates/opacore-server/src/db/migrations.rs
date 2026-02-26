use rusqlite::Connection;

const SCHEMA: &str = include_str!("schema.sql");

pub fn run(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(SCHEMA)
}
