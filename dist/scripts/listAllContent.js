"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const oneDriveIndexer_1 = require("../services/OneDrive/oneDriveIndexer");
const OUTPUT_FILE = node_path_1.default.resolve(process.cwd(), "estrutura_onedrive.txt");
async function listRecursive(rootFolder, subPath = "", depth = 0) {
    const lines = [];
    const indent = "  ".repeat(depth);
    try {
        const contents = await (0, oneDriveIndexer_1.listContents)(rootFolder, subPath || undefined);
        for (const folder of contents.folders) {
            lines.push(`${indent}[PASTA] ${folder}`);
            if (depth < 4) {
                const newPath = subPath ? `${subPath}/${folder}` : folder;
                const subLines = await listRecursive(rootFolder, newPath, depth + 1);
                lines.push(...subLines);
            }
        }
        for (const file of contents.files) {
            lines.push(`${indent}[ARQUIVO] ${file}`);
        }
    }
    catch (err) {
        lines.push(`${indent}[ERRO] ${err.message}`);
    }
    return lines;
}
async function main() {
    const output = [];
    output.push("=".repeat(80));
    output.push("ESTRUTURA COMPLETA DO ONEDRIVE - MAZA");
    output.push("=".repeat(80));
    output.push("");
    await (0, oneDriveIndexer_1.init)();
    const rootFolders = (0, oneDriveIndexer_1.getRootFolderNames)();
    for (const rootFolder of rootFolders) {
        output.push("");
        output.push("=".repeat(60));
        output.push(`PASTA RAIZ: ${rootFolder.toUpperCase()}`);
        output.push("=".repeat(60));
        const lines = await listRecursive(rootFolder);
        output.push(...lines);
    }
    output.push("");
    output.push("=".repeat(80));
    output.push("FIM DA LISTAGEM");
    output.push("=".repeat(80));
    node_fs_1.default.writeFileSync(OUTPUT_FILE, output.join("\n"), "utf-8");
    console.log(`\n✅ Estrutura salva em: ${OUTPUT_FILE}`);
}
main().catch(console.error);
//# sourceMappingURL=listAllContent.js.map