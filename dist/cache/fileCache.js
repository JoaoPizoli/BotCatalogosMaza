"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFolders = listFolders;
exports.findFolder = findFolder;
exports.updateFolders = updateFolders;
exports.listFilesInFolder = listFilesInFolder;
exports.getFileByName = getFileByName;
exports.getFile = getFile;
exports.updateFilesIndex = updateFilesIndex;
exports.getVideoUrl = getVideoUrl;
exports.clearCache = clearCache;
exports.getCacheStats = getCacheStats;
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const axios_1 = __importDefault(require("axios"));
const graphAuth_1 = require("../infra/auth/graphAuth");
const CACHE_DIR = node_path_1.default.resolve(process.cwd(), "cache", "files");
const INDEX_FILE = node_path_1.default.resolve(process.cwd(), "cache", "index.json");
async function loadIndex() {
    try {
        const data = await promises_1.default.readFile(INDEX_FILE, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return {
            folders: {},
            files: {},
            folderOrder: [],
            lastSync: "",
        };
    }
}
async function saveIndex(index) {
    await promises_1.default.mkdir(node_path_1.default.dirname(INDEX_FILE), { recursive: true });
    await promises_1.default.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}
async function listFolders() {
    const index = await loadIndex();
    return index.folderOrder.map((id) => index.folders[id]).filter(Boolean);
}
async function findFolder(searchTerm) {
    const folders = await listFolders();
    const term = searchTerm.toLowerCase();
    return folders.find((f) => f.name.toLowerCase().includes(term));
}
async function updateFolders(folders) {
    const index = await loadIndex();
    index.folders = {};
    index.folderOrder = [];
    for (const folder of folders) {
        if (folder.folder) {
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
async function listFilesInFolder(folderNameOrId) {
    const index = await loadIndex();
    let folderId = folderNameOrId;
    let folderName = folderNameOrId;
    const folder = Object.values(index.folders).find((f) => f.id === folderNameOrId || f.name.toLowerCase().includes(folderNameOrId.toLowerCase()));
    if (folder) {
        folderId = folder.id;
        folderName = folder.name;
    }
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
async function getFileByName(folderNameOrId, fileName) {
    const index = await loadIndex();
    const folder = Object.values(index.folders).find((f) => f.id === folderNameOrId || f.name.toLowerCase().includes(folderNameOrId.toLowerCase()));
    if (!folder)
        return undefined;
    const term = fileName.toLowerCase();
    return Object.values(index.files).find((f) => f.folderId === folder.id && f.fileName.toLowerCase().includes(term));
}
async function getFile(driveId, item, folderId, folderName) {
    const index = await loadIndex();
    const entry = index.files[item.id];
    if (entry && node_fs_1.default.existsSync(entry.localPath)) {
        if (entry.eTag && entry.eTag === item.eTag) {
            console.log(`[Cache HIT] ${item.name}`);
            return entry.localPath;
        }
        console.log(`[Cache STALE] ${item.name} - eTag mudou, baixando novamente`);
    }
    console.log(`[Cache MISS] Baixando ${item.name}...`);
    const token = await (0, graphAuth_1.getAccessToken)();
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${item.id}/content`;
    const ext = node_path_1.default.extname(item.name);
    const localPath = node_path_1.default.join(CACHE_DIR, `${item.id}${ext}`);
    await promises_1.default.mkdir(CACHE_DIR, { recursive: true });
    const res = await axios_1.default.get(url, {
        responseType: "stream",
        headers: { Authorization: `Bearer ${token}` },
    });
    await new Promise((resolve, reject) => {
        const writer = node_fs_1.default.createWriteStream(localPath);
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
async function updateFilesIndex(driveId, folderId, folderName, items) {
    const index = await loadIndex();
    const newIds = new Set(items.map((i) => i.id));
    for (const [id, entry] of Object.entries(index.files)) {
        if (entry.folderId === folderId && !newIds.has(id)) {
            if (node_fs_1.default.existsSync(entry.localPath)) {
                await promises_1.default.unlink(entry.localPath);
            }
            delete index.files[id];
        }
    }
    for (const item of items) {
        if (!item.file)
            continue;
        const existing = index.files[item.id];
        if (existing) {
            if (existing.eTag !== item.eTag) {
                existing.eTag = item.eTag;
                existing.size = item.size;
                if (node_fs_1.default.existsSync(existing.localPath)) {
                    await promises_1.default.unlink(existing.localPath);
                }
            }
        }
        else {
            index.files[item.id] = {
                itemId: item.id,
                driveId,
                fileName: item.name,
                localPath: node_path_1.default.join(CACHE_DIR, `${item.id}${node_path_1.default.extname(item.name)}`),
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
async function getVideoUrl(driveId, itemId) {
    const token = await (0, graphAuth_1.getAccessToken)();
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
    const res = await axios_1.default.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        maxRedirects: 0,
        validateStatus: (s) => s === 302 || s === 200,
    });
    return res.headers.location || url;
}
async function clearCache() {
    const index = await loadIndex();
    for (const entry of Object.values(index.files)) {
        if (node_fs_1.default.existsSync(entry.localPath)) {
            await promises_1.default.unlink(entry.localPath);
        }
    }
    await saveIndex({
        folders: {},
        files: {},
        folderOrder: [],
        lastSync: "",
    });
}
async function getCacheStats() {
    const index = await loadIndex();
    const cachedCount = Object.values(index.files).filter((f) => f.cachedAt && node_fs_1.default.existsSync(f.localPath)).length;
    return {
        folderCount: index.folderOrder.length,
        fileCount: Object.keys(index.files).length,
        cachedFileCount: cachedCount,
        lastSync: index.lastSync,
    };
}
//# sourceMappingURL=fileCache.js.map