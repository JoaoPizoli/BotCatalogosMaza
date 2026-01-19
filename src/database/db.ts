import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let db: Database | undefined;

export async function setupDatabase() {
    db = await open({
        filename: ':memory:',
        driver: sqlite3.Database
    })

    await db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            jid TEXT PRIMARY KEY,
            data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `)

    console.log("[DB] Banco iniciado!");
}