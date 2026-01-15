"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBot = startBot;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const qrcode_1 = __importDefault(require("qrcode"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const agenteCatalogo_1 = require("../agents/agenteCatalogo");
const agenteEmbalagem_1 = require("../agents/agenteEmbalagem");
const agenteVideos_1 = require("../agents/agenteVideos");
const sessionManager_1 = require("./sessionManager");
const listTemplates_1 = require("../utils/listTemplates");
let sock;
const NUMBER_TO_AGENT = {
    '1': 'embalagem',
    '2': 'catalogo',
    '3': 'videos',
};
const WELCOME_MESSAGES = {
    embalagem: '📦 *Assistente de Embalagens*\n\nO que você procura? Pode me dizer o nome do produto ou tipo de embalagem.',
    catalogo: '📑 *Assistente de Catálogos Digitais*\n\nQual catálogo você precisa? Me diga o tipo de produto.',
    videos: '🎬 *Assistente de Vídeos de Treinamento*\n\nQual conteúdo você busca? Me diga o tema do treinamento.',
};
async function startBot() {
    console.log("Iniciando bot com nova configuração...");
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)('./auth');
    const socket = (0, baileys_1.default)({
        auth: state,
        printQRInTerminal: false,
        logger: (0, pino_1.default)({ level: 'warn' }),
        browser: baileys_1.Browsers.macOS('Desktop'),
        syncFullHistory: false,
    });
    sock = socket;
    socket.ev.on('creds.update', saveCreds);
    (0, sessionManager_1.setOnSessionExpired)(async (jid) => {
        await sendTextMessage(jid, '⏱️ Sessão encerrada por inatividade. Envie uma mensagem para recomeçar.');
    });
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            const qrTerm = await qrcode_1.default.toString(qr, { type: 'terminal', small: true });
            console.clear();
            console.log('Escaneie este QR no WhatsApp > Aparelhos conectados:');
            console.log(qrTerm);
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === baileys_1.DisconnectReason.restartRequired) {
                console.log('Reconectando...');
                startBot();
            }
            else {
                console.error('Conexão fechada:', statusCode, lastDisconnect?.error);
            }
        }
        else if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!');
            setupMessageHandler(socket);
        }
    });
}
function setupMessageHandler(socket) {
    socket.ev.on('messages.upsert', async ({ type, messages }) => {
        if (type !== 'notify')
            return;
        for (const msg of messages) {
            if (msg.key.fromMe)
                continue;
            const jid = msg.key.remoteJid;
            try {
                await handleMessage(socket, jid, msg);
            }
            catch (error) {
                console.error(`[Handler] Erro ao processar mensagem de ${jid}:`, error);
                await sendTextMessage(jid, '❌ Ocorreu um erro. Por favor, tente novamente.');
            }
        }
    });
    console.log('[Handler] Message handler configurado');
}
async function handleMessage(socket, jid, msg) {
    const body = (msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '').trim();
    if (!body)
        return;
    console.log(`[Mensagem] ${jid}: ${body}`);
    const session = (0, sessionManager_1.getOrCreateSession)(jid);
    (0, sessionManager_1.refreshTimeout)(jid);
    if (!session.agentType) {
        const agentType = NUMBER_TO_AGENT[body] || detectAgentFromText(body);
        if (agentType) {
            await selectAgent(socket, jid, agentType);
        }
        else {
            await sendTextMessage(jid, listTemplates_1.mensagemBoasVindas);
            await sendTextMessage(jid, listTemplates_1.menuPrincipal);
            console.log(`[Menu] Enviado para ${jid}`);
        }
        return;
    }
    await processWithAgent(socket, jid, body);
}
function detectAgentFromText(text) {
    const lower = text.toLowerCase();
    if (lower.includes('embalagem') || lower.includes('embalagens')) {
        return 'embalagem';
    }
    if (lower.includes('catálogo') || lower.includes('catalogos') || lower.includes('catalogo')) {
        return 'catalogo';
    }
    if (lower.includes('vídeo') || lower.includes('video') || lower.includes('treinamento')) {
        return 'videos';
    }
    return null;
}
async function selectAgent(socket, jid, agentType) {
    (0, sessionManager_1.setAgentType)(jid, agentType);
    const welcomeMessage = WELCOME_MESSAGES[agentType];
    await sendTextMessage(jid, welcomeMessage);
    console.log(`[Agente] ${jid} -> ${agentType}`);
}
async function processWithAgent(socket, jid, message) {
    const session = (0, sessionManager_1.getSession)(jid);
    if (!session?.agentType)
        return;
    if (message.toLowerCase() === 'menu' || message.toLowerCase() === 'sair') {
        (0, sessionManager_1.clearSession)(jid);
        await sendTextMessage(jid, listTemplates_1.menuPrincipal);
        return;
    }
    const agent = getAgentByType(session.agentType);
    if (!agent)
        return;
    console.log(`[Agent] Processando com ${session.agentType}: "${message}"`);
    const response = await (0, sessionManager_1.runAgentWithContext)(jid, agent, message);
    const fileMatch = response.match(/__FILE_READY__:(.+?):(.+?)(?:$|\n)/);
    if (fileMatch) {
        const [, localPath, fileName] = fileMatch;
        const textResponse = response.replace(/__FILE_READY__.+?(?:$|\n)/, '').trim();
        if (textResponse) {
            await sendTextMessage(jid, textResponse);
        }
        await sendFile(socket, jid, localPath.trim(), fileName.trim());
    }
    else {
        await sendTextMessage(jid, response);
    }
}
function getAgentByType(type) {
    switch (type) {
        case 'catalogo':
            return agenteCatalogo_1.agenteCatalogo;
        case 'embalagem':
            return agenteEmbalagem_1.agenteEmbalagens;
        case 'videos':
            return agenteVideos_1.agenteVideos;
        default:
            return null;
    }
}
async function sendTextMessage(jid, text) {
    if (!sock)
        return;
    await sock.sendMessage(jid, { text });
}
async function sendFile(socket, jid, localPath, fileName) {
    try {
        if (!node_fs_1.default.existsSync(localPath)) {
            await sendTextMessage(jid, `❌ Arquivo não encontrado: ${fileName}`);
            return;
        }
        const ext = node_path_1.default.extname(localPath).toLowerCase();
        const buffer = node_fs_1.default.readFileSync(localPath);
        const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        const isAudio = ['.mp3', '.ogg', '.m4a', '.wav'].includes(ext);
        if (isVideo) {
            await socket.sendMessage(jid, {
                video: buffer,
                caption: `🎬 ${fileName}`,
                mimetype: 'video/mp4',
            });
        }
        else if (isImage) {
            await socket.sendMessage(jid, {
                image: buffer,
                caption: `🖼️ ${fileName}`,
            });
        }
        else if (isAudio) {
            await socket.sendMessage(jid, {
                audio: buffer,
                mimetype: 'audio/mp4',
                ptt: false,
            });
        }
        else {
            await socket.sendMessage(jid, {
                document: buffer,
                mimetype: getMimeType(ext),
                fileName: fileName,
            });
        }
        console.log(`[Arquivo] Enviado para ${jid}: ${fileName}`);
    }
    catch (error) {
        console.error('[Arquivo] Erro ao enviar:', error);
        await sendTextMessage(jid, `❌ Erro ao enviar arquivo: ${fileName}`);
    }
}
function getMimeType(ext) {
    const mimeTypes = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}
//# sourceMappingURL=whatsapp.js.map