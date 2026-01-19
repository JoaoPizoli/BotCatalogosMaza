export declare function withRetry<T>(fn: () => Promise<T>, options?: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (error: any, attempt: number) => void;
}): Promise<T>;
//# sourceMappingURL=retry.d.ts.map