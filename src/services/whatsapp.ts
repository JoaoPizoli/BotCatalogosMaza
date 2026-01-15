import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers, WAMessage } from '@whiskeysockets/baileys';
import P from 'pino';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import path from 'node:path';
import fs from 'node:fs';

// Agentes
import { agenteCatalogo } from '../agents/agenteCatalogo';
import { agenteEmbalagens } from '../agents/agenteEmbalagem';
import { agenteVideos } from '../agents/agenteVideos';

// Session Manager
import {
    getOrCreateSession,
    getSession,
    setAgentType,
    runAgentWithContext,
    clearSession,
    refreshTimeout,
    setOnSessionExpired,
    AgentType,
} from './sessionManager';

// Templates
import { mensagemBoasVindas, menuPrincipal } from '../utils/listTemplates';

let sock: ReturnType<typeof makeWASocket> | undefined;

// Mapeamento de números para tipo de agente
const NUMBER_TO_AGENT: Record<string, AgentType> = {
    '1': 'embalagem',
    '2': 'catalogo',
    '3': 'videos',
};

// Mensagens de boas-vindas por agente
const WELCOME_MESSAGES: Record<AgentType, string> = {
    embalagem: '📦 *Assistente de Embalagens*\n\nO que você procura? Pode me dizer o nome do produto ou tipo de embalagem.',
    catalogo: '📑 *Assistente de Catálogos Digitais*\n\nQual catálogo você precisa? Me diga o tipo de produto.',
    videos: '🎬 *Assistente de Vídeos de Treinamento*\n\nQual conteúdo você busca? Me diga o tema do treinamento.',
};

/**
 * Inicia o bot WhatsApp
 */
export async function startBot() {
    console.log("Iniciando bot com nova configuração...");
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'warn' }),
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
    });

    sock = socket;

    socket.ev.on('creds.update', saveCreds);

    // Configura callback de sessão expirada
    setOnSessionExpired(async (jid: string) => {
        await sendTextMessage(jid, '⏱️ Sessão encerrada por inatividade. Envie uma mensagem para recomeçar.');
    });

    // Evento de conexão
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const qrTerm = await QRCode.toString(qr, { type: 'terminal', small: true });
            console.clear();
            console.log('Escaneie este QR no WhatsApp > Aparelhos conectados:');
            console.log(qrTerm);
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;

            if (statusCode === DisconnectReason.restartRequired) {
                console.log('Reconectando...');
                startBot();
            } else {
                console.error('Conexão fechada:', statusCode, lastDisconnect?.error);
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado ao WhatsApp!');
            setupMessageHandler(socket);
        }
    });
}

/**
 * Configura handler de mensagens
 */
function setupMessageHandler(socket: ReturnType<typeof makeWASocket>) {
    socket.ev.on('messages.upsert', async ({ type, messages }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Ignora mensagens enviadas por nós
            if (msg.key.fromMe) continue;

            const jid = msg.key.remoteJid!;

            try {
                await handleMessage(socket, jid, msg);
            } catch (error) {
                console.error(`[Handler] Erro ao processar mensagem de ${jid}:`, error);
                await sendTextMessage(jid, '❌ Ocorreu um erro. Por favor, tente novamente.');
            }
        }
    });

    console.log('[Handler] Message handler configurado');
}

/**
 * Processa mensagem recebida
 */
async function handleMessage(
    socket: ReturnType<typeof makeWASocket>,
    jid: string,
    msg: WAMessage
) {
    // Extrai texto da mensagem
    const body = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ''
    ).trim();

    if (!body) return;

    console.log(`[Mensagem] ${jid}: ${body}`);

    const session = getOrCreateSession(jid);
    refreshTimeout(jid);

    // Se não tem agente definido, tenta detectar ou envia menu
    if (!session.agentType) {
        // Verifica se é um número do menu (1, 2 ou 3)
        const agentType = NUMBER_TO_AGENT[body] || detectAgentFromText(body);

        if (agentType) {
            await selectAgent(socket, jid, agentType);
        } else {
            // Envia boas-vindas + menu
            await sendTextMessage(jid, mensagemBoasVindas);
            await sendTextMessage(jid, menuPrincipal);
            console.log(`[Menu] Enviado para ${jid}`);
        }
        return;
    }

    // Tem agente ativo, processa com ele
    await processWithAgent(socket, jid, body);
}

// Nota: O Baileys não expõe facilmente o texto do voto da poll.
// A detecção de agente acontece via detectAgentFromText quando o usuário
// envia uma mensagem de texto após ver o menu.

/**
 * Detecta agente a partir do texto
 */
function detectAgentFromText(text: string): AgentType | null {
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

/**
 * Seleciona agente para a sessão
 */
async function selectAgent(
    socket: ReturnType<typeof makeWASocket>,
    jid: string,
    agentType: AgentType
) {
    setAgentType(jid, agentType);

    const welcomeMessage = WELCOME_MESSAGES[agentType];
    await sendTextMessage(jid, welcomeMessage);

    console.log(`[Agente] ${jid} -> ${agentType}`);
}

/**
 * Processa mensagem com o agente ativo
 */
async function processWithAgent(
    socket: ReturnType<typeof makeWASocket>,
    jid: string,
    message: string
) {
    const session = getSession(jid);
    if (!session?.agentType) return;

    // Verifica comandos especiais
    if (message.toLowerCase() === 'menu' || message.toLowerCase() === 'sair') {
        clearSession(jid);
        await sendTextMessage(jid, menuPrincipal);
        return;
    }

    // Seleciona agente
    const agent = getAgentByType(session.agentType);
    if (!agent) return;

    console.log(`[Agent] Processando com ${session.agentType}: "${message}"`);

    // Executa agente
    const response = await runAgentWithContext(jid, agent, message);

    // Verifica se tem arquivo para enviar
    const fileMatch = response.match(/__FILE_READY__:(.+?):(.+?)(?:$|\n)/);

    if (fileMatch) {
        const [, localPath, fileName] = fileMatch;

        // Remove a marcação da resposta
        const textResponse = response.replace(/__FILE_READY__.+?(?:$|\n)/, '').trim();

        if (textResponse) {
            await sendTextMessage(jid, textResponse);
        }

        // Envia arquivo
        await sendFile(socket, jid, localPath.trim(), fileName.trim());
    } else {
        // Apenas texto
        await sendTextMessage(jid, response);
    }
}

/**
 * Retorna agente pelo tipo
 */
function getAgentByType(type: AgentType) {
    switch (type) {
        case 'catalogo':
            return agenteCatalogo;
        case 'embalagem':
            return agenteEmbalagens;
        case 'videos':
            return agenteVideos;
        default:
            return null;
    }
}

/**
 * Envia mensagem de texto
 */
async function sendTextMessage(jid: string, text: string) {
    if (!sock) return;
    await sock.sendMessage(jid, { text });
}

/**
 * Envia arquivo
 */
async function sendFile(
    socket: ReturnType<typeof makeWASocket>,
    jid: string,
    localPath: string,
    fileName: string
) {
    try {
        // Verifica se arquivo existe
        if (!fs.existsSync(localPath)) {
            await sendTextMessage(jid, `❌ Arquivo não encontrado: ${fileName}`);
            return;
        }

        const ext = path.extname(localPath).toLowerCase();
        const buffer = fs.readFileSync(localPath);

        // Detecta tipo de mídia
        const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
        const isAudio = ['.mp3', '.ogg', '.m4a', '.wav'].includes(ext);

        if (isVideo) {
            await socket.sendMessage(jid, {
                video: buffer,
                caption: `🎬 ${fileName}`,
                mimetype: 'video/mp4',
            });
        } else if (isImage) {
            await socket.sendMessage(jid, {
                image: buffer,
                caption: `🖼️ ${fileName}`,
            });
        } else if (isAudio) {
            await socket.sendMessage(jid, {
                audio: buffer,
                mimetype: 'audio/mp4',
                ptt: false,
            });
        } else {
            // Documento genérico (PDF, etc)
            await socket.sendMessage(jid, {
                document: buffer,
                mimetype: getMimeType(ext),
                fileName: fileName,
            });
        }

        console.log(`[Arquivo] Enviado para ${jid}: ${fileName}`);
    } catch (error) {
        console.error('[Arquivo] Erro ao enviar:', error);
        await sendTextMessage(jid, `❌ Erro ao enviar arquivo: ${fileName}`);
    }
}

/**
 * Retorna mimetype pela extensão
 */
function getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
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
