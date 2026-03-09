/**
 * authManager.ts
 *
 * Gerencia a autenticação dos usuários do bot.
 *
 * Duas camadas:
 *  1. loginState (em memória) — estado temporário durante a coleta das credenciais
 *  2. authenticated_users (SQLite) — sessão de login persistida por AUTH_TTL_MS (padrão 30 dias)
 *
 * Fluxo de login:
 *   /start  →  startLoginFlow(chatId)  →  pede código do cliente
 *   usuário digita código  →  processLoginStep() salva estado awaiting_password
 *   usuário digita senha   →  processLoginStep() valida via validateCredentials()
 *                          →  se ok: persiste em authenticated_users
 *
 * /logoff  →  logoff(chatId)  →  remove de authenticated_users + limpa loginState
 */

import { getDb } from '../database/db';
import { AUTH_TTL_MS } from '../config/config';

// ─── Tipos internos ──────────────────────────────────────────────────────────

type LoginStateEntry =
    | { step: 'awaiting_code' }
    | { step: 'awaiting_password'; clientCode: string };

export type LoginResult =
    | 'success'
    | 'invalid_credentials'
    | 'need_code'
    | 'need_password'
    | 'not_in_flow';

export interface AuthenticatedUser {
    chatId: string;
    clientCode: string;
    loggedInAt: Date;
}

// ─── Estado em memória (coleta de credenciais) ────────────────────────────────

const loginState = new Map<string, LoginStateEntry>();

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Inicia o fluxo de login para um chatId.
 */
export function startLoginFlow(chatId: string): void {
    loginState.set(chatId, { step: 'awaiting_code' });
    console.log(`[Auth] Fluxo de login iniciado para ${chatId}`);
}

/**
 * Verifica se o chatId está em algum passo do fluxo de login.
 */
export function isInLoginFlow(chatId: string): boolean {
    return loginState.has(chatId);
}

/**
 * Retorna o passo atual do fluxo de login.
 */
export function getLoginStep(chatId: string): LoginStateEntry | undefined {
    return loginState.get(chatId);
}

/**
 * Processa uma mensagem de texto durante o fluxo de login.
 */
export async function processLoginStep(
    chatId: string,
    text: string,
): Promise<LoginResult> {
    const state = loginState.get(chatId);
    if (!state) return 'not_in_flow';

    if (state.step === 'awaiting_code') {
        const clientCode = text.trim();
        loginState.set(chatId, { step: 'awaiting_password', clientCode });
        console.log(`[Auth] Código recebido de ${chatId}: ${clientCode}`);
        return 'need_password';
    }

    if (state.step === 'awaiting_password') {
        const { clientCode } = state;
        const password = text.trim();

        const valid = await validateCredentials(clientCode, password);
        if (!valid) {
            loginState.set(chatId, { step: 'awaiting_code' });
            console.log(`[Auth] Credenciais inválidas para ${chatId} (código: ${clientCode})`);
            return 'invalid_credentials';
        }

        await persistLogin(chatId, clientCode);
        loginState.delete(chatId);
        console.log(`[Auth] Login bem-sucedido: ${chatId} (código: ${clientCode})`);
        return 'success';
    }

    return 'not_in_flow';
}

/**
 * Verifica se o chatId possui autenticação válida (dentro do TTL).
 */
export async function checkAuth(chatId: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    const cutoff = new Date(Date.now() - AUTH_TTL_MS).toISOString();
    const row = await db.get(
        'SELECT chat_id FROM authenticated_users WHERE chat_id = ? AND logged_in_at >= ?',
        [chatId, cutoff],
    );
    return !!row;
}

/**
 * Retorna os dados do usuário autenticado (ou null se não autenticado / expirado).
 */
export async function getAuthenticatedUser(chatId: string): Promise<AuthenticatedUser | null> {
    const db = getDb();
    if (!db) return null;

    const cutoff = new Date(Date.now() - AUTH_TTL_MS).toISOString();
    const row = await db.get(
        'SELECT chat_id, client_code, logged_in_at FROM authenticated_users WHERE chat_id = ? AND logged_in_at >= ?',
        [chatId, cutoff],
    );

    if (!row) return null;

    return {
        chatId: row.chat_id as string,
        clientCode: row.client_code as string,
        loggedInAt: new Date(row.logged_in_at as string),
    };
}

/**
 * Remove a autenticação do chatId (logoff).
 */
export async function logoff(chatId: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    await db.run('DELETE FROM authenticated_users WHERE chat_id = ?', [chatId]);
    loginState.delete(chatId);
    console.log(`[Auth] Logoff efetuado: ${chatId}`);
}

// ─── Funções internas ─────────────────────────────────────────────────────────

/**
 * Persiste o login bem-sucedido no SQLite.
 */
async function persistLogin(chatId: string, clientCode: string): Promise<void> {
    const db = getDb();
    if (!db) return;

    await db.run(
        `INSERT OR REPLACE INTO authenticated_users (chat_id, client_code, logged_in_at)
         VALUES (?, ?, datetime('now'))`,
        [chatId, clientCode],
    );
}

/**
 * Valida as credenciais do representante.
 */
async function validateCredentials(clientCode: string, password: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    const row = await db.get(
        'SELECT client_code FROM representatives WHERE client_code = ? AND password = ? AND active = 1',
        [clientCode, password],
    );
    return !!row;
}
