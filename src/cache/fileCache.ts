import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { getAccessToken } from "../infra/auth/graphAuth";
import { DriveItem } from "../types/oneDrive";
import { CacheIndex } from "../types/oneDriveCache";

const CACHE_DIR = path.resolve(process.cwd(), "cache", "files");
const INDEX_FILE = path.resolve(process.cwd(), "cache", "index.json");

// Cache do index em memória para evitar I/O de disco
let memoryIndex: CacheIndex | null = null;
let indexDirty = false;

/**
 * Carrega index do disco (apenas uma vez)
 */
async function loadIndex(): Promise<CacheIndex> {
    // Retorna do cache de memória se disponível
    if (memoryIndex) {
        return memoryIndex;
    }

    try {
        const data = await fsp.readFile(INDEX_FILE, "utf-8");
        memoryIndex = JSON.parse(data);
        console.log("[FileCache] Index carregado em memória");
    } catch {
        memoryIndex = {
            folders: {},
            files: {},
            folderOrder: [],
            lastSync: "",
        };
    }

    return memoryIndex!;
}

/**
 * Salva index no disco (com debounce)
 */
let saveTimeout: NodeJS.Timeout | null = null;

async function saveIndex(index: CacheIndex): Promise<void> {
    memoryIndex = index;
    indexDirty = true;

    // Debounce: salva no disco apenas após 5 segundos sem alterações
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        if (indexDirty && memoryIndex) {
            try {
                await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
                await fsp.writeFile(INDEX_FILE, JSON.stringify(memoryIndex, null, 2));
                indexDirty = false;
                console.log("[FileCache] Index salvo em disco");
            } catch (err) {
                console.error("[FileCache] Erro ao salvar index:", err);
            }
        }
    }, 5000);
}

/**
 * Força salvamento imediato (chamar ao encerrar app)
 */
export async function flushIndex(): Promise<void> {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    if (indexDirty && memoryIndex) {
        await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
        await fsp.writeFile(INDEX_FILE, JSON.stringify(memoryIndex, null, 2));
        indexDirty = false;
        console.log("[FileCache] Index flush completo");
    }
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

    if (entry && fs.existsSync(entry.localPath)) {
        if (entry.eTag && entry.eTag === item.eTag) {
            console.log(`[Cache HIT] ${item.name}`);
            return entry.localPath;
        }
        console.log(`[Cache STALE] ${item.name} - eTag mudou, baixando novamente`);
    }

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
 * Limpa todo o cache.
 */
export async function clearCache(): Promise<void> {
    const index = await loadIndex();

    for (const entry of Object.values(index.files)) {
        if (fs.existsSync(entry.localPath)) {
            await fsp.unlink(entry.localPath);
        }
    }

    memoryIndex = {
        folders: {},
        files: {},
        folderOrder: [],
        lastSync: "",
    };

    await fsp.mkdir(path.dirname(INDEX_FILE), { recursive: true });
    await fsp.writeFile(INDEX_FILE, JSON.stringify(memoryIndex, null, 2));
    indexDirty = false;
}

/**
 * Remove arquivos do cache que são mais antigos que X horas.
 * @param maxAgeHours Idade máxima em horas (padrão: 24h)
 */
export async function cleanupOldFiles(maxAgeHours: number = 24): Promise<void> {
    console.log(`[FileCache] Iniciando limpeza de arquivos antigos (> ${maxAgeHours}h)...`);
    const index = await loadIndex();
    const now = new Date();
    let removedCount = 0;
    let spaceFreedBytes = 0;

    for (const fileId in index.files) {
        const entry = index.files[fileId];

        // Verifica data de cache
        const cachedAt = new Date(entry.cachedAt);
        const ageHours = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60);

        if (ageHours > maxAgeHours) {
            try {
                if (fs.existsSync(entry.localPath)) {
                    await fsp.unlink(entry.localPath);
                    spaceFreedBytes += entry.size || 0;
                }
                delete index.files[fileId];
                removedCount++;
                console.log(`[FileCache] Removido: ${entry.fileName} (${ageHours.toFixed(1)}h)`);
            } catch (err) {
                console.error(`[FileCache] Erro ao remover ${entry.fileName}:`, err);
            }
        }
    }

    if (removedCount > 0) {
        await saveIndex(index);
        console.log(`[FileCache] Limpeza concluída. ${removedCount} arquivos removidos. Espaço liberado: ${(spaceFreedBytes / (1024 * 1024)).toFixed(2)} MB`);
    } else {
        console.log(`[FileCache] Nenhum arquivo antigo encontrado.`);
    }
}
