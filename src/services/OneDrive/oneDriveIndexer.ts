import { listChildrenByItemId, getSiteIdFromPersonalPath, getDriveIdFromSite, getItemByPath } from "./oneDriveService";
import { getFile, clearCache } from "../../cache/fileCache";
import { FolderInfo, FileInfo } from "../../types/oneDriveCache";
import { oneDriveConfig, RootFolder } from "../../config/config";


export type { FolderInfo, FileInfo };

let initialized = false;

/**
 * Inicializa o indexador: obtém driveId e IDs das pastas raiz.
 * Precisa ser chamado uma vez na inicialização do app.
 */
export async function init(): Promise<void> {
    if (initialized) return;

    console.log("[OneDrive] Inicializando...");

    const siteId = await getSiteIdFromPersonalPath(
        oneDriveConfig.siteHostname,
        oneDriveConfig.personalPath
    );
    oneDriveConfig.driveId = await getDriveIdFromSite(siteId);

    console.log(`[OneDrive] DriveID: ${oneDriveConfig.driveId}`);

    // Obtém IDs das pastas raiz pelo path
    for (const folder of oneDriveConfig.rootFolders) {
        try {
            const item = await getItemByPath(oneDriveConfig.driveId, folder.path);
            folder.id = item.id;
            console.log(`[OneDrive] ✓ ${folder.name}: ${folder.id}`);
        } catch (err) {
            console.error(`[OneDrive] ✗ ${folder.name}: Não encontrada (${folder.path})`);
        }
    }

    initialized = true;
    console.log("[OneDrive] Pronto!");
}

// ============================================================================
// FUNÇÕES PARA LLM - CAMINHO: Pasta Mãe > Subpasta > Arquivo
// ============================================================================

/**
 * Lista as pastas mãe disponíveis (nomes amigáveis).
 * Ex: ["Embalagens", "Produtos", "Treinamento Sistemas"]
 */
export function getRootFolderNames(): string[] {
    return oneDriveConfig.rootFolders.map((f) => f.name);
}

/**
 * Lista subpastas dentro de uma pasta mãe.
 */
export async function getSubfolders(rootFolderName: string): Promise<string[]> {
    const root = findRootFolder(rootFolderName);
    if (!root || !root.id) {
        throw new Error(`Pasta mãe não encontrada: ${rootFolderName}`);
    }

    const items = await listChildrenByItemId(oneDriveConfig.driveId, root.id);
    const folders = items.filter((i) => i.folder);

    return folders.map((f) => f.name);
}

/**
 * Lista arquivos dentro de uma subpasta.
 */
export async function getFilesInSubfolder(
    rootFolderName: string,
    subfolderPath: string
): Promise<string[]> {
    const folderId = await resolveFolderPath(rootFolderName, subfolderPath);

    const items = await listChildrenByItemId(oneDriveConfig.driveId, folderId);
    const files = items.filter((i) => i.file);

    return files.map((f) => f.name);
}

/**
 * Baixa um arquivo de uma subpasta.
 * Retorna o caminho local do arquivo.
 */
export async function downloadFile(
    rootFolderName: string,
    subfolderPath: string,
    fileName: string
): Promise<string> {
    const folderId = await resolveFolderPath(rootFolderName, subfolderPath);

    const items = await listChildrenByItemId(oneDriveConfig.driveId, folderId);
    const files = items.filter((i) => i.file);

    // Busca por nome (parcial, case-insensitive)
    const term = fileName.toLowerCase();
    const file = files.find((f) => f.name.toLowerCase().includes(term));

    if (!file) {
        throw new Error(`Arquivo não encontrado: "${fileName}" em "${subfolderPath}"`);
    }

    console.log(`[Download] ${file.name}`);
    return await getFile(oneDriveConfig.driveId, file, folderId, subfolderPath);
}

/**
 * Lista tudo o que tem dentro de uma subpasta (pastas e arquivos).
 * Útil para a LLM entender a estrutura.
 */
export async function listContents(
    rootFolderName: string,
    subfolderPath?: string
): Promise<{ folders: string[]; files: string[] }> {
    let folderId: string;

    if (subfolderPath) {
        folderId = await resolveFolderPath(rootFolderName, subfolderPath);
    } else {
        const root = findRootFolder(rootFolderName);
        if (!root || !root.id) {
            throw new Error(`Pasta mãe não encontrada: ${rootFolderName}`);
        }
        folderId = root.id;
    }

    const items = await listChildrenByItemId(oneDriveConfig.driveId, folderId);

    return {
        folders: items.filter((i) => i.folder).map((f) => f.name),
        files: items.filter((i) => i.file).map((f) => f.name),
    };
}



function findRootFolder(name: string): RootFolder | undefined {
    const term = name.toLowerCase();
    return oneDriveConfig.rootFolders.find(
        (f) => f.name.toLowerCase().includes(term)
    );
}

/**
 * Resolve caminho de pasta para ID.
 * Ex: resolveFolderPath("Produtos", "Categoria/SubCategoria") -> "folder-id"
 */
async function resolveFolderPath(rootFolderName: string, subfolderPath: string): Promise<string> {
    const root = findRootFolder(rootFolderName);
    if (!root || !root.id) {
        throw new Error(`Pasta mãe não encontrada: ${rootFolderName}`);
    }

    const parts = subfolderPath.split("/").filter(Boolean);
    let currentId = root.id;

    for (const part of parts) {
        const items = await listChildrenByItemId(oneDriveConfig.driveId, currentId);
        const folder = items.find(
            (i) => i.folder && i.name.toLowerCase().includes(part.toLowerCase())
        );

        if (!folder) {
            throw new Error(`Subpasta não encontrada: "${part}" em "${subfolderPath}"`);
        }

        currentId = folder.id;
    }

    return currentId;
}
