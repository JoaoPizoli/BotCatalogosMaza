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
const socks_proxy_agent_1 = require("socks-proxy-agent");
const https_proxy_agent_1 = require("https-proxy-agent");
const agenteCatalogo_1 = require("../agents/agenteCatalogo");
const agenteEmbalagem_1 = require("../agents/agenteEmbalagem");
const agenteVideos_1 = require("../agents/agenteVideos");
const sessionManager_1 = require("./sessionManager");
const listTemplates_1 = require("../utils/listTemplates");
const guardrails_1 = require("../agents/guardrails");
const audioTranscription_1 = require("./audioTranscription");
let sock;
function getDisconnectReasonName(code) {
    if (!code)
        return 'unknown';
    const reasons = {
        [baileys_1.DisconnectReason.badSession]: 'badSession',
        [baileys_1.DisconnectReason.connectionClosed]: 'connectionClosed',
        [baileys_1.DisconnectReason.connectionLost]: 'connectionLost',
        [baileys_1.DisconnectReason.connectionReplaced]: 'connectionReplaced',
        [baileys_1.DisconnectReason.loggedOut]: 'loggedOut',
        [baileys_1.DisconnectReason.restartRequired]: 'restartRequired',
        [baileys_1.DisconnectReason.timedOut]: 'timedOut',
    };
    return reasons[code] || `code_${code}`;
}
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
function isTranscriptionUnclear(text) {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
        return true;
    }
    const nonsensePatterns = [
        /^[aeiouáéíóúãõ\s]+$/i,
        /^(hm+|ah+|eh+|uh+|oh+|ih+)+$/i,
        /^\.+$/,
        /^\?+$/,
        /^!+$/,
        /^(blá|bla|lalala|tá|né|então|tipo|assim)+$/i,
    ];
    for (const pattern of nonsensePatterns) {
        if (pattern.test(trimmed)) {
            return true;
        }
    }
    if (/(.)\1{4,}/.test(trimmed)) {
        return true;
    }
    const words = trimmed.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0 && trimmed.length < 10) {
        return true;
    }
    return false;
}
async function startBot() {
    console.log("Iniciando bot...");
    const fs = await Promise.resolve().then(() => __importStar(require('node:fs')));
    const authPath = './auth';
    const hasAuth = fs.existsSync(authPath) && fs.readdirSync(authPath).length > 0;
    console.log(`[Auth] Sessão existente: ${hasAuth ? 'SIM' : 'NÃO (vai gerar QR)'}`);
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(authPath);
    console.log('[Socket] Criando conexão...');
    let agent;
    const proxyUrl = process.env.WHATSAPP_PROXY;
    if (proxyUrl) {
        console.log(`[Proxy] Usando proxy: ${proxyUrl.replace(/:[^:@]+@/, ':****@')}`);
        if (proxyUrl.startsWith('socks')) {
            agent = new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
        }
        else {
            agent = new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        }
    }
    const pairingPhoneNumber = process.env.WHATSAPP_PAIRING_PHONE;
    const socket = (0, baileys_1.default)({
        auth: state,
        logger: (0, pino_1.default)({ level: 'warn' }),
        browser: pairingPhoneNumber
            ? ['Chrome (Linux)', 'Chrome', '120.0.0']
            : ['Bot Maza', 'Chrome', '120.0.0'],
        syncFullHistory: false,
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 10000,
        markOnlineOnConnect: false,
        agent,
    });
    console.log('[Socket] Conexão criada, aguardando eventos...');
    sock = socket;
    socket.ev.on('creds.update', saveCreds);
    (0, sessionManager_1.setOnSessionExpired)(async (jid) => {
        await sendTextMessage(jid, '⏱️ Sessão encerrada por inatividade. Envie uma mensagem para recomeçar.');
    });
    let retryCount = 0;
    const MAX_RETRIES = 10;
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            retryCount = 0;
            console.log('\n' + '='.repeat(50));
            console.log('📱 QR CODE - Escaneie com WhatsApp:');
            console.log('='.repeat(50));
            const qrTerm = await qrcode_1.default.toString(qr, { type: 'terminal', small: true });
            console.log(qrTerm);
            console.log('='.repeat(50));
            console.log('Abra WhatsApp > Aparelhos Conectados > Conectar');
            console.log('='.repeat(50) + '\n');
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`[Conexão] Fechada - Código: ${statusCode} (${getDisconnectReasonName(statusCode)})`);
            if (statusCode === baileys_1.DisconnectReason.loggedOut) {
                console.error('\n❌ Sessão encerrada. Delete a pasta auth/ e reinicie.\n');
                process.exit(1);
            }
            if (statusCode === baileys_1.DisconnectReason.restartRequired) {
                console.log('[Conexão] Restart necessário (normal após QR scan), reconectando...');
                startBot();
                return;
            }
            if (statusCode === baileys_1.DisconnectReason.connectionClosed) {
                console.log('[Conexão] Conexão fechada, reconectando...');
                startBot();
                return;
            }
            if (statusCode === baileys_1.DisconnectReason.connectionLost) {
                console.log('[Conexão] Conexão perdida, reconectando...');
                startBot();
                return;
            }
            if (statusCode === 408 || statusCode === 503 || statusCode === 515) {
                retryCount++;
                if (retryCount > MAX_RETRIES) {
                    console.error('\n❌ Muitas tentativas falhas. Possíveis causas:');
                    console.error('1. IP do servidor pode estar bloqueado pelo WhatsApp');
                    console.error('2. Conexão de internet instável');
                    console.error('3. Configure WHATSAPP_PROXY no .env para usar um proxy');
                    console.error('4. Delete a pasta auth/ e tente novamente\n');
                    process.exit(1);
                }
                const delay = Math.min(retryCount * 2000, 10000);
                console.log(`[Conexão] Tentativa ${retryCount}/${MAX_RETRIES} - Aguardando ${delay / 1000}s...`);
                setTimeout(() => startBot(), delay);
                return;
            }
            console.log('[Conexão] Reconectando em 3s...');
            setTimeout(() => startBot(), 3000);
        }
        else if (connection === 'open') {
            console.log('\n✅ CONECTADO AO WHATSAPP!\n');
            retryCount = 0;
            setupMessageHandler(socket);
        }
        else if (connection === 'connecting') {
            console.log('[Conexão] Conectando...');
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
    let body = '';
    let isFromAudio = false;
    if ((0, audioTranscription_1.isAudioMessage)(msg)) {
        console.log(`[Audio] Recebido áudio de ${jid}, transcrevendo...`);
        await sendTextMessage(jid, '🎤 Transcrevendo seu áudio...');
        const transcription = await (0, audioTranscription_1.processAudioMessage)(msg);
        if (transcription) {
            body = transcription;
            isFromAudio = true;
            console.log(`[Audio] Transcrição: "${body}"`);
            if (isTranscriptionUnclear(body)) {
                console.log(`[Audio] Transcrição parece confusa, pedindo clareza`);
                await sendTextMessage(jid, '🔊 Não consegui entender bem o seu áudio. Poderia falar com mais clareza ou enviar uma mensagem de texto?');
                return;
            }
        }
        else {
            await sendTextMessage(jid, '❌ Não consegui transcrever o áudio. Por favor, envie uma mensagem de texto.');
            return;
        }
    }
    else {
        body = (msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            '').trim();
    }
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
    const guardrailResult = await (0, guardrails_1.checkMessage)(message);
    if (!guardrailResult.allowed) {
        console.log(`[Guardrail] Mensagem bloqueada de ${jid}: "${message.substring(0, 50)}..."`);
        await sendTextMessage(jid, guardrailResult.reason || 'Desculpe, não entendi. Como posso ajudar com produtos da Maza?');
        return;
    }
    const agent = getAgentByType(session.agentType);
    if (!agent)
        return;
    console.log(`[Agent] Processando com ${session.agentType}: "${message}"`);
    await sendTextMessage(jid, '🔍 Aguarde, estou procurando o que você pediu...');
    const response = await (0, sessionManager_1.runAgentWithContext)(jid, agent, message);
    console.log(`[DEBUG] Resposta do agente: ${response.substring(0, 200)}...`);
    console.log(`[DEBUG] Resposta completa contém __FILE_READY__: ${response.includes('__FILE_READY__')}`);
    const fileMatch = response.match(/__FILE_READY__\|\|\|([^|]+)\|\|\|([^|\n\r]+)/);
    console.log(`[DEBUG] fileMatch encontrado: ${fileMatch ? 'SIM' : 'NÃO'}`);
    if (fileMatch) {
        console.log(`[DEBUG] Match completo: ${fileMatch[0]}`);
        console.log(`[DEBUG] localPath: "${fileMatch[1]}"`);
        console.log(`[DEBUG] fileName: "${fileMatch[2]}"`);
    }
    if (fileMatch) {
        const [, localPath, fileName] = fileMatch;
        const textResponse = response.replace(/__FILE_READY__\|\|\|[^|]+\|\|\|[^|\n\r]+/, '').trim();
        console.log(`[DEBUG] Tentando enviar arquivo: ${localPath.trim()}`);
        await sendFile(socket, jid, localPath.trim(), fileName.trim());
        if (textResponse) {
            await sendTextMessage(jid, textResponse);
        }
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
    if (!sock) {
        console.log('[sendTextMessage] Socket não disponível');
        return;
    }
    try {
        await sock.sendMessage(jid, { text });
    }
    catch (error) {
        console.error(`[sendTextMessage] Erro ao enviar mensagem: ${error.message}`);
    }
}
async function sendFile(socket, jid, localPath, fileName) {
    try {
        console.log(`[sendFile] Iniciando envio...`);
        console.log(`[sendFile] localPath: "${localPath}"`);
        console.log(`[sendFile] fileName: "${fileName}"`);
        if (!node_fs_1.default.existsSync(localPath)) {
            console.log(`[sendFile] ERRO: Arquivo não existe no caminho!`);
            await sendTextMessage(jid, `❌ Arquivo não encontrado: ${fileName}`);
            return;
        }
        const ext = node_path_1.default.extname(localPath).toLowerCase();
        const stats = node_fs_1.default.statSync(localPath);
        console.log(`[sendFile] Extensão: ${ext}`);
        console.log(`[sendFile] Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        const buffer = node_fs_1.default.readFileSync(localPath);
        console.log(`[sendFile] Buffer lido: ${buffer.length} bytes`);
        const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        const isAudio = ['.mp3', '.ogg', '.m4a', '.wav'].includes(ext);
        console.log(`[sendFile] Tipo detectado: isVideo=${isVideo}, isImage=${isImage}, isAudio=${isAudio}`);
        if (isVideo) {
            console.log(`[sendFile] Enviando como vídeo...`);
            await socket.sendMessage(jid, {
                video: buffer,
                caption: `🎬 ${fileName}`,
                mimetype: 'video/mp4',
            });
            console.log(`[sendFile] Vídeo enviado com sucesso!`);
        }
        else if (isImage) {
            console.log(`[sendFile] Enviando como imagem...`);
            await socket.sendMessage(jid, {
                image: buffer,
                caption: `🖼️ ${fileName}`,
            });
            console.log(`[sendFile] Imagem enviada com sucesso!`);
        }
        else if (isAudio) {
            console.log(`[sendFile] Enviando como áudio...`);
            await socket.sendMessage(jid, {
                audio: buffer,
                mimetype: 'audio/mp4',
                ptt: false,
            });
            console.log(`[sendFile] Áudio enviado com sucesso!`);
        }
        else {
            console.log(`[sendFile] Enviando como documento...`);
            await socket.sendMessage(jid, {
                document: buffer,
                mimetype: getMimeType(ext),
                fileName: fileName,
            });
            console.log(`[sendFile] Documento enviado com sucesso!`);
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