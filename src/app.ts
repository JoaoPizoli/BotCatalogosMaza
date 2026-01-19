import { startBot } from "./services/whatsapp";
import { setupDatabase } from "./database/db";
import { initStructureCache } from "./cache/structureCache";

// Tratamento global de erros não capturados
process.on('uncaughtException', (error) => {
    console.error('[ERRO] Exceção não capturada:', error.message);
    // Não encerra o processo, apenas loga
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERRO] Promise rejeitada não tratada:', reason);
    // Não encerra o processo, apenas loga
});

async function main() {
    try {
        console.log('[App] Iniciando...');

        await setupDatabase();

        // Carrega estrutura do OneDrive em cache (para contexto dos agentes)
        await initStructureCache();

        await startBot();

        console.log('[App] Bot iniciado com sucesso!');

    } catch (error) {
        console.error(`[App] Erro ao iniciar: ${error}`);

        // Tenta reiniciar após 5 segundos
        console.log('[App] Tentando reiniciar em 5 segundos...');
        setTimeout(() => {
            main();
        }, 5000);
    }
}

main();
