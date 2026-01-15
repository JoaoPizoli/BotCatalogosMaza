import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { getAccessToken } from "../infra/auth/graphAuth";
import { DriveItem } from "../types/oneDrive";
import { CacheEntry, CacheIndex, FolderInfo, FileInfo } from "../types/oneDriveCache";

const CACHE_DIR = path.resolve(process.cwd(), "cache", "files");
const INDEX_FILE = path.resolve(process.cwd(), "cache", "index.json");

// ============================================================================
// FUNÇÕES INTERNAS
// ============================================================================

async function loadIndex(): Promise<CacheIndex> {
    try {
        const data = await fsp.readFile(INDEX_FILE, "utf-8");
        return JSON.parse(data);
    } catch {
        return {
            folders: {},
            files: {},
            folderOrder: [],
            lastSync: "",
        };
    }
}

async function saveIndex(index: CacheIndex): Promise<void> {
    await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    await fsp.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

// ============================================================================
// FUNÇÕES PARA PASTAS
// ============================================================================

/**
 * Lista todas as pastas disponíveis (na ordem original do OneDrive).
 * Retorna array com nome e info de cada pasta.
 */
export async function listFolders(): Promise<FolderInfo[]> {
    const index = await loadIndex();
    return index.folderOrder.map((id) => index.folders[id]).filter(Boolean);
}

/**
 * Busca pasta pelo nome (busca parcial, case-insensitive).
 */
export async function findFolder(searchTerm: string): Promise<FolderInfo | undefined> {
    const folders = await listFolders();
    const term = searchTerm.toLowerCase();
    return folders.find((f) => f.name.toLowerCase().includes(term));
}

/**
 * Atualiza a lista de pastas no cache.
 * Mantém a ordem original do OneDrive.
 */
export async function updateFolders(folders: DriveItem[]): Promise<void> {
    const index = await loadIndex();

    // Limpa pastas antigas
    index.folders = {};
    index.folderOrder = [];

    // Adiciona pastas na ordem
    for (const folder of folders) {
        if (folder.folder) { // É uma pasta
            index.folders[folder.id] = {
                id: folder.id,
                name: folder.name,
                childCount: folder.folder.childCount,
                eTag: folder.eTag,
            };
            index.folderOrder.push(folder.id);
        }
    }

    index.lastSync = new Date().toISOString();
    await saveIndex(index);
}

// ============================================================================
// FUNÇÕES PARA ARQUIVOS
// ============================================================================

/**
 * Lista arquivos de uma pasta específica (pelo nome ou ID).
 */
export async function listFilesInFolder(folderNameOrId: string): Promise<FileInfo[]> {
    const index = await loadIndex();

    // Procura pasta por nome ou ID
    let folderId = folderNameOrId;
    let folderName = folderNameOrId;

    const folder = Object.values(index.folders).find(
        (f) => f.id === folderNameOrId || f.name.toLowerCase().includes(folderNameOrId.toLowerCase())
    );
    if (folder) {
        folderId = folder.id;
        folderName = folder.name;
    }

    // Filtra arquivos dessa pasta
    return Object.values(index.files)
        .filter((f) => f.folderId === folderId)
        .map((f) => ({
            id: f.itemId,
            name: f.fileName,
            mimeType: undefined,
            size: f.size,
            eTag: f.eTag,
            isVideo: false,
            folderId,
            folderName,
        }));
}

/**
 * Busca arquivo pelo nome dentro de uma pasta.
 */
export async function getFileByName(
    folderNameOrId: string,
    fileName: string
): Promise<CacheEntry | undefined> {
    const index = await loadIndex();

    // Procura pasta
    const folder = Object.values(index.folders).find(
        (f) => f.id === folderNameOrId || f.name.toLowerCase().includes(folderNameOrId.toLowerCase())
    );
    if (!folder) return undefined;

    // Procura arquivo na pasta
    const term = fileName.toLowerCase();
    return Object.values(index.files).find(
        (f) => f.folderId === folder.id && f.fileName.toLowerCase().includes(term)
    );
}

/**
 * Obtém arquivo do cache ou baixa do OneDrive.
 * Verifica se o arquivo mudou usando eTag.
 */
export async function getFile(
    driveId: string,
    item: DriveItem,
    folderId?: string,
    folderName?: string
): Promise<string> {
    const index = await loadIndex();
    const entry = index.files[item.id];

    // Se está em cache, arquivo existe, e eTag não mudou -> retorna cache
    if (entry && fs.existsSync(entry.localPath)) {
        if (entry.eTag && entry.eTag === item.eTag) {
            console.log(`[Cache HIT] ${item.name}`);
            return entry.localPath;
        }
        console.log(`[Cache STALE] ${item.name} - eTag mudou, baixando novamente`);
    }

    // Baixa o arquivo
    console.log(`[Cache MISS] Baixando ${item.name}...`);
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}/content`;

    const ext = path.extname(item.name);
    const localPath = path.join(CACHE_DIR, `${item.id}${ext}`);

    await fsp.mkdir(CACHE_DIR, { recursive: true });

    const res = await axios.get(url, {
        responseType: "stream",
        headers: { Authorization: `Bearer ${token}` },
    });

    await new Promise<void>((resolve, reject) => {
        const writer = fs.createWriteStream(localPath);
        res.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });

    // Salva no índice
    index.files[item.id] = {
        itemId: item.id,
        driveId,
        fileName: item.name,
        localPath,
        size: item.size,
        eTag: item.eTag,
        cachedAt: new Date().toISOString(),
        folderId,
        folderName,
    };
    await saveIndex(index);

    return localPath;
}

/**
 * Atualiza arquivos de uma pasta no índice (sem baixar).
 */
export async function updateFilesIndex(
    driveId: string,
    folderId: string,
    folderName: string,
    items: DriveItem[]
): Promise<void> {
    const index = await loadIndex();

    // Remove arquivos antigos desta pasta que não existem mais
    const newIds = new Set(items.map((i) => i.id));
    for (const [id, entry] of Object.entries(index.files)) {
        if (entry.folderId === folderId && !newIds.has(id)) {
            if (fs.existsSync(entry.localPath)) {
                await fsp.unlink(entry.localPath);
            }
            delete index.files[id];
        }
    }

    // Adiciona/atualiza arquivos (sem baixar, apenas atualiza índice)
    for (const item of items) {
        if (!item.file) continue; // Ignora pastas

        const existing = index.files[item.id];
        if (existing) {
            // Atualiza metadados se mudou
            if (existing.eTag !== item.eTag) {
                existing.eTag = item.eTag;
                existing.size = item.size;
                // Marca pra baixar novamente quando acessar
                if (fs.existsSync(existing.localPath)) {
                    await fsp.unlink(existing.localPath);
                }
            }
        } else {
            // Novo arquivo - adiciona ao índice (não baixa ainda)
            index.files[item.id] = {
                itemId: item.id,
                driveId,
                fileName: item.name,
                localPath: path.join(CACHE_DIR, `${item.id}${path.extname(item.name)}`),
                size: item.size,
                eTag: item.eTag,
                cachedAt: "",
                folderId,
                folderName,
            };
        }
    }

    await saveIndex(index);
}

// ============================================================================
// FUNÇÕES DE STREAMING (VÍDEOS)
// ============================================================================

/**
 * Obtém URL de streaming para vídeos (não faz cache).
 */
export async function getVideoUrl(driveId: string, itemId: string): Promise<string> {
    const token = await getAccessToken();
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;

    const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        maxRedirects: 0,
        validateStatus: (s) => s === 302 || s === 200,
    });

    return res.headers.location || url;
}

// ============================================================================
// FUNÇÕES DE LIMPEZA
// ============================================================================

/**
 * Limpa todo o cache.
 */
export async function clearCache(): Promise<void> {
    const index = await loadIndex();

    for (const entry of Object.values(index.files)) {
        if (fs.existsSync(entry.localPath)) {
            await fsp.unlink(entry.localPath);
        }
    }

    await saveIndex({
        folders: {},
        files: {},
        folderOrder: [],
        lastSync: "",
    });
}

/**
 * Retorna estatísticas do cache.
 */
export async function getCacheStats(): Promise<{
    folderCount: number;
    fileCount: number;
    cachedFileCount: number;
    lastSync: string;
}> {
    const index = await loadIndex();

    const cachedCount = Object.values(index.files).filter(
        (f) => f.cachedAt && fs.existsSync(f.localPath)
    ).length;

    return {
        folderCount: index.folderOrder.length,
        fileCount: Object.keys(index.files).length,
        cachedFileCount: cachedCount,
        lastSync: index.lastSync,
    };
}
