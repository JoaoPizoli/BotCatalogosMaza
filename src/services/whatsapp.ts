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

// Guardrails
import { checkMessage } from '../agents/guardrails';

// Audio Transcription
import { isAudioMessage, processAudioMessage } from './audioTranscription';

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
 * Verifica se a transcrição parece confusa ou sem sentido
 */
function isTranscriptionUnclear(text: string): boolean {
    const trimmed = text.trim();

    // Muito curta (menos de 3 caracteres)
    if (trimmed.length < 3) {
        return true;
    }

    // Apenas sons/interjeições sem sentido
    const nonsensePatterns = [
        /^[aeiouáéíóúãõ\s]+$/i,           // Apenas vogais
        /^(hm+|ah+|eh+|uh+|oh+|ih+)+$/i,  // Sons de hesitação
        /^\.+$/,                           // Apenas pontos
        /^\?+$/,                           // Apenas interrogações
        /^!+$/,                            // Apenas exclamações
        /^(blá|bla|lalala|tá|né|então|tipo|assim)+$/i, // Palavras vazias repetidas
    ];

    for (const pattern of nonsensePatterns) {
        if (pattern.test(trimmed)) {
            return true;
        }
    }

    // Muitos caracteres repetidos (ex: "aaaaaaa", "kkkkkk")
    if (/(.)\1{4,}/.test(trimmed)) {
        return true;
    }

    // Texto muito curto sem palavras reconhecíveis
    const words = trimmed.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0 && trimmed.length < 10) {
        return true;
    }

    return false;
}

/**
 * Inicia o bot WhatsApp
 */
export async function startBot() {
    console.log("Iniciando bot com nova configuração...");
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: true,  // Ativado para mostrar QR no terminal
        logger: P({ level: 'warn' }),
        browser: Browsers.ubuntu('Desktop'),
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

            console.log(`[Conexão] Fechada com código: ${statusCode}`);

            // Reconecta automaticamente, exceto se for logout
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('[Conexão] Reconectando em 3 segundos...');
                setTimeout(() => {
                    startBot();
                }, 3000);
            } else {
                console.error('[Conexão] Deslogado do WhatsApp. Delete a pasta /auth e reinicie para escanear novo QR.');
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
    let body = '';
    let isFromAudio = false;

    // Verifica se é mensagem de áudio
    if (isAudioMessage(msg)) {
        console.log(`[Audio] Recebido áudio de ${jid}, transcrevendo...`);
        await sendTextMessage(jid, '🎤 Transcrevendo seu áudio...');

        const transcription = await processAudioMessage(msg);
        if (transcription) {
            body = transcription;
            isFromAudio = true;
            console.log(`[Audio] Transcrição: "${body}"`);

            // Verifica se a transcrição parece confusa/sem sentido
            if (isTranscriptionUnclear(body)) {
                console.log(`[Audio] Transcrição parece confusa, pedindo clareza`);
                await sendTextMessage(jid, '🔊 Não consegui entender bem o seu áudio. Poderia falar com mais clareza ou enviar uma mensagem de texto?');
                return;
            }
        } else {
            await sendTextMessage(jid, '❌ Não consegui transcrever o áudio. Por favor, envie uma mensagem de texto.');
            return;
        }
    } else {
        // Extrai texto da mensagem
        body = (
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
        ).trim();
    }

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

    // 🛡️ Guardrails - Verifica se a mensagem é válida
    const guardrailResult = await checkMessage(message);
    if (!guardrailResult.allowed) {
        console.log(`[Guardrail] Mensagem bloqueada de ${jid}: "${message.substring(0, 50)}..."`);
        await sendTextMessage(jid, guardrailResult.reason || 'Desculpe, não entendi. Como posso ajudar com produtos da Maza?');
        return;
    }

    // Seleciona agente
    const agent = getAgentByType(session.agentType);
    if (!agent) return;

    console.log(`[Agent] Processando com ${session.agentType}: "${message}"`);

    // Envia mensagem de aguardo
    await sendTextMessage(jid, '🔍 Aguarde, estou procurando o que você pediu...');

    // Executa agente
    const response = await runAgentWithContext(jid, agent, message);

    console.log(`[DEBUG] Resposta do agente: ${response.substring(0, 200)}...`);
    console.log(`[DEBUG] Resposta completa contém __FILE_READY__: ${response.includes('__FILE_READY__')}`);

    // Verifica se tem arquivo para enviar (usa ||| como delimitador para evitar conflito com C: do Windows)
    // Regex mais robusta: captura tudo entre os delimitadores
    const fileMatch = response.match(/__FILE_READY__\|\|\|([^|]+)\|\|\|([^|\n\r]+)/);

    console.log(`[DEBUG] fileMatch encontrado: ${fileMatch ? 'SIM' : 'NÃO'}`);
    if (fileMatch) {
        console.log(`[DEBUG] Match completo: ${fileMatch[0]}`);
        console.log(`[DEBUG] localPath: "${fileMatch[1]}"`);
        console.log(`[DEBUG] fileName: "${fileMatch[2]}"`);
    }

    if (fileMatch) {
        const [, localPath, fileName] = fileMatch;

        // Remove a marcação da resposta
        const textResponse = response.replace(/__FILE_READY__\|\|\|[^|]+\|\|\|[^|\n\r]+/, '').trim();

        // Envia arquivo PRIMEIRO
        console.log(`[DEBUG] Tentando enviar arquivo: ${localPath.trim()}`);
        await sendFile(socket, jid, localPath.trim(), fileName.trim());

        // Depois envia a mensagem de texto
        if (textResponse) {
            await sendTextMessage(jid, textResponse);
        }
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
    if (!sock) {
        console.log('[sendTextMessage] Socket não disponível');
        return;
    }

    try {
        await sock.sendMessage(jid, { text });
    } catch (error: any) {
        console.error(`[sendTextMessage] Erro ao enviar mensagem: ${error.message}`);
        // Não propaga o erro, apenas loga
    }
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
        console.log(`[sendFile] Iniciando envio...`);
        console.log(`[sendFile] localPath: "${localPath}"`);
        console.log(`[sendFile] fileName: "${fileName}"`);

        // Verifica se arquivo existe
        if (!fs.existsSync(localPath)) {
            console.log(`[sendFile] ERRO: Arquivo não existe no caminho!`);
            await sendTextMessage(jid, `❌ Arquivo não encontrado: ${fileName}`);
            return;
        }

        const ext = path.extname(localPath).toLowerCase();
        const stats = fs.statSync(localPath);
        console.log(`[sendFile] Extensão: ${ext}`);
        console.log(`[sendFile] Tamanho: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        const buffer = fs.readFileSync(localPath);
        console.log(`[sendFile] Buffer lido: ${buffer.length} bytes`);

        // Detecta tipo de mídia
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
        } else if (isImage) {
            console.log(`[sendFile] Enviando como imagem...`);
            await socket.sendMessage(jid, {
                image: buffer,
                caption: `🖼️ ${fileName}`,
            });
            console.log(`[sendFile] Imagem enviada com sucesso!`);
        } else if (isAudio) {
            console.log(`[sendFile] Enviando como áudio...`);
            await socket.sendMessage(jid, {
                audio: buffer,
                mimetype: 'audio/mp4',
                ptt: false,
            });
            console.log(`[sendFile] Áudio enviado com sucesso!`);
        } else {
            // Documento genérico (PDF, etc)
            console.log(`[sendFile] Enviando como documento...`);
            await socket.sendMessage(jid, {
                document: buffer,
                mimetype: getMimeType(ext),
                fileName: fileName,
            });
            console.log(`[sendFile] Documento enviado com sucesso!`);
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
