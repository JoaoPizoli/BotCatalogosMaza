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
        ` SELECT CODIGO_ITEM, DESCRICAO_ITEM, VALOR_VENDA from VW_PRODUTOS where DEPARTAMENTO = "PRODUTO ACABADO" and DESCRICAO_ITEM NOT LIKE '%ÑUSAR+%' and ATIVO = "S" GROUP BY CODIGO_ITEM; `,
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
        const code = String(row['CODIGO_ITEM']);
        return {
            code,
            name: String(row['DESCRICAO_ITEM'] ?? ''),
            aliases: existingAliases.get(code) ?? [],
            description: String(row['DESCRICAO_ITEM'] ?? ''),
            unit: 'UN',
            price: parseFloat(String(row['VALOR_VENDA'] ?? 0)),
            updatedAt: now,
        };
    });

    cache = { products, lastSync: now };
    await persistCache();

    console.log(`[ProductCache] Sync concluído: ${products.length} produtos atualizados`);
}

// Stop words em português para filtrar dos termos de busca
const STOP_WORDS = new Set([
    'a', 'o', 'e', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
    'um', 'uma', 'uns', 'umas', 'com', 'por', 'para', 'ao', 'aos', 'se', 'que',
    'os', 'as', 'ou', 'mais', 'menos', 'como', 'seu', 'sua', 'isso', 'este',
    'essa', 'esse', 'não', 'sim', 'muito', 'bem', 'ser', 'ter', 'ir',
]);

/**
 * Busca produtos no cache por nome, aliases ou código.
 * Retorna também o score máximo para que o caller saiba se o resultado é forte.
 */
export function searchProducts(query: string): { scoredProducts: { product: CachedProduct; score: number }[]; maxScore: number; totalTerms: number } {
    const terms = query.toLowerCase().split(/\s+/)
        .filter(Boolean)
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
    if (terms.length === 0) return { scoredProducts: [], maxScore: 0, totalTerms: 0 };

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

    const maxScore = scored.length > 0 ? scored[0].score : 0;
    return {
        scoredProducts: scored,
        maxScore,
        totalTerms: terms.length,
    };
}

/** Busca exata por código do produto. Tenta o cache local, senão busca no ERP. */
export async function getProductByCode(code: string): Promise<CachedProduct | undefined> {
    const cached = cache.products.find((p) => p.code.toLowerCase() === code.toLowerCase());
    if (cached) {
        console.log(`[ProductCache] getProductByCode("${code}"): encontrado no cache (preço: ${cached.price})`);
        return cached;
    }

    // Fallback: busca direto no ERP por código
    console.log(`[ProductCache] getProductByCode("${code}"): não encontrado no cache (${cache.products.length} produtos). Buscando no ERP...`);
    try {
        const pool = getErpPool();
        const [rows] = await pool.execute<mysql.RowDataPacket[]>(
            `SELECT CODIGO_ITEM, DESCRICAO_ITEM, VALOR_VENDA FROM VW_PRODUTOS WHERE CODIGO_ITEM = ? AND DEPARTAMENTO = "PRODUTO ACABADO" AND ATIVO = "S" AND DESCRICAO_ITEM NOT LIKE '%ÑUSAR+%' LIMIT 1`,
            [code],
        );
        if (rows.length > 0) {
            const row = rows[0];
            const product: CachedProduct = {
                code: String(row['CODIGO_ITEM']),
                name: String(row['DESCRICAO_ITEM'] ?? ''),
                aliases: [],
                description: String(row['DESCRICAO_ITEM'] ?? ''),
                unit: 'UN',
                price: parseFloat(String(row['VALOR_VENDA'] ?? 0)),
                updatedAt: new Date().toISOString(),
            };
            // Adiciona ao cache em memória
            cache.products.push(product);
            console.log(`[ProductCache] getProductByCode("${code}"): encontrado no ERP (preço: ${product.price})`);
            return product;
        }
        console.log(`[ProductCache] getProductByCode("${code}"): NÃO encontrado no ERP`);
    } catch (err) {
        console.error(`[ProductCache] Erro ao buscar produto "${code}" no ERP:`, err);
    }
    return undefined;
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
    const terms = query.trim().split(/\s+/)
        .filter(Boolean)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t.toLowerCase()));
    if (terms.length === 0) return [];

    const likeClauses = terms.map(() => 'DESCRICAO_ITEM LIKE ?');
    const params = terms.map((t) => `%${t}%`);

    const sql = `SELECT CODIGO_ITEM, DESCRICAO_ITEM, VALOR_VENDA FROM VW_PRODUTOS WHERE ATIVO = "S" AND DESCRICAO_ITEM NOT LIKE '%ÑUSAR+%' AND DEPARTAMENTO = "PRODUTO ACABADO" AND ${likeClauses.join(' AND ')} GROUP BY CODIGO_ITEM LIMIT 20`;

    try {
        const [rows] = await pool.execute<mysql.RowDataPacket[]>(sql, params);
        console.log(`[ProductCache] Busca direta no ERP para "${query}": ${rows.length} resultados`);

        const now = new Date().toISOString();
        const results: CachedProduct[] = rows.map((row) => ({
            code: String(row['CODIGO_ITEM'] ?? ''),
            name: String(row['DESCRICAO_ITEM'] ?? ''),
            aliases: [],
            description: String(row['DESCRICAO_ITEM'] ?? ''),
            unit: 'UN',
            price: parseFloat(String(row['VALOR_VENDA'] ?? 0)),
            updatedAt: now,
        }));

        // Merge resultados no cache em memória para que getProductByCode os encontre
        for (const product of results) {
            if (!cache.products.find((p) => p.code === product.code)) {
                cache.products.push(product);
            }
        }
        console.log(`[ProductCache] ${results.length} produtos do ERP adicionados ao cache em memória`);

        return results;
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
