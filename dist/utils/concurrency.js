"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oneDriveSemaphore = exports.openAISemaphore = exports.Semaphore = void 0;
class Semaphore {
    constructor(maxConcurrent) {
        this.maxConcurrent = maxConcurrent;
        this.running = 0;
        this.queue = [];
    }
    async acquire() {
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
    release() {
        this.running--;
        const next = this.queue.shift();
        if (next)
            next();
    }
    async run(fn) {
        await this.acquire();
        try {
            return await fn();
        }
        finally {
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
exports.Semaphore = Semaphore;
exports.openAISemaphore = new Semaphore(10);
exports.oneDriveSemaphore = new Semaphore(20);
//# sourceMappingURL=concurrency.js.map