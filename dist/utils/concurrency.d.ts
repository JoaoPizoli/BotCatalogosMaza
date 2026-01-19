export declare class Semaphore {
    private maxConcurrent;
    private running;
    private queue;
    constructor(maxConcurrent: number);
    acquire(): Promise<void>;
    release(): void;
    run<T>(fn: () => Promise<T>): Promise<T>;
    getStats(): {
        running: number;
        waiting: number;
        max: number;
    };
}
export declare const openAISemaphore: Semaphore;
export declare const oneDriveSemaphore: Semaphore;
//# sourceMappingURL=concurrency.d.ts.map