"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupDatabase = setupDatabase;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
let db;
async function setupDatabase() {
    db = await (0, sqlite_1.open)({
        filename: ':memory:',
        driver: sqlite3_1.default.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            jid TEXT PRIMARY KEY,
            data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log("[DB] Banco iniciado!");
}
//# sourceMappingURL=db.js.map