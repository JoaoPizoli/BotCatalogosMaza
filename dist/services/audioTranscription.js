"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAudioMessage = isAudioMessage;
exports.downloadAudio = downloadAudio;
exports.transcribeAudio = transcribeAudio;
exports.processAudioMessage = processAudioMessage;
const openai_1 = __importDefault(require("openai"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const baileys_1 = require("@whiskeysockets/baileys");
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const AUDIO_TEMP_DIR = node_path_1.default.resolve(process.cwd(), 'cache', 'audio');
function isAudioMessage(msg) {
    return !!(msg.message?.audioMessage);
}
async function downloadAudio(msg) {
    try {
        if (!node_fs_1.default.existsSync(AUDIO_TEMP_DIR)) {
            node_fs_1.default.mkdirSync(AUDIO_TEMP_DIR, { recursive: true });
        }
        const buffer = await (0, baileys_1.downloadMediaMessage)(msg, 'buffer', {});
        if (!buffer) {
            console.log('[Audio] Não foi possível baixar o áudio');
            return null;
        }
        const fileName = `audio_${Date.now()}.ogg`;
        const filePath = node_path_1.default.join(AUDIO_TEMP_DIR, fileName);
        node_fs_1.default.writeFileSync(filePath, buffer);
        console.log(`[Audio] Salvo em: ${filePath}`);
        return filePath;
    }
    catch (error) {
        console.error('[Audio] Erro ao baixar:', error);
        return null;
    }
}
async function transcribeAudio(audioPath) {
    try {
        console.log(`[Transcription] Iniciando transcrição de: ${audioPath}`);
        const transcription = await openai.audio.transcriptions.create({
            file: node_fs_1.default.createReadStream(audioPath),
            model: "gpt-4o-transcribe",
            language: "pt",
            prompt: "O áudio está em português do Brasil."
        });
        console.log(`[Transcription] Resultado: "${transcription.text}"`);
        try {
            node_fs_1.default.unlinkSync(audioPath);
        }
        catch (e) {
        }
        return transcription.text;
    }
    catch (error) {
        console.error('[Transcription] Erro:', error);
        return null;
    }
}
async function processAudioMessage(msg) {
    const audioPath = await downloadAudio(msg);
    if (!audioPath) {
        return null;
    }
    const text = await transcribeAudio(audioPath);
    return text;
}
//# sourceMappingURL=audioTranscription.js.map