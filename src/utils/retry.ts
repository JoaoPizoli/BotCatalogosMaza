export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        baseDelayMs?: number;
        maxDelayMs?: number;
        onRetry?: (error: any, attempt: number) => void;
    } = {}
): Promise<T> {
    const {
        maxRetries = 3,
        baseDelayMs = 1000,
        maxDelayMs = 10000,
        onRetry,
    } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            const status = error?.response?.status || error?.status;
            if (status === 400 || status === 401 || status === 403 || status === 404) {
                throw error;
            }

            if (attempt > maxRetries) {
                throw error;
            }

            const delay = Math.min(
                baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500,
                maxDelayMs
            );

            if (onRetry) {
                onRetry(error, attempt);
            } else {
                console.log(`[Retry] Tentativa ${attempt}/${maxRetries} falhou, aguardando ${Math.round(delay)}ms...`);
            }

            await sleep(delay);
        }
    }

    throw lastError;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
