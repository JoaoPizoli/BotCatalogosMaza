"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFile = getFile;
exports.clearCache = clearCache;
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
//# sourceMappingURL=fileCache.js.map