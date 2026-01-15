import { startBot } from "./services/whatsapp";
import { setupDatabase } from "./database/db";

async function main() {
    try {
        await startBot();

        await setupDatabase();


    } catch (error) {
        console.log(`Erro ao iniciar o WhatsApp Bot: ${error}`)
    }
}

main();