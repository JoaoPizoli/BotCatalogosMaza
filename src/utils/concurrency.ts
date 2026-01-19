export class Semaphore {
    private running = 0;
    private queue: Array<() => void> = [];

    constructor(private maxConcurrent: number) { }

    async acquire(): Promise<void> {
        if (this.running < this.maxConcurrent) {
            this.running++;
            return;
        }

        return new Promise((resolve) => {
            this.queue.push(() => {
                this.running++;
                resolve();
            });
        });
    }

    release(): void {
        this.running--;
        const next = this.queue.shift();
        if (next) next();
    }


    async run<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire();
        try {
            return await fn();
        } finally {
            this.release();
        }
    }

    getStats() {
        return {
            running: this.running,
            waiting: this.queue.length,
            max: this.maxConcurrent,
        };
    }
}


export const openAISemaphore = new Semaphore(10);  // Max 10 chamadas OpenAI simultâneas
export const oneDriveSemaphore = new Semaphore(20); // Max 20 chamadas OneDrive simultâneas
