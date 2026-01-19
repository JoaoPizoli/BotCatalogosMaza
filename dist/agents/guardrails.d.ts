import { Agent } from '@openai/agents';
export declare function inputGuardrail(message: string): Promise<{
    allowed: boolean;
    reason?: string;
}>;
export declare const contextVerifierAgent: Agent<unknown, "text">;
export declare function verifyWithAgent(message: string): Promise<{
    allowed: boolean;
    reason?: string;
}>;
export declare function checkMessage(message: string, useAgentVerification?: boolean): Promise<{
    allowed: boolean;
    reason?: string;
}>;
//# sourceMappingURL=guardrails.d.ts.map