import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import type { WAMessage } from '@whiskeysockets/baileys';

// Cliente OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Diretório temporário para áudios
const AUDIO_TEMP_DIR = path.resolve(process.cwd(), 'cache', 'audio');

/**
 * Verifica se a mensagem contém áudio
 */
export function isAudioMessage(msg: WAMessage): boolean {
    return !!(
        msg.message?.audioMessage
    );
}

/**
 * Baixa o áudio da mensagem e salva localmente
 */
export async function downloadAudio(msg: WAMessage): Promise<string | null> {
    try {
        // Garante que o diretório existe
        if (!fs.existsSync(AUDIO_TEMP_DIR)) {
            fs.mkdirSync(AUDIO_TEMP_DIR, { recursive: true });
        }

        // Baixa o áudio
        const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
        );

        if (!buffer) {
            console.log('[Audio] Não foi possível baixar o áudio');
            return null;
        }

        // Salva o arquivo temporariamente
        const fileName = `audio_${Date.now()}.ogg`;
        const filePath = path.join(AUDIO_TEMP_DIR, fileName);

        fs.writeFileSync(filePath, buffer);
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
export async function processAudioMessage(msg: WAMessage): Promise<string | null> {
    // Baixa o áudio
    const audioPath = await downloadAudio(msg);
    if (!audioPath) {
        return null;
    }

    // Transcreve
    const text = await transcribeAudio(audioPath);
    return text;
}


