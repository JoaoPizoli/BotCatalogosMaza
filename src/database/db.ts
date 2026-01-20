import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let db: Database | undefined;

export function getDb() {
    return db;
}

export async function setupDatabase() {
    db = await open({
        filename: 'database.sqlite',
        driver: sqlite3.Database
    })

    await db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            jid TEXT PRIMARY KEY,
            data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS telegram_file_cache (
            file_name TEXT PRIMARY KEY,
            file_id TEXT NOT NULL,
            file_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `)

    console.log("[DB] Banco iniciado!");
}