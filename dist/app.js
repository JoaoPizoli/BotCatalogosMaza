"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const whatsapp_1 = require("./services/whatsapp");
const db_1 = require("./database/db");
async function main() {
    try {
        await (0, whatsapp_1.startBot)();
        await (0, db_1.setupDatabase)();
    }
    catch (error) {
        console.log(`Erro ao iniciar o WhatsApp Bot: ${error}`);
    }
}
main();
//# sourceMappingURL=app.js.map