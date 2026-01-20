import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { Bot } from 'grammy';
import https from 'node:https';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, });

// Diretório temporário para áudios
const AUDIO_TEMP_DIR = path.resolve(process.cwd(), 'cache', 'audio');

/**
 * Baixa o áudio do Telegram e salva localmente
 */
export async function downloadAudioFromTelegram(bot: Bot, fileId: string): Promise<string | null> {
    try {
        // Garante que o diretório existe
        if (!fs.existsSync(AUDIO_TEMP_DIR)) {
            fs.mkdirSync(AUDIO_TEMP_DIR, { recursive: true });
        }

        // Obtém informações do arquivo
        const file = await bot.api.getFile(fileId);
        if (!file.file_path) {
            console.log('[Audio] file_path não disponível');
            return null;
        }

        // Monta URL de download
        const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

        // Nome do arquivo local
        const ext = path.extname(file.file_path) || '.ogg';
        const fileName = `audio_${Date.now()}${ext}`;
        const filePath = path.join(AUDIO_TEMP_DIR, fileName);

        // Baixa o arquivo
        await new Promise<void>((resolve, reject) => {
            const fileStream = fs.createWriteStream(filePath);
            https.get(fileUrl, (response) => {
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(filePath, () => { });
                reject(err);
            });
        });

        console.log(`[Audio] Salvo em: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error('[Audio] Erro ao baixar:', error);
        return null;
    }
}

/**
 * Transcreve áudio
 */
export async function transcribeAudio(audioPath: string): Promise<string | null> {
    try {
        console.log(`[Transcription] Iniciando transcrição de: ${audioPath}`);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "gpt-4o-transcribe",
            language: "pt",
            prompt: "O áudio está em português do Brasil."
        });

        console.log(`[Transcription] Resultado: "${transcription.text}"`);

        // Remove arquivo temporário após transcrição
        try {
            fs.unlinkSync(audioPath);
        } catch (e) {
            // Ignora erro ao deletar
        }

        return transcription.text;
    } catch (error) {
        console.error('[Transcription] Erro:', error);
        return null;
    }
}

/**
 * Processa mensagem de áudio: baixa, transcreve e retorna texto
 */
export async function processAudioMessage(bot: Bot, fileId: string): Promise<string | null> {
    // Baixa o áudio
    const audioPath = await downloadAudioFromTelegram(bot, fileId);
    if (!audioPath) {
        return null;
    }

    // Transcreve
    const text = await transcribeAudio(audioPath);
    return text;
}
