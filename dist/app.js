"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const whatsapp_1 = require("./services/whatsapp");
async function main() {
    try {
        (0, whatsapp_1.startBot)();
    }
    catch (error) {
        console.log(`Erro ao iniciar o WhatsApp Bot: ${error}`);
    }
}
main();
//# sourceMappingURL=app.js.map