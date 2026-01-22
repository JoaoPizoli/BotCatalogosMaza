import { Bot, InlineKeyboard, Context, InputFile } from 'grammy';
import path from 'node:path';
import fs from 'node:fs';

// Agentes
import { agenteCatalogo } from '../agents/agenteCatalogo';
import { agenteEmbalagens } from '../agents/agenteEmbalagem';
import { agenteVideos } from '../agents/agenteVideos';
import { setCurrentSession, getAndClearDownloadedFile } from '../agents/tools/oneDriveTools';
import { getFileId, saveFileId } from './telegramFileCache';
import { videoQueue } from './videoQueue';

// Session Manager
import {
    getOrCreateSession,
    getSession,
    setAgentType,
    runAgentWithContext,
    clearSession,
    refreshTimeout,
    setOnSessionExpired,
    checkRateLimit,
    AgentType,
} from './sessionManager';

// Templates
import { mensagemBoasVindas, menuPrincipal } from '../utils/listTemplates';

// Guardrails
import { checkMessage } from '../agents/guardrails';

// Audio Transcription
import { processAudioMessage } from './audioTranscription';

// Bot instance
let bot: Bot | null = null;

// Mensagens de boas-vindas por agente
const WELCOME_MESSAGES: Record<AgentType, string> = {
    embalagem: '📦 *Assistente de Embalagens*\n\nO que você procura? Pode me dizer o nome do produto ou tipo de embalagem.',
    catalogo: '📑 *Assistente de Catálogos Digitais*\n\nQual catálogo você precisa? Me diga o tipo de produto.',
    videos: '🎬 *Assistente de Vídeos de Treinamento e Produtos*\n\nO que você busca? Posso ajudar com treinamentos ou **vídeos de aplicação de produtos**. Me diga o que precisa!',
};

// Menu principal com botões inline
function getMenuKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
        .text('📦 Embalagens', 'agent_embalagem').row()
        .text('📑 Catálogos Digitais', 'agent_catalogo').row()
        .text('🎬 Vídeos de Treinamento/Produtos', 'agent_videos');
}

/**
 * Inicia o bot Telegram
 */
export async function startBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN não encontrado no .env');
    }

    bot = new Bot(token);

    // Configura callback de sessão expirada
    setOnSessionExpired(async (chatId: string) => {
        await sendTextMessage(chatId, '⏱️ Sessão encerrada por inatividade. Use /menu para recomeçar.');
    });

    // Comando /start
    bot.command('start', async (ctx) => {
        const chatId = ctx.chat.id.toString();
        clearSession(chatId);

        await ctx.reply(mensagemBoasVindas, { parse_mode: 'Markdown' });
        await ctx.reply(menuPrincipal, {
            parse_mode: 'Markdown',
            reply_markup: getMenuKeyboard(),
        });

        console.log(`[Bot] /start de ${chatId}`);
    });

    // Comando /menu
    bot.command('menu', async (ctx) => {
        const chatId = ctx.chat.id.toString();
        clearSession(chatId);

        await ctx.reply(menuPrincipal, {
            parse_mode: 'Markdown',
            reply_markup: getMenuKeyboard(),
        });

        console.log(`[Bot] /menu de ${chatId}`);
    });

    // Callback dos botões de agente
    bot.callbackQuery('agent_embalagem', async (ctx) => {
        await selectAgent(ctx, 'embalagem');
    });

    bot.callbackQuery('agent_catalogo', async (ctx) => {
        await selectAgent(ctx, 'catalogo');
    });

    bot.callbackQuery('agent_videos', async (ctx) => {
        await selectAgent(ctx, 'videos');
    });

    // Mensagens de texto
    bot.on('message:text', async (ctx) => {
        await handleTextMessage(ctx);
    });

    // Mensagens de áudio/voz
    bot.on('message:voice', async (ctx) => {
        await handleAudioMessage(ctx);
    });

    bot.on('message:audio', async (ctx) => {
        await handleAudioMessage(ctx);
    });

    // Tratador de erros
    bot.catch((err) => {
        console.error('[Bot] Erro:', err.message);
    });

    // Inicia o bot
    console.log('[Bot] Iniciando bot Telegram...');
    bot.start();
    console.log('✅ Bot Telegram iniciado!');
}

/**
 * Seleciona agente para a sessão
 */
async function selectAgent(ctx: Context, agentType: AgentType) {
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    await ctx.answerCallbackQuery();

    getOrCreateSession(chatId);
    setAgentType(chatId, agentType);
    refreshTimeout(chatId);

    const welcomeMessage = WELCOME_MESSAGES[agentType];
    await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });

    console.log(`[Agente] ${chatId} -> ${agentType}`);
}

/**
 * Processa mensagem de texto
 */
async function handleTextMessage(ctx: Context) {
    const chatId = ctx.chat?.id.toString();
    const text = ctx.message?.text?.trim();

    if (!chatId || !text) return;

    console.log(`[Mensagem] ${chatId}: ${text}`);

    // Verifica se é uma sessão nova (primeiro contato)
    const isNewSession = !getSession(chatId);
    const session = getOrCreateSession(chatId);
    refreshTimeout(chatId);

    // Rate limiting (20 msgs/minuto)
    const rateCheck = checkRateLimit(chatId);
    if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Você está enviando mensagens muito rápido. Aguarde ${rateCheck.remainingSeconds} segundos.`);
        return;
    }

    // Se não tem agente definido, envia boas-vindas + menu
    if (!session.agentType) {
        // Se é primeira mensagem, envia boas-vindas
        if (isNewSession) {
            await ctx.reply(mensagemBoasVindas, { parse_mode: 'Markdown' });
        }
        await ctx.reply(menuPrincipal, {
            parse_mode: 'Markdown',
            reply_markup: getMenuKeyboard(),
        });
        return;
    }

    // Tem agente ativo, processa com ele
    await processWithAgent(ctx, chatId, text);
}

/**
 * Processa mensagem de áudio
 */
async function handleAudioMessage(ctx: Context) {
    const chatId = ctx.chat?.id.toString();
    if (!chatId || !bot) return;

    const session = getOrCreateSession(chatId);
    refreshTimeout(chatId);

    // Rate limiting (20 msgs/minuto)
    const rateCheck = checkRateLimit(chatId);
    if (!rateCheck.allowed) {
        await ctx.reply(`⏳ Você está enviando mensagens muito rápido. Aguarde ${rateCheck.remainingSeconds} segundos.`);
        return;
    }

    if (!session.agentType) {
        await ctx.reply('Por favor, escolha uma opção no menu primeiro:', {
            reply_markup: getMenuKeyboard(),
        });
        return;
    }

    console.log(`[Audio] Recebido áudio de ${chatId}, transcrevendo...`);
    await ctx.reply('🎤 Transcrevendo seu áudio...');

    const fileId = ctx.message?.voice?.file_id || ctx.message?.audio?.file_id;
    if (!fileId) {
        await ctx.reply('❌ Não consegui processar o áudio.');
        return;
    }

    const transcription = await processAudioMessage(bot, fileId);
    if (!transcription) {
        await ctx.reply('❌ Não consegui transcrever o áudio. Por favor, envie uma mensagem de texto.');
        return;
    }

    console.log(`[Audio] Transcrição: "${transcription}"`);

    // Verifica se a transcrição parece confusa
    if (isTranscriptionUnclear(transcription)) {
        await ctx.reply('🔊 Não consegui entender bem o seu áudio. Poderia falar com mais clareza ou enviar uma mensagem de texto?');
        return;
    }

    await processWithAgent(ctx, chatId, transcription);
}

/**
 * Verifica se a transcrição parece confusa
 */
function isTranscriptionUnclear(text: string): boolean {
    const trimmed = text.trim();

    if (trimmed.length < 3) return true;

    const nonsensePatterns = [
        /^[aeiouáéíóúãõ\s]+$/i,
        /^(hm+|ah+|eh+|uh+|oh+|ih+)+$/i,
        /^\.+$/,
        /^\?+$/,
        /^!+$/,
        /^(blá|bla|lalala|tá|né|então|tipo|assim)+$/i,
    ];

    for (const pattern of nonsensePatterns) {
        if (pattern.test(trimmed)) return true;
    }

    if (/(.)\\1{4,}/.test(trimmed)) return true;

    const words = trimmed.split(/\s+/).filter(w => w.length > 2);
    if (words.length === 0 && trimmed.length < 10) return true;

    return false;
}

/**
 * Processa mensagem com o agente ativo
 */
async function processWithAgent(ctx: Context, chatId: string, message: string) {
    const session = getSession(chatId);
    if (!session?.agentType) return;

    // 🛡️ Guardrails
    const guardrailResult = await checkMessage(message);
    if (!guardrailResult.allowed) {
        console.log(`[Guardrail] Mensagem bloqueada de ${chatId}: "${message.substring(0, 50)}..."`);
        await ctx.reply(guardrailResult.reason || 'Desculpe, não entendi. Como posso ajudar com produtos da Maza?');
        return;
    }

    // Seleciona agente
    const agent = getAgentByType(session.agentType);
    if (!agent) return;

    console.log(`[Agent] Processando com ${session.agentType}: "${message}"`);

    await ctx.reply('🔍 Aguarde, estou procurando o que você pediu...');

    // Define sessão atual para tracking de downloads
    setCurrentSession(chatId);

    // Executa agente
    const response = await runAgentWithContext(chatId, agent, message);

    console.log(`[DEBUG] Resposta do agente: ${response.substring(0, 200)}...`);

    // Verifica se tem arquivo baixado na sessão (método robusto)
    const downloadedFile = getAndClearDownloadedFile(chatId);

    if (downloadedFile) {
        // Envia arquivo que foi realmente baixado pela tool
        await sendFile(ctx, downloadedFile.path, downloadedFile.name);

        // Mensagem padrão pós-envio
        const typeNames: Record<string, string> = {
            'catalogo': 'catálogo',
            'embalagem': 'arquivo de embalagem',
            'videos': 'vídeo'
        };
        const typeName = typeNames[session.agentType] || 'arquivo';

        const followUpMessage =
            `✅ Aqui está o arquivo solicitado.\n\n` +
            `Precisa de mais algum ${typeName}? É só pedir!\n\n` +
            `🔄 Para trocar de assistente, digite /menu`;

        await ctx.reply(followUpMessage);
    } else {
        // Fallback: verifica marcador na resposta (caso antigo)
        const fileMatch = response.match(/__FILE_READY__\|\|\|([^|]+)\|\|\|([^|\n\r]+)/);

        if (fileMatch) {
            const [, localPath, fileName] = fileMatch;
            // Valida se o caminho parece real
            if (localPath.includes('BotCatalogosMaza') || fs.existsSync(localPath.trim())) {
                await sendFile(ctx, localPath.trim(), fileName.trim());
                // Mensagem padrão pós-envio
                const typeNames: Record<string, string> = {
                    'catalogo': 'catálogo',
                    'embalagem': 'arquivo de embalagem',
                    'videos': 'vídeo'
                };
                const typeName = typeNames[session.agentType] || 'arquivo';

                const followUpMessage =
                    `✅ Aqui está o arquivo solicitado.\n\n` +
                    `Precisa de mais algum ${typeName}? É só pedir!\n\n` +
                    `🔄 Para trocar de assistente, digite /menu`;

                await ctx.reply(followUpMessage);
            } else {
                console.log(`[WARN] Caminho inventado pelo LLM: ${localPath}`);
                await ctx.reply(response.replace(/__FILE_READY__\|\|\|[^|]+\|\|\|[^|\n\r]+/, '').trim() || 'Desculpe, houve um erro ao enviar o arquivo. Tente novamente.');
            }
        } else {
            await ctx.reply(response);
        }
    }
}

/**
 * Retorna agente pelo tipo
 */
function getAgentByType(type: AgentType) {
    switch (type) {
        case 'catalogo': return agenteCatalogo;
        case 'embalagem': return agenteEmbalagens;
        case 'videos': return agenteVideos;
        default: return null;
    }
}

/**
 * Envia mensagem de texto
 */
async function sendTextMessage(chatId: string, text: string) {
    if (!bot) {
        console.log('[sendTextMessage] Bot não disponível');
        return;
    }

    try {
        await bot.api.sendMessage(chatId, text);
    } catch (error: any) {
        console.error(`[sendTextMessage] Erro: ${error.message}`);
    }
}

/**
 * Envia arquivo
 */
async function sendFile(ctx: Context, localPath: string, fileName: string) {
    try {
        console.log(`[sendFile] Preparando envio: ${fileName}`);

        if (!fs.existsSync(localPath)) {
            console.log(`[sendFile] Arquivo não existe: ${localPath}`);
            await ctx.reply(`❌ Arquivo não encontrado: ${fileName}`);
            return;
        }

        // Tenta pegar do cache (envio instantâneo)
        const cachedFileId = await getFileId(fileName);
        if (cachedFileId) {
            console.log(`[sendFile] Usando FileID do cache (envio instantâneo)`);
            const ext = path.extname(localPath).toLowerCase();
            const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);
            const isAudio = ['.mp3', '.ogg', '.m4a', '.wav'].includes(ext);

            if (isVideo) await ctx.replyWithVideo(cachedFileId, { caption: `🎬 ${fileName}` });
            else if (isAudio) await ctx.replyWithAudio(cachedFileId, { caption: `🎵 ${fileName}` });
            else await ctx.replyWithDocument(cachedFileId, { caption: `📄 ${fileName}` });

            console.log(`[sendFile] Enviado via Cache ID com sucesso!`);
            return;
        }

        // Se não tem cache, faz upload normal
        let ext = path.extname(localPath).toLowerCase();
        let stats = fs.statSync(localPath);
        let sizeMB = stats.size / (1024 * 1024);
        let finalPath = localPath;
        let finalFileName = fileName;

        const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext);

        // Compressão de vídeo se > 49 MB
        if (isVideo && sizeMB > 49) {
            console.log(`[sendFile] Vídeo grande (${sizeMB.toFixed(2)} MB). Comprimindo...`);
            await ctx.reply('⏳ O vídeo é grande e será enviado com qualidade reduzida para caber no Telegram. Isso pode levar alguns minutos...');

            try {
                finalPath = await videoQueue.add(localPath);

                // Recalcula stats após compressão
                const newExt = path.extname(finalPath).toLowerCase();
                const newStats = fs.statSync(finalPath);
                sizeMB = newStats.size / (1024 * 1024);

                // Atualiza variáveis se houve mudança
                if (finalPath !== localPath) {
                    finalFileName = fileName.replace(path.extname(fileName), `_mobile${newExt}`);
                    ext = newExt;
                }

                console.log(`[sendFile] Pós-compressão: ${sizeMB.toFixed(2)} MB`);

                if (sizeMB > 50) {
                    await ctx.reply('⚠️ Mesmo após compressão, o vídeo ainda é muito grande para o Telegram (>50MB). Tente baixar pelo OneDrive diretamente.');
                    return;
                }
            } catch (err) {
                console.error('[sendFile] Erro na compressão:', err);
                await ctx.reply('⚠️ Falha ao comprimir vídeo. Tentando enviar original...');
            }
        }

        console.log(`[sendFile] Uploading: ${ext}, Tamanho: ${sizeMB.toFixed(2)} MB`);

        const isAudio = ['.mp3', '.ogg', '.m4a', '.wav'].includes(ext);

        // Stream para envio
        const file = new InputFile(fs.createReadStream(finalPath), finalFileName);
        let sentMessage;

        if (isVideo) {
            sentMessage = await ctx.replyWithVideo(file, { caption: `🎬 ${fileName}` });
            // Salva file_id do vídeo (pega o último/maior quality)
            const fileId = sentMessage.video?.file_id;
            if (fileId) await saveFileId(fileName, fileId, 'video');
        } else if (isAudio) {
            sentMessage = await ctx.replyWithAudio(file, { caption: `🎵 ${fileName}` });
            const fileId = sentMessage.audio?.file_id; // replyWithAudio retorna audio, não voice
            if (fileId) await saveFileId(fileName, fileId, 'audio');
        } else {
            sentMessage = await ctx.replyWithDocument(file, { caption: `📄 ${fileName}` });
            const fileId = sentMessage.document?.file_id;
            if (fileId) await saveFileId(fileName, fileId, 'document');
        }

        console.log(`[sendFile] Enviado e cacheado com sucesso: ${fileName}`);
    } catch (error: any) {
        console.error('[sendFile] Erro detalhado:', error);
        console.error('[sendFile] Mensagem:', error.message);
        if (error.description) {
            console.error('[sendFile] Descrição Telegram:', error.description);
        }
        await ctx.reply(`❌ Erro ao enviar arquivo: ${fileName}`);
    }
}

