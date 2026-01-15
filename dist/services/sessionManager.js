"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setOnSessionExpired = setOnSessionExpired;
exports.getOrCreateSession = getOrCreateSession;
exports.getSession = getSession;
exports.setAgentType = setAgentType;
exports.addMessage = addMessage;
exports.refreshTimeout = refreshTimeout;
exports.clearSession = clearSession;
exports.runAgentWithContext = runAgentWithContext;
exports.getSessionStats = getSessionStats;
const agents_1 = require("@openai/agents");
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const sessions = new Map();
let onSessionExpiredCallback = null;
function setOnSessionExpired(callback) {
    onSessionExpiredCallback = callback;
}
function getOrCreateSession(jid) {
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
function getSession(jid) {
    return sessions.get(jid);
}
function setAgentType(jid, agentType) {
    const session = sessions.get(jid);
    if (session) {
        session.agentType = agentType;
        console.log(`[Session] Agente definido para ${jid}: ${agentType}`);
    }
}
function addMessage(jid, role, content) {
    const session = sessions.get(jid);
    if (session) {
        session.messages.push({ role, content });
        if (session.messages.length > 20) {
            session.messages = session.messages.slice(-20);
        }
    }
}
function refreshTimeout(jid) {
    const session = sessions.get(jid);
    if (!session)
        return;
    session.lastActivity = new Date();
    if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
    }
    session.timeoutTimer = setTimeout(async () => {
        console.log(`[Session] Sessão expirada por inatividade: ${jid}`);
        if (onSessionExpiredCallback) {
            await onSessionExpiredCallback(jid);
        }
        clearSession(jid);
    }, SESSION_TIMEOUT_MS);
}
function clearSession(jid) {
    const session = sessions.get(jid);
    if (session) {
        if (session.timeoutTimer) {
            clearTimeout(session.timeoutTimer);
        }
        sessions.delete(jid);
        console.log(`[Session] Sessão removida: ${jid}`);
    }
}
async function runAgentWithContext(jid, agent, userMessage) {
    const session = getOrCreateSession(jid);
    addMessage(jid, 'user', userMessage);
    const recentHistory = session.messages.slice(-10);
    const contextParts = recentHistory.slice(0, -1).map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`);
    const input = contextParts.length > 0
        ? `[Histórico recente]\n${contextParts.join('\n')}\n\n[Mensagem atual]\nUsuário: ${userMessage}`
        : userMessage;
    const result = await (0, agents_1.run)(agent, input);
    const response = typeof result.finalOutput === 'string'
        ? result.finalOutput
        : JSON.stringify(result.finalOutput);
    addMessage(jid, 'assistant', response);
    refreshTimeout(jid);
    return response;
}
function getSessionStats() {
    const byAgent = {
        catalogo: 0,
        embalagem: 0,
        videos: 0,
        none: 0,
    };
    for (const session of sessions.values()) {
        if (session.agentType) {
            byAgent[session.agentType]++;
        }
        else {
            byAgent['none']++;
        }
    }
    return {
        total: sessions.size,
        byAgent,
    };
}
//# sourceMappingURL=sessionManager.js.map