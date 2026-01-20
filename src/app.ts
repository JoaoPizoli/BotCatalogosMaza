import { startBot } from "./services/telegram";
import { setupDatabase } from "./database/db";
import { initStructureCache } from "./cache/structureCache";
import { cleanupOldFiles } from "./cache/fileCache";

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

        // Agenda limpeza de arquivos antigos a cada 1 hora
        setInterval(async () => {
            try {
                await cleanupOldFiles(24); // Remove arquivos > 24h
            } catch (err) {
                console.error('[App] Erro na limpeza de cache:', err);
            }
        }, 60 * 60 * 1000); // 1 hora

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
