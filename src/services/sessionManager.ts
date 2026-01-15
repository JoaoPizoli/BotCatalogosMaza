import { run, Agent } from '@openai/agents';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type AgentType = 'catalogo' | 'embalagem' | 'videos';

export interface UserSession {
    jid: string;
    agentType: AgentType | null;
    messages: ChatMessage[];
    lastActivity: Date;
    timeoutTimer: NodeJS.Timeout | null;
}

// Timeout de inatividade: 5 minutos
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

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

    // Monta input com contexto
    const input = contextParts.length > 0
        ? `[Histórico recente]\n${contextParts.join('\n')}\n\n[Mensagem atual]\nUsuário: ${userMessage}`
        : userMessage;

    // Executa agente
    const result = await run(agent, input);

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

/**
 * Retorna estatísticas das sessões ativas
 */
export function getSessionStats(): { total: number; byAgent: Record<string, number> } {
    const byAgent: Record<string, number> = {
        catalogo: 0,
        embalagem: 0,
        videos: 0,
        none: 0,
    };

    for (const session of sessions.values()) {
        if (session.agentType) {
            byAgent[session.agentType]++;
        } else {
            byAgent['none']++;
        }
    }

    return {
        total: sessions.size,
        byAgent,
    };
}
