import { run, Agent } from '@openai/agents';
import { openAISemaphore } from '../utils/concurrency';
import { withRetry } from '../utils/retry';
import { getStructureForAgent, isStructureCacheReady } from '../cache/structureCache';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type AgentType = 'catalogo' | 'embalagem' | 'videos';

export interface UserSession {
    jid: string;
    agentType: AgentType | null;
    messages: ChatMessage[];
    lastActivity: Date;
    timeoutTimer: NodeJS.Timeout | null;
    // Rate limiting
    requestTimestamps: number[];
}

// Timeout de inatividade: 5 minutos
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

// Rate limiting: máximo de mensagens por minuto
const MAX_MESSAGES_PER_MINUTE = 20;

// Map de sessões por JID (telefone)
const sessions = new Map<string, UserSession>();

// Callback para quando sessão expira
let onSessionExpiredCallback: ((jid: string) => Promise<void>) | null = null;

/**
 * Define callback para quando uma sessão expira
 */
export function setOnSessionExpired(callback: (jid: string) => Promise<void>) {
    onSessionExpiredCallback = callback;
}

/**
 * Obtém ou cria uma sessão para o usuário
 */
export function getOrCreateSession(jid: string): UserSession {
    let session = sessions.get(jid);

    if (!session) {
        session = {
            jid,
            agentType: null,
            messages: [],
            lastActivity: new Date(),
            timeoutTimer: null,
            requestTimestamps: [],
        };
        sessions.set(jid, session);
        console.log(`[Session] Nova sessão criada para ${jid}`);
    }

    return session;
}

/**
 * Obtém sessão existente (ou undefined se não existir)
 */
export function getSession(jid: string): UserSession | undefined {
    return sessions.get(jid);
}

/**
 * Define o tipo de agente ativo para a sessão
 */
export function setAgentType(jid: string, agentType: AgentType): void {
    const session = sessions.get(jid);
    if (session) {
        session.agentType = agentType;
        console.log(`[Session] Agente definido para ${jid}: ${agentType}`);
    }
}

/**
 * Adiciona mensagem ao histórico da sessão
 */
export function addMessage(jid: string, role: 'user' | 'assistant', content: string): void {
    const session = sessions.get(jid);
    if (session) {
        session.messages.push({ role, content });
        if (session.messages.length > 20) {
            session.messages = session.messages.slice(-20);
        }
    }
}

/**
 * Atualiza atividade e reseta timer de timeout
 */
export function refreshTimeout(jid: string): void {
    const session = sessions.get(jid);
    if (!session) return;

    session.lastActivity = new Date();

    // Limpa timer anterior
    if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
    }

    // Configura novo timer
    session.timeoutTimer = setTimeout(async () => {
        console.log(`[Session] Sessão expirada por inatividade: ${jid}`);

        // Chama callback de expiração
        if (onSessionExpiredCallback) {
            await onSessionExpiredCallback(jid);
        }

        // Remove sessão
        clearSession(jid);
    }, SESSION_TIMEOUT_MS);
}

/**
 * Verifica rate limiting (máx 20 msgs/minuto)
 * Retorna true se permitido, false se bloqueado
 */
export function checkRateLimit(jid: string): { allowed: boolean; remainingSeconds?: number } {
    const session = sessions.get(jid);
    if (!session) return { allowed: true };

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // Remove timestamps antigos (> 1 minuto)
    session.requestTimestamps = session.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    // Verifica se excedeu o limite
    if (session.requestTimestamps.length >= MAX_MESSAGES_PER_MINUTE) {
        // Calcula tempo até liberar
        const oldestTimestamp = session.requestTimestamps[0];
        const remainingSeconds = Math.ceil((oldestTimestamp + 60 * 1000 - now) / 1000);
        console.log(`[RateLimit] Usuário ${jid} bloqueado. ${session.requestTimestamps.length} msgs no último minuto.`);
        return { allowed: false, remainingSeconds };
    }

    // Registra novo timestamp
    session.requestTimestamps.push(now);
    return { allowed: true };
}

/**
 * Limpa sessão (remove do Map e cancela timer)
 */
export function clearSession(jid: string): void {
    const session = sessions.get(jid);
    if (session) {
        if (session.timeoutTimer) {
            clearTimeout(session.timeoutTimer);
        }
        sessions.delete(jid);
        console.log(`[Session] Sessão removida: ${jid}`);
    }
}

/**
 * Executa agente com contexto da sessão
 * Usa semáforo para limitar concorrência e retry para resilência
 * Injeta estrutura de pastas do OneDrive no contexto
 */
export async function runAgentWithContext(
    jid: string,
    agent: Agent,
    userMessage: string
): Promise<string> {
    const session = getOrCreateSession(jid);

    // Adiciona mensagem do usuário ao histórico
    addMessage(jid, 'user', userMessage);

    // Monta contexto com histórico recente (últimas 10 mensagens)
    const recentHistory = session.messages.slice(-10);
    const contextParts = recentHistory.slice(0, -1).map(m =>
        `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`
    );

    // Obtém estrutura de pastas do cache (se disponível)
    let structureContext = '';
    if (session.agentType && isStructureCacheReady()) {
        const structure = getStructureForAgent(session.agentType);
        if (structure) {
            structureContext = `\n[ESTRUTURA DE PASTAS DISPONÍVEIS]\n${structure}\n`;
        }
    }

    // Monta input com contexto completo
    let input = '';
    if (structureContext) {
        input += structureContext + '\n';
    }
    if (contextParts.length > 0) {
        input += `[Histórico recente]\n${contextParts.join('\n')}\n\n`;
    }
    input += `[Mensagem atual]\nUsuário: ${userMessage}`;

    // Executa com controle de concorrência (max 10 simultâneos) e retry
    const result = await openAISemaphore.run(() =>
        withRetry(
            () => run(agent, input, { maxTurns: 25 }),
            {
                maxRetries: 2,
                baseDelayMs: 2000,
                onRetry: (err, attempt) => {
                    console.log(`[Agent] Retry ${attempt} para ${jid}: ${err.message}`);
                }
            }
        )
    );

    // Obtém resposta
    const response = typeof result.finalOutput === 'string'
        ? result.finalOutput
        : JSON.stringify(result.finalOutput);

    // Adiciona resposta ao histórico
    addMessage(jid, 'assistant', response);

    // Atualiza timeout
    refreshTimeout(jid);

    return response;
}


