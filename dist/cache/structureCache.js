"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStructureCache = initStructureCache;
exports.getStructure = getStructure;
exports.getStructureForAgent = getStructureForAgent;
exports.isStructureCacheReady = isStructureCacheReady;
const oneDriveIndexer_1 = require("../services/OneDrive/oneDriveIndexer");
const structureCache = new Map();
let initialized = false;
async function loadStructureRecursive(rootFolder, subPath = "", depth = 0, maxDepth = 3) {
    const lines = [];
    const indent = "  ".repeat(depth);
    try {
        const contents = await (0, oneDriveIndexer_1.listContents)(rootFolder, subPath || undefined);
        for (const folder of contents.folders) {
            lines.push(`${indent}📂 ${folder}`);
            if (depth < maxDepth) {
                const newPath = subPath ? `${subPath}/${folder}` : folder;
                const subLines = await loadStructureRecursive(rootFolder, newPath, depth + 1, maxDepth);
                lines.push(...subLines);
            }
        }
        const filesToShow = contents.files.slice(0, 20);
        for (const file of filesToShow) {
            lines.push(`${indent}📄 ${file}`);
        }
        if (contents.files.length > 20) {
            lines.push(`${indent}   ... e mais ${contents.files.length - 20} arquivos`);
        }
    }
    catch (err) {
        lines.push(`${indent}❌ Erro: ${err.message}`);
    }
    return lines;
}
async function initStructureCache() {
    if (initialized)
        return;
    console.log("[StructureCache] Carregando estrutura do OneDrive...");
    await (0, oneDriveIndexer_1.init)();
    const rootFolders = (0, oneDriveIndexer_1.getRootFolderNames)();
    for (const rootFolder of rootFolders) {
        console.log(`[StructureCache] Carregando: ${rootFolder}...`);
        const lines = await loadStructureRecursive(rootFolder, "", 0, 2);
        const structure = lines.join("\n");
        structureCache.set(rootFolder.toLowerCase(), structure);
    }
    initialized = true;
    console.log("[StructureCache] ✅ Estrutura carregada em memória!");
}
function getStructure(rootFolder) {
    const key = rootFolder.toLowerCase();
    for (const [k, v] of structureCache.entries()) {
        if (k.includes(key) || key.includes(k)) {
            return v;
        }
    }
    return "Estrutura não encontrada no cache.";
}
function getStructureForAgent(agentType) {
    switch (agentType) {
        case 'catalogo':
            return getStructure('catálogo');
        case 'embalagem':
            return getStructure('embalagens');
        case 'videos':
            const treinamento = getStructure('treinamento');
            const produtos = getStructure('produtos');
            return `=== TREINAMENTO SISTEMAS ===\n${treinamento}\n\n=== PRODUTOS (vídeos de aplicação) ===\n${produtos}`;
        default:
            return "";
    }
}
function isStructureCacheReady() {
    return initialized;
}
//# sourceMappingURL=structureCache.js.map