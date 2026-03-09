/**
 * productCache.ts
 *
 * Cache local de produtos em arquivo JSON (data/products.json).
 * Sincroniza periodicamente com o banco de dados do ERP (view VW_PRODUTOS).
 *
 * Cada produto contém um campo `aliases` (nomes alternativos) que melhora
 * o matching com nomes falados em áudio. Aliases são preservados entre syncs.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { getErpPool } from '../database/db';
import { PRODUCT_CACHE_TTL_HOURS } from '../config/config';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CachedProduct {
    code: string;
    name: string;
    aliases: string[];
    description: string;
    unit: string;
    price: number;
    updatedAt: string; // ISO date
}

interface ProductCache {
    products: CachedProduct[];
    lastSync: string; // ISO date
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, '../../data');
const CACHE_FILE = path.join(DATA_DIR, 'products.json');

// ─── Estado ───────────────────────────────────────────────────────────────────

let cache: ProductCache = { products: [], lastSync: '' };

// ─── Funções públicas ─────────────────────────────────────────────────────────

/** Carrega o cache do disco. Se não existir cria vazio. */
export async function loadCache(): Promise<void> {
    try {
        if (existsSync(CACHE_FILE)) {
            const raw = await readFile(CACHE_FILE, 'utf-8');
            cache = JSON.parse(raw) as ProductCache;
            console.log(`[ProductCache] Cache carregado: ${cache.products.length} produtos`);
        } else {
            console.log('[ProductCache] Arquivo de cache não encontrado. Será criado após sync.');
        }
    } catch (err) {
        console.error('[ProductCache] Erro ao carregar cache:', err);
        cache = { products: [], lastSync: '' };
    }
}

/** Verifica se o cache expirou e, se sim, re-sincroniza com o ERP. */
export async function ensureCacheFresh(): Promise<void> {
    if (isCacheExpired()) {
        console.log('[ProductCache] Cache expirado. Sincronizando com ERP...');
        await syncFromERP();
    }
}

/**
 * Sincroniza os produtos do ERP (MySQL) para o cache local.
 * Preserva aliases existentes que foram definidos manualmente.
 */
export async function syncFromERP(): Promise<void> {
    const pool = getErpPool();

    const [rows] = await pool.execute<mysql.RowDataPacket[]>(
        ' SELECT CODIGO_ITEM, DESCRICAO_ITEM, VALOR_VENDA from VW_PRODUTOS where DEPARTAMENTO = "PRODUTO ACABADO" and ATIVO = "S" GROUP BY CODIGO_ITEM; ',
    );

    // Mapa de aliases existentes (para preservar durante o sync)
    const existingAliases = new Map<string, string[]>();
    for (const p of cache.products) {
        if (p.aliases.length > 0) {
            existingAliases.set(p.code, p.aliases);
        }
    }

    const now = new Date().toISOString();
    const products: CachedProduct[] = rows.map((row) => {
        const code = row['code'] as string;
        return {
            code,
            name: row['name'] as string,
            aliases: existingAliases.get(code) ?? [],
            description: (row['description'] as string) ?? '',
            unit: (row['unit'] as string) ?? 'UN',
            price: parseFloat(String(row['price'])),
            updatedAt: now,
        };
    });

    cache = { products, lastSync: now };
    await persistCache();

    console.log(`[ProductCache] Sync concluído: ${products.length} produtos atualizados`);
}

/**
 * Busca produtos no cache por nome, aliases ou código.
 */
export function searchProducts(query: string): CachedProduct[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const scored = cache.products
        .map((product) => {
            const searchableText = [
                product.name,
                product.code,
                product.description,
                ...product.aliases,
            ]
                .join(' ')
                .toLowerCase();

            let score = 0;
            for (const term of terms) {
                if (searchableText.includes(term)) {
                    score++;
                }
            }

            return { product, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.map((item) => item.product);
}

/** Busca exata por código do produto. */
export function getProductByCode(code: string): CachedProduct | undefined {
    return cache.products.find((p) => p.code.toLowerCase() === code.toLowerCase());
}

/** Retorna todos os produtos do cache. */
export function getAllProducts(): CachedProduct[] {
    return cache.products;
}

/**
 * Busca produtos DIRETAMENTE no ERP via MySQL (fallback quando o cache está vazio
 * ou não encontra resultados).
 */
export async function searchProductsInERP(query: string): Promise<CachedProduct[]> {
    const pool = getErpPool();
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const likeClauses = terms.map(() => 'DESCRICAO_ITEM LIKE ?');
    const params = terms.map((t) => `%${t}%`);

    const sql = `SELECT * FROM VW_PRODUTOS WHERE ATIVO = "s" AND DEPARTAMENTO = "PRODUTO ACABADO" AND ${likeClauses.join(' AND ')} LIMIT 20`;

    try {
        const [rows] = await pool.execute<mysql.RowDataPacket[]>(sql, params);
        console.log(`[ProductCache] Busca direta no ERP para "${query}": ${rows.length} resultados`);

        const now = new Date().toISOString();
        return rows.map((row) => ({
            code: String(row['CODIGO_ITEM'] ?? row['code'] ?? row['ID'] ?? ''),
            name: String(row['DESCRICAO_ITEM'] ?? ''),
            aliases: [],
            description: String(row['DESCRICAO_ITEM'] ?? ''),
            unit: String(row['UNIDADE'] ?? row['unit'] ?? 'UN'),
            price: parseFloat(String(row['PRECO'] ?? row['PRECO_VENDA'] ?? row['price'] ?? 0)) || 0,
            updatedAt: now,
        }));
    } catch (err) {
        console.error('[ProductCache] Erro na busca direta no ERP:', err);
        return [];
    }
}

// ─── Funções internas ─────────────────────────────────────────────────────────

function isCacheExpired(): boolean {
    if (!cache.lastSync) return true;

    const lastSync = new Date(cache.lastSync).getTime();
    const ttlMs = PRODUCT_CACHE_TTL_HOURS * 60 * 60 * 1000;
    return Date.now() - lastSync > ttlMs;
}

async function persistCache(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`[ProductCache] Cache persistido em ${CACHE_FILE}`);
}
