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
const listTemplates_1 = require("../utils/listTemplates");
async function startBot() {
    console.log("Iniciando bot com nova configuração...");
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)('./auth');
    const sock = (0, baileys_1.default)({
        auth: state,
        printQRInTerminal: false,
        logger: (0, pino_1.default)({ level: 'info' }),
        browser: baileys_1.Browsers.macOS('Desktop'),
        syncFullHistory: false
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
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
            console.log('Conectado!');
        }
    });
    sock.ev.on('messages.upsert', async ({ type, messages }) => {
        if (type !== 'notify') {
            return;
        }
        for (const msg of messages) {
            const jid = msg.key.remoteJid;
            const body = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                '';
            if (!body)
                continue;
            console.log('Mensagem de', jid, ':', body);
            console.log('Body length:', body.length);
            console.log('Body charCodes:', body.split('').map(c => c.charCodeAt(0)));
            const bodyTrimmed = body.trim().toLowerCase();
            if (bodyTrimmed === '!botoes1') {
                console.log('Teste 1: Native Flow direto...');
                const msg = (0, baileys_1.generateWAMessageFromContent)(jid, {
                    interactiveMessage: baileys_1.proto.Message.InteractiveMessage.create({
                        body: baileys_1.proto.Message.InteractiveMessage.Body.create({
                            text: "Teste 1: Native Flow direto (sem viewOnce)"
                        }),
                        footer: baileys_1.proto.Message.InteractiveMessage.Footer.create({
                            text: "Rodapé"
                        }),
                        header: baileys_1.proto.Message.InteractiveMessage.Header.create({
                            title: "TESTE 1",
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: baileys_1.proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    "name": "quick_reply",
                                    "buttonParamsJson": JSON.stringify({
                                        display_text: "Clique Aqui",
                                        id: "btn_1"
                                    })
                                }
                            ]
                        })
                    })
                }, { userJid: (0, baileys_1.jidNormalizedUser)(sock.user?.id) });
                try {
                    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
                    console.log('Teste 1 enviado!');
                }
                catch (err) {
                    console.error('Erro teste 1:', err);
                }
            }
            else if (bodyTrimmed === '!botoes2') {
                console.log('Teste 2: buttonsMessage antigo...');
                try {
                    await sock.sendMessage(jid, {
                        text: "Teste 2: Botões antigos",
                        footer: "Escolha uma opção",
                        buttons: [
                            { buttonId: 'id1', buttonText: { displayText: 'Opção 1' }, type: 1 },
                            { buttonId: 'id2', buttonText: { displayText: 'Opção 2' }, type: 1 },
                            { buttonId: 'id3', buttonText: { displayText: 'Opção 3' }, type: 1 }
                        ],
                        headerType: 1
                    });
                    console.log('Teste 2 enviado!');
                }
                catch (err) {
                    console.error('Erro teste 2:', err);
                }
            }
            else if (bodyTrimmed === '!botoes3') {
                console.log('Teste 3: listMessage...');
                try {
                    await sock.sendMessage(jid, {
                        text: "Teste 3: Lista de opções",
                        footer: "Selecione abaixo",
                        title: "MENU",
                        buttonText: "Ver Opções",
                        sections: [
                            {
                                title: "Seção 1",
                                rows: [
                                    { title: "Item 1", rowId: "item1", description: "Descrição 1" },
                                    { title: "Item 2", rowId: "item2", description: "Descrição 2" },
                                    { title: "Item 3", rowId: "item3", description: "Descrição 3" }
                                ]
                            }
                        ]
                    });
                    console.log('Teste 3 enviado!');
                }
                catch (err) {
                    console.error('Erro teste 3:', err);
                }
            }
            else if (bodyTrimmed === '!botoes4') {
                console.log('Teste 4: templateMessage...');
                try {
                    await sock.sendMessage(jid, {
                        templateButtons: [
                            { index: 1, urlButton: { displayText: 'Abrir Site', url: 'https://google.com' } },
                            { index: 2, callButton: { displayText: 'Ligar', phoneNumber: '+5511999999999' } },
                            { index: 3, quickReplyButton: { displayText: 'Resposta Rápida', id: 'id-quick' } }
                        ],
                        text: "Teste 4: Template Buttons",
                        footer: "Rodapé template"
                    });
                    console.log('Teste 4 enviado!');
                }
                catch (err) {
                    console.error('Erro teste 4:', err);
                }
            }
            else if (bodyTrimmed === '!poll') {
                console.log('Enviando enquete (funciona sempre)...');
                try {
                    await sock.sendMessage(jid, {
                        poll: {
                            name: "🎯 Escolha uma opção:",
                            values: ["📊 Relatórios", "📈 Dashboard", "⚙️ Configurações", "❓ Ajuda"],
                            selectableCount: 1
                        }
                    });
                    console.log('Enquete enviada!');
                }
                catch (err) {
                    console.error('Erro enquete:', err);
                }
            }
            else if (bodyTrimmed.includes('!botoes')) {
                console.log('Comando !botoes recebido, gerando mensagem...');
                const msg = (0, baileys_1.generateWAMessageFromContent)(jid, {
                    viewOnceMessage: {
                        message: {
                            interactiveMessage: baileys_1.proto.Message.InteractiveMessage.create({
                                body: baileys_1.proto.Message.InteractiveMessage.Body.create({
                                    text: "👋 Olá! Este é um exemplo de botões *Native Flow*."
                                }),
                                footer: baileys_1.proto.Message.InteractiveMessage.Footer.create({
                                    text: "Funciona melhor em Android/iOS"
                                }),
                                header: baileys_1.proto.Message.InteractiveMessage.Header.create({
                                    title: "MENU INTERATIVO",
                                    subtitle: "Exemplo",
                                    hasMediaAttachment: false
                                }),
                                nativeFlowMessage: baileys_1.proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                    buttons: [
                                        {
                                            "name": "quick_reply",
                                            "buttonParamsJson": JSON.stringify({
                                                display_text: "🔹 Opção 1",
                                                id: "id_botao_1"
                                            })
                                        },
                                        {
                                            "name": "cta_url",
                                            "buttonParamsJson": JSON.stringify({
                                                display_text: "🌐 Abrir Google",
                                                url: "https://www.google.com",
                                                merchant_url: "https://www.google.com"
                                            })
                                        },
                                        {
                                            "name": "cta_copy",
                                            "buttonParamsJson": JSON.stringify({
                                                display_text: "📋 Copiar Chave",
                                                copy_code: "CHAVE-PIX-1234"
                                            })
                                        }
                                    ],
                                })
                            })
                        }
                    }
                }, { userJid: (0, baileys_1.jidNormalizedUser)(sock.user?.id) });
                try {
                    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
                    console.log('Mensagem de botões enviada com sucesso!');
                }
                catch (err) {
                    console.error('Erro ao enviar botões:', err);
                }
            }
            else if (body) {
                const msg = (0, baileys_1.generateWAMessageFromContent)(jid, {
                    viewOnceMessage: {
                        message: {
                            interactiveMessage: baileys_1.proto.Message.InteractiveMessage.create({
                                body: baileys_1.proto.Message.InteractiveMessage.Body.create({
                                    text: "Selecione uma opção no menu abaixo:"
                                }),
                                footer: baileys_1.proto.Message.InteractiveMessage.Footer.create({
                                    text: "Bot WhatsApp"
                                }),
                                header: baileys_1.proto.Message.InteractiveMessage.Header.create({
                                    title: "MENU PRINCIPAL",
                                    subtitle: "Bem-vindo",
                                    hasMediaAttachment: false
                                }),
                                nativeFlowMessage: baileys_1.proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                    buttons: [
                                        {
                                            "name": "single_select",
                                            "buttonParamsJson": JSON.stringify({
                                                title: "VER OPÇÕES",
                                                sections: [
                                                    {
                                                        title: "Menu",
                                                        rows: listTemplates_1.menuCompleto.poll.values.map((item, id) => ({
                                                            header: "",
                                                            title: item,
                                                            description: "",
                                                            id: `menu_id_${id}`
                                                        }))
                                                    }
                                                ]
                                            })
                                        }
                                    ]
                                })
                            })
                        }
                    }
                }, { userJid: sock.user?.id || '' });
                await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
            }
        }
    });
}
//# sourceMappingURL=whatsapp.js.map