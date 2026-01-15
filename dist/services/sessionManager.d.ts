import { Agent } from '@openai/agents';
type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};
export type AgentType = 'catalogo' | 'embalagem' | 'videos';
export interface UserSession {
    jid: string;
    agentType: AgentType | null;
    messages: ChatMessage[];
    lastActivity: Date;
    timeoutTimer: NodeJS.Timeout | null;
}
export declare function setOnSessionExpired(callback: (jid: string) => Promise<void>): void;
export declare function getOrCreateSession(jid: string): UserSession;
export declare function getSession(jid: string): UserSession | undefined;
export declare function setAgentType(jid: string, agentType: AgentType): void;
export declare function addMessage(jid: string, role: 'user' | 'assistant', content: string): void;
export declare function refreshTimeout(jid: string): void;
export declare function clearSession(jid: string): void;
export declare function runAgentWithContext(jid: string, agent: Agent, userMessage: string): Promise<string>;
export declare function getSessionStats(): {
    total: number;
    byAgent: Record<string, number>;
};
export {};
//# sourceMappingURL=sessionManager.d.ts.map