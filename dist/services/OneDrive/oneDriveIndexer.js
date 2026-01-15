"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = init;
exports.getRootFolderNames = getRootFolderNames;
exports.getSubfolders = getSubfolders;
exports.getNestedSubfolders = getNestedSubfolders;
exports.getFilesInSubfolder = getFilesInSubfolder;
exports.downloadFile = downloadFile;
exports.listContents = listContents;
exports.sync = sync;
const oneDriveService_1 = require("./oneDriveService");
const fileCache_1 = require("../../cache/fileCache");
const config_1 = require("../../config/config");
let initialized = false;
async function init() {
    if (initialized)
        return;
    console.log("[OneDrive] Inicializando...");
    const siteId = await (0, oneDriveService_1.getSiteIdFromPersonalPath)(config_1.oneDriveConfig.siteHostname, config_1.oneDriveConfig.personalPath);
    config_1.oneDriveConfig.driveId = await (0, oneDriveService_1.getDriveIdFromSite)(siteId);
    console.log(`[OneDrive] DriveID: ${config_1.oneDriveConfig.driveId}`);
    for (const folder of config_1.oneDriveConfig.rootFolders) {
        try {
            const item = await (0, oneDriveService_1.getItemByPath)(config_1.oneDriveConfig.driveId, folder.path);
            folder.id = item.id;
            console.log(`[OneDrive] ✓ ${folder.name}: ${folder.id}`);
        }
        catch (err) {
            console.error(`[OneDrive] ✗ ${folder.name}: Não encontrada (${folder.path})`);
        }
    }
    initialized = true;
    console.log("[OneDrive] Pronto!");
}
function getRootFolderNames() {
    return config_1.oneDriveConfig.rootFolders.map((f) => f.name);
}
async function getSubfolders(rootFolderName) {
    const root = findRootFolder(rootFolderName);
    if (!root || !root.id) {
        throw new Error(`Pasta mãe não encontrada: ${rootFolderName}`);
    }
    const items = await (0, oneDriveService_1.listChildrenByItemId)(config_1.oneDriveConfig.driveId, root.id);
    const folders = items.filter((i) => i.folder);
    return folders.map((f) => f.name);
}
async function getNestedSubfolders(rootFolderName, subfolderPath) {
    const folderId = await resolveFolderPath(rootFolderName, subfolderPath);
    const items = await (0, oneDriveService_1.listChildrenByItemId)(config_1.oneDriveConfig.driveId, folderId);
    const folders = items.filter((i) => i.folder);
    return folders.map((f) => f.name);
}
async function getFilesInSubfolder(rootFolderName, subfolderPath) {
    const folderId = await resolveFolderPath(rootFolderName, subfolderPath);
    const items = await (0, oneDriveService_1.listChildrenByItemId)(config_1.oneDriveConfig.driveId, folderId);
    const files = items.filter((i) => i.file);
    return files.map((f) => f.name);
}
async function downloadFile(rootFolderName, subfolderPath, fileName) {
    const folderId = await resolveFolderPath(rootFolderName, subfolderPath);
    const items = await (0, oneDriveService_1.listChildrenByItemId)(config_1.oneDriveConfig.driveId, folderId);
    const files = items.filter((i) => i.file);
    const term = fileName.toLowerCase();
    const file = files.find((f) => f.name.toLowerCase().includes(term));
    if (!file) {
        throw new Error(`Arquivo não encontrado: "${fileName}" em "${subfolderPath}"`);
    }
    console.log(`[Download] ${file.name}`);
    return await (0, fileCache_1.getFile)(config_1.oneDriveConfig.driveId, file, folderId, subfolderPath);
}
async function listContents(rootFolderName, subfolderPath) {
    let folderId;
    if (subfolderPath) {
        folderId = await resolveFolderPath(rootFolderName, subfolderPath);
    }
    else {
        const root = findRootFolder(rootFolderName);
        if (!root || !root.id) {
            throw new Error(`Pasta mãe não encontrada: ${rootFolderName}`);
        }
        folderId = root.id;
    }
    const items = await (0, oneDriveService_1.listChildrenByItemId)(config_1.oneDriveConfig.driveId, folderId);
    return {
        folders: items.filter((i) => i.folder).map((f) => f.name),
        files: items.filter((i) => i.file).map((f) => f.name),
    };
}
function findRootFolder(name) {
    const term = name.toLowerCase();
    return config_1.oneDriveConfig.rootFolders.find((f) => f.name.toLowerCase().includes(term));
}
async function resolveFolderPath(rootFolderName, subfolderPath) {
    const root = findRootFolder(rootFolderName);
    if (!root || !root.id) {
        throw new Error(`Pasta mãe não encontrada: ${rootFolderName}`);
    }
    const parts = subfolderPath.split("/").filter(Boolean);
    let currentId = root.id;
    for (const part of parts) {
        const items = await (0, oneDriveService_1.listChildrenByItemId)(config_1.oneDriveConfig.driveId, currentId);
        const folder = items.find((i) => i.folder && i.name.toLowerCase().includes(part.toLowerCase()));
        if (!folder) {
            throw new Error(`Subpasta não encontrada: "${part}" em "${subfolderPath}"`);
        }
        currentId = folder.id;
    }
    return currentId;
}
async function sync() {
    initialized = false;
    await (0, fileCache_1.clearCache)();
    await init();
}
//# sourceMappingURL=oneDriveIndexer.js.map