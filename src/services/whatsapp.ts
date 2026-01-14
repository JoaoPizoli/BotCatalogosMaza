import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers }from '@whiskeysockets/baileys';
import P from 'pino';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom'
import { salvarEnquete, buscarEnquete, updateUsuario, getEstadoUsuario} from '@/database/db';
import { menuCompleto } from '@/utils/listTemplates';

let sock: ReturnType<typeof makeWASocket> | undefined;

export async function startBot(){
    console.log("Iniciando bot com nova configuração...")
    const { state , saveCreds } = await useMultiFileAuthState('./auth')
    const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({level: 'info'}),
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    })

    sock = socket

    socket.ev.on('creds.update',saveCreds)

    socket.ev.on('connection.update', async (update)=>{
        const { connection, lastDisconnect, qr } = update

        if(qr){
            const qrTerm = await QRCode.toString(qr, {type: 'terminal', small: true})
            console.clear()
            console.log('Escaneie este QR no WhatsApp > Aparelhos conectados:')
            console.log(qrTerm)
        }

        if(connection === 'close'){
            const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode

            if(statusCode === DisconnectReason.restartRequired){
                console.log('Reconectando...')
                startBot()
            }else{
                console.error('Conexão fechada:', statusCode, lastDisconnect?.error)
            }
        } else if(connection === 'open') {
            console.log('Conectado!')
        }
    })
}

export async function sendMessage(){
    try {
        const socket = sock 
        socket?.ev.on('messages.upsert', async ({ type, messages }) => {
        if (type !== 'notify'){
            return
        }
        for (const msg of messages) {
        const jid = msg.key.remoteJid!
        const body =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''
        if (!body) continue

        console.log('Mensagem de', jid, ':', body)

        if (body) {
            const verificarStatus = await getEstadoUsuario(jid)
            if(verificarStatus === 'INATIVO'){
                await socket.sendMessage(jid, menuCompleto)
                await updateUsuario(jid, verificarStatus)
            }
            else if(verificarStatus === 'AGUARDANDO_PRIMEIRO_VOTO'){
                await salvarEnquete(jid,body)
                await updateUsuario(jid,verificarStatus)
            }
            else if(verificarStatus === 'EM_ATENDIMENTO'){

            }
        }
    }
    })
    } catch (error) {
        console.error("Erro ao enviar Msg!")
    }
}
