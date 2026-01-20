import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'node:path';
import fs from 'node:fs';

// Configura o caminho do binário ffmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Comprime um vídeo para tentar reduzir o tamanho para < 50MB
 * @param inputPath Caminho do vídeo original
 * @returns Promise<string> Caminho do vídeo final
 */
export function compressVideo(inputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const inputStats = fs.statSync(inputPath);
        const sizeMB = inputStats.size / (1024 * 1024);

        // Nome do arquivo de saída (na mesma pasta do original, com sufixo)
        const outputDir = path.dirname(inputPath);
        const ext = path.extname(inputPath);
        const name = path.basename(inputPath, ext);
        const outputPath = path.join(outputDir, `${name}_compressed${ext}`);

        console.log(`[Compressor] Iniciando compressão de: ${inputPath} (${sizeMB.toFixed(2)} MB)`);

        // Se já é menor que 50MB, não comprime
        if (sizeMB < 49) {
            console.log(`[Compressor] Arquivo já é pequeno o suficiente. Retornando original.`);
            resolve(inputPath);
            return;
        }

        // Configuração: 480p, crf 28, veryfast
        ffmpeg(inputPath)
            .outputOptions([
                '-c:v libx264',
                '-preset veryfast',
                '-crf 28',
                '-vf scale=-2:480',
                '-c:a aac',
                '-b:a 128k',
                '-movflags +faststart'
            ])
            .output(outputPath)
            .on('start', (commandLine: string) => {
                console.log(`[Compressor] Comando FFmpeg: ${commandLine}`);
            })
            .on('progress', (progress: any) => {
                if (progress.percent) {
                    // Log simples para não poluir
                }
            })
            .on('end', () => {
                console.log('[Compressor] Compressão concluída!');
                const outStats = fs.statSync(outputPath);
                console.log(`[Compressor] Tamanho final: ${(outStats.size / (1024 * 1024)).toFixed(2)} MB`);
                resolve(outputPath);
            })
            .on('error', (err: Error) => {
                console.error('[Compressor] Erro na compressão:', err);
                reject(err);
            })
            .run();
    });
}
