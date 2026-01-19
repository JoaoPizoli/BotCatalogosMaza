import { init, getRootFolderNames, listContents } from "../services/OneDrive/oneDriveIndexer";

const structureCache: Map<string, string> = new Map();
let initialized = false;

/**
 * Carrega recursivamente a estrutura de uma pasta
 */
async function loadStructureRecursive(
    rootFolder: string,
    subPath: string = "",
    depth: number = 0,
    maxDepth: number = 3
): Promise<string[]> {
    const lines: string[] = [];
    const indent = "  ".repeat(depth);

    try {
        const contents = await listContents(rootFolder, subPath || undefined);

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
    } catch (err: any) {
        lines.push(`${indent}❌ Erro: ${err.message}`);
    }

    return lines;
}

/**
 * Inicializa o cache de estrutura.
 * Deve ser chamado uma vez na inicialização do app.
 */
export async function initStructureCache(): Promise<void> {
    if (initialized) return;

    console.log("[StructureCache] Carregando estrutura do OneDrive...");

    await init();

    const rootFolders = getRootFolderNames();

    for (const rootFolder of rootFolders) {
        console.log(`[StructureCache] Carregando: ${rootFolder}...`);

        const lines = await loadStructureRecursive(rootFolder, "", 0, 2);
        const structure = lines.join("\n");

        structureCache.set(rootFolder.toLowerCase(), structure);
    }

    initialized = true;
    console.log("[StructureCache] ✅ Estrutura carregada em memória!");
}

/**
 * Obtém a estrutura de uma pasta raiz (do cache)
 */
export function getStructure(rootFolder: string): string {
    const key = rootFolder.toLowerCase();

    // Busca parcial
    for (const [k, v] of structureCache.entries()) {
        if (k.includes(key) || key.includes(k)) {
            return v;
        }
    }

    return "Estrutura não encontrada no cache.";
}

/**
 * Obtém a estrutura para um tipo de agente
 */
export function getStructureForAgent(agentType: 'catalogo' | 'embalagem' | 'videos'): string {
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

/**
 * Verifica se o cache está inicializado
 */
export function isStructureCacheReady(): boolean {
    return initialized;
}
