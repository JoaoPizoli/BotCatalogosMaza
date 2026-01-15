"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupDatabase = setupDatabase;
exports.salvarEnquete = salvarEnquete;
exports.buscarEnquete = buscarEnquete;
exports.criarUsuario = criarUsuario;
exports.getEstadoUsuario = getEstadoUsuario;
exports.updateUsuario = updateUsuario;
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
let db;
async function setupDatabase() {
    db = await (0, sqlite_1.open)({
        filename: ':memory:',
        driver: sqlite3_1.default.Database
    });
    await db.exec(`
            CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            message_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE usuarios (
                telefone TEXT PRIMARY KEY,
                status TEXT DEFAULT 'INATIVO',
                openai_thread_id TEXT
            );
        `);
    console.log("Banco iniciado!");
}
async function salvarEnquete(msgId, messageJson) {
    if (!db)
        return;
    const jsonString = JSON.stringify(messageJson);
    await db.run('INSERT INTO polls (id, message_json) VALUES (?,?)', msgId, jsonString);
}
async function buscarEnquete(msgId) {
    if (!db)
        return null;
    const result = await db.get('SELECT message_json FROM polls WHERE id = ?', msgId);
    if (result) {
        return JSON.parse(result.message_json);
    }
    return null;
}
async function criarUsuario(jsId) {
    if (!db)
        return null;
    const result = await db.run('INSERT INTO usuarios (telefone) VALUES (?)', jsId);
    if (!result) {
        return console.error('Erro ao criar Usuario Temporário!');
    }
}
async function getEstadoUsuario(jsId) {
    if (!db)
        return null;
    const result = await db.get('SELECT status FROM usuarios WHERE telefone = ?', jsId);
    if (result) {
        return JSON.parse(result.status);
    }
}
async function updateUsuario(jsId, estado) {
    if (!db)
        return null;
    if (estado === 'INATIVO') {
        const result = await db.run('UPDATE usuarios SET status = "AGUARDANDO_PRIMEIRO_VOTO" WHERE telefone = ?', jsId);
        if (result) {
            return console.log(result);
        }
    }
    else if (estado === 'AGUARDANDO_PRIMEIRO_VOTO') {
        const result = await db.run('UPDATE usuarios SET status = "AGUARDANDO_SEGUNDO_VOTO" WHERE telefone = ?', jsId);
        if (result) {
            console.log(result);
        }
    }
    else if (estado === 'AGUARDANDO_SEGUNDO_VOTO') {
        const result = await db.run('UPDATE usuarios SET status = "EM_ATENDIMENTO" WHERE telefone = ?', jsId);
        if (result) {
            console.log(result);
        }
    }
    else if (estado === 'EM_ATENDIMENTO') {
        const result = await db.run('UPDATE usuarios SET status = "INATIVO" WHERE telefone = ?', jsId);
        if (result) {
            console.log(result);
        }
    }
}
//# sourceMappingURL=db.js.map