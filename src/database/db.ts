import mysql from 'mysql2/promise';
import { Pool } from 'pg';

let erpPool: mysql.Pool | undefined;
let pgPool: Pool | undefined;

export function getErpPool(): mysql.Pool {
    if (!erpPool) throw new Error('[DB] ERP Pool não inicializado. Chame setupDatabase() primeiro.');
    return erpPool;
}

export function getPgPool(): Pool {
    if (!pgPool) throw new Error('[DB] PG Pool não inicializado. Chame setupDatabase() primeiro.');
    return pgPool;
}

export async function setupDatabase() {
    // 1. PostgreSQL (todas as tabelas do bot)
    pgPool = new Pool({
        host: process.env.PG_HOST ?? 'localhost',
        port: parseInt(process.env.PG_PORT ?? '5432', 10),
        user: process.env.PG_USER ?? 'postgres',
        password: process.env.PG_PASSWORD ?? '',
        database: process.env.PG_DATABASE ?? 'mazabot',
    });

    try {
        const client = await pgPool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                jid TEXT PRIMARY KEY,
                data TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS telegram_file_cache (
                file_name TEXT PRIMARY KEY,
                file_id TEXT NOT NULL,
                file_type TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS authenticated_users (
                chat_id TEXT PRIMARY KEY,
                client_code TEXT NOT NULL,
                logged_in_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS representatives (
                client_code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password TEXT NOT NULL,
                active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);
        await client.query(`
            INSERT INTO representatives (client_code, name, password)
            VALUES ('999', 'Usuário Padrão', 'maza123')
            ON CONFLICT (client_code) DO NOTHING
        `);
        client.release();
        console.log('[DB] PostgreSQL conexão verificada e tabelas prontas!');
    } catch (err) {
        console.error('[DB] Erro ao conectar/inicializar PostgreSQL:', err);
    }

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
