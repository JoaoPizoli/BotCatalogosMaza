"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const whatsapp_1 = require("./services/whatsapp");
const db_1 = require("./database/db");
const structureCache_1 = require("./cache/structureCache");
process.on('uncaughtException', (error) => {
    console.error('[ERRO] Exceção não capturada:', error.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERRO] Promise rejeitada não tratada:', reason);
});
async function main() {
    try {
        console.log('[App] Iniciando...');
        await (0, db_1.setupDatabase)();
        await (0, structureCache_1.initStructureCache)();
        await (0, whatsapp_1.startBot)();
        console.log('[App] Bot iniciado com sucesso!');
    }
    catch (error) {
        console.error(`[App] Erro ao iniciar: ${error}`);
        console.log('[App] Tentando reiniciar em 5 segundos...');
        setTimeout(() => {
            main();
        }, 5000);
    }
}
main();
//# sourceMappingURL=app.js.map