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
const agents_1 = require("@openai/agents");
const concurrency_1 = require("../utils/concurrency");
const retry_1 = require("../utils/retry");
const structureCache_1 = require("../cache/structureCache");
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
    let structureContext = '';
    if (session.agentType && (0, structureCache_1.isStructureCacheReady)()) {
        const structure = (0, structureCache_1.getStructureForAgent)(session.agentType);
        if (structure) {
            structureContext = `\n[ESTRUTURA DE PASTAS DISPONÍVEIS]\n${structure}\n`;
        }
    }
    let input = '';
    if (structureContext) {
        input += structureContext + '\n';
    }
    if (contextParts.length > 0) {
        input += `[Histórico recente]\n${contextParts.join('\n')}\n\n`;
    }
    input += `[Mensagem atual]\nUsuário: ${userMessage}`;
    const result = await concurrency_1.openAISemaphore.run(() => (0, retry_1.withRetry)(() => (0, agents_1.run)(agent, input, { maxTurns: 25 }), {
        maxRetries: 2,
        baseDelayMs: 2000,
        onRetry: (err, attempt) => {
            console.log(`[Agent] Retry ${attempt} para ${jid}: ${err.message}`);
        }
    }));
    const response = typeof result.finalOutput === 'string'
        ? result.finalOutput
        : JSON.stringify(result.finalOutput);
    addMessage(jid, 'assistant', response);
    refreshTimeout(jid);
    return response;
}
//# sourceMappingURL=sessionManager.js.map