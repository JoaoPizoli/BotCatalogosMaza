import { compressVideo } from './videoCompressor';

interface QueueItem {
    id: string;
    task: () => Promise<string>;
    resolve: (path: string) => void;
    reject: (err: any) => void;
}

const MAX_CONCURRENT_TASKS = 1;

class VideoQueue {
    private queue: QueueItem[] = [];
    private activeCount = 0;

    /**
     * Adiciona uma tarefa de compressão à fila.
     * @param inputPath Caminho do vídeo original
     * @returns Promise que resolve com o caminho do vídeo comprimido
     */
    public add(inputPath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const id = Math.random().toString(36).substring(7);

            const task = async () => {
                console.log(`[VideoQueue] Iniciando tarefa ${id} para: ${inputPath}`);
                return await compressVideo(inputPath);
            };

            this.queue.push({ id, task, resolve, reject });
            console.log(`[VideoQueue] Tarefa ${id} adicionada à fila. Posição: ${this.queue.length}`);
            this.process();
        });
    }

    private async process() {
        if (this.activeCount >= MAX_CONCURRENT_TASKS || this.queue.length === 0) {
            return;
        }

        const item = this.queue.shift();
        if (!item) return;

        this.activeCount++;

        try {
            const result = await item.task();
            item.resolve(result);
        } catch (err) {
            console.error(`[VideoQueue] Erro na tarefa ${item.id}:`, err);
            item.reject(err);
        } finally {
            this.activeCount--;
            this.process();
        }
    }
}

export const videoQueue = new VideoQueue();
