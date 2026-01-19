import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import { getAccessToken } from "../infra/auth/graphAuth";
import { DriveItem } from "../types/oneDrive";
import { CacheIndex } from "../types/oneDriveCache";

const CACHE_DIR = path.resolve(process.cwd(), "cache", "files");
const INDEX_FILE = path.resolve(process.cwd(), "cache", "index.json");


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

    await saveIndex({
        folders: {},
        files: {},
        folderOrder: [],
        lastSync: "",
    });
}
