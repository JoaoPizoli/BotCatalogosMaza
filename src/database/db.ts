import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import mysql from 'mysql2/promise';

let db: Database | undefined;
let erpPool: mysql.Pool | undefined;

export function getDb() {
    return db;
}

export function getErpPool(): mysql.Pool {
    if (!erpPool) throw new Error('[DB] ERP Pool não inicializado. Chame setupDatabase() primeiro.');
    return erpPool;
}

export async function setupDatabase() {
    // 1. SQLite (tabelas existentes + auth)
    db = await open({
        filename: 'database.sqlite',
        driver: sqlite3.Database
    });

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

        CREATE TABLE IF NOT EXISTS authenticated_users (
            chat_id TEXT PRIMARY KEY,
            client_code TEXT NOT NULL,
            logged_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS representatives (
            client_code TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            password TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Seed: representante de teste
    await db.run(`
        INSERT OR IGNORE INTO representatives (client_code, name, password)
        VALUES ('001', 'Usuário Teste', 'maza123')
    `);

    console.log("[DB] SQLite banco iniciado (com tabelas de auth)!");

    // 2. MySQL ERP pool (somente leitura, condicional)
    const mysqlHost = process.env.ERP_MYSQL_HOST;
    if (mysqlHost) {
        erpPool = mysql.createPool({
            host: mysqlHost,
            port: parseInt(process.env.ERP_MYSQL_PORT ?? '3306', 10),
            user: process.env.ERP_MYSQL_USER!,
            password: process.env.ERP_MYSQL_PASSWORD!,
            database: process.env.ERP_MYSQL_DATABASE!,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            timezone: '+00:00',
        });

        try {
            const conn = await erpPool.getConnection();
            await conn.ping();
            conn.release();
            console.log('[DB] MySQL ERP conexão verificada!');
        } catch (err) {
            console.error('[DB] Erro ao conectar MySQL ERP:', err);
        }
    } else {
        console.log('[DB] ERP_MYSQL_HOST não definido, pulando MySQL pool.');
    }
}
