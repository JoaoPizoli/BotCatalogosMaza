/**
 * Script para listar toda a estrutura de pastas e arquivos do OneDrive
 * Salva em arquivo para análise
 */

import fs from "node:fs";
import path from "node:path";
import { init, getRootFolderNames, listContents } from "../services/OneDrive/oneDriveIndexer";

const OUTPUT_FILE = path.resolve(process.cwd(), "estrutura_onedrive.txt");

async function listRecursive(rootFolder: string, subPath: string = "", depth: number = 0): Promise<string[]> {
    const lines: string[] = [];
    const indent = "  ".repeat(depth);

    try {
        const contents = await listContents(rootFolder, subPath || undefined);

        // Lista pastas
        for (const folder of contents.folders) {
            lines.push(`${indent}[PASTA] ${folder}`);

            // Recursão para subpastas (máximo 4 níveis)
            if (depth < 4) {
                const newPath = subPath ? `${subPath}/${folder}` : folder;
                const subLines = await listRecursive(rootFolder, newPath, depth + 1);
                lines.push(...subLines);
            }
        }

        // Lista arquivos
        for (const file of contents.files) {
            lines.push(`${indent}[ARQUIVO] ${file}`);
        }
    } catch (err: any) {
        lines.push(`${indent}[ERRO] ${err.message}`);
    }

    return lines;
}

async function main() {
    const output: string[] = [];

    output.push("=".repeat(80));
    output.push("ESTRUTURA COMPLETA DO ONEDRIVE - MAZA");
    output.push("=".repeat(80));
    output.push("");

    await init();

    const rootFolders = getRootFolderNames();

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

    // Salva no arquivo
    fs.writeFileSync(OUTPUT_FILE, output.join("\n"), "utf-8");
    console.log(`\n✅ Estrutura salva em: ${OUTPUT_FILE}`);
}

main().catch(console.error);
