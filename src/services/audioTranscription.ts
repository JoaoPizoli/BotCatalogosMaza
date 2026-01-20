import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';
import { Bot } from 'grammy';
import https from 'node:https';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Configura o path do ffmpeg
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

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
 * Converte áudio para MP3
 */
async function convertAudioToMp3(inputPath: string): Promise<string | null> {
    const outputPath = inputPath.replace(path.extname(inputPath), '.mp3');

    console.log(`[Audio] Convertendo para MP3: ${outputPath}`);

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('mp3')
            .on('end', () => resolve(outputPath))
            .on('error', (err) => {
                console.error('[Audio] Erro na conversão:', err);
                reject(err);
            })
            .save(outputPath);
    });
}

/**
 * Transcreve áudio
 */
export async function transcribeAudio(audioPath: string): Promise<string | null> {
    let fileToTranscribe = audioPath;
    let convertedFile: string | null = null;

    try {
        // Se for .oga ou .ogg, converte para mp3
        const ext = path.extname(audioPath).toLowerCase();
        if (ext === '.oga' || ext === '.ogg') {
            try {
                convertedFile = await convertAudioToMp3(audioPath);
                if (convertedFile) {
                    fileToTranscribe = convertedFile;
                }
            } catch (err) {
                console.error('[Transcription] Falha na conversão, tentando original...', err);
            }
        }

        console.log(`[Transcription] Iniciando transcrição de: ${fileToTranscribe}`);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(fileToTranscribe),
            model: "gpt-4o-transcribe", // Note: Verify if this model name is correct for your OpenAI version, otherwise standard is 'whisper-1'
            language: "pt",
            prompt: "O áudio está em português do Brasil."
        });

        console.log(`[Transcription] Resultado: "${transcription.text}"`);

        return transcription.text;
    } catch (error) {
        console.error('[Transcription] Erro:', error);
        return null;
    } finally {
        // Limpeza de arquivos
        try {
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            if (convertedFile && fs.existsSync(convertedFile)) fs.unlinkSync(convertedFile);
        } catch (e) {
            console.error('[Transcription] Erro ao limpar arquivos:', e);
        }
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
