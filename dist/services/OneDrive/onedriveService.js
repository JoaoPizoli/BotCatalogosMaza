"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphGet = graphGet;
exports.getSiteIdFromPersonalPath = getSiteIdFromPersonalPath;
exports.getDriveIdFromSite = getDriveIdFromSite;
exports.getItemByPath = getItemByPath;
exports.listChildrenByDrivePath = listChildrenByDrivePath;
exports.listChildrenByItemId = listChildrenByItemId;
exports.downloadItemToFile = downloadItemToFile;
const axios_1 = __importDefault(require("axios"));
const graphAuth_1 = require("../../infra/auth/graphAuth");
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
async function graphGet(path) {
    const token = await (0, graphAuth_1.getAccessToken)();
    try {
        const res = await axios_1.default.get(`https://graph.microsoft.com/v1.0${path}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    }
    catch (err) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.error?.message ?? err?.message ?? "Erro desconhecido no Graph";
        throw new Error(`Graph GET falhou (${status ?? "?"}): ${msg}`);
    }
}
async function getSiteIdFromPersonalPath(hostname, personalPath) {
    const site = await graphGet(`/sites/${hostname}:${personalPath}`);
    if (!site?.id)
        throw new Error("Não consegui obter siteId do SharePoint.");
    return site.id;
}
async function getDriveIdFromSite(siteId) {
    const drive = await graphGet(`/sites/${siteId}/drive`);
    if (!drive?.id)
        throw new Error("Não consegui obter driveId do site");
    return drive.id;
}
function safeEncodePath(p) {
    return p.split("/").map(encodeURIComponent).join("/");
}
async function getItemByPath(driveId, itemPath) {
    const encoded = safeEncodePath(itemPath.replace(/^\/+/, ""));
    return graphGet(`/drives/${driveId}/root:/${encoded}`);
}
async function listChildrenByDrivePath(driveId, drivePath) {
    const encoded = safeEncodePath(drivePath.replace(/^\/+/, ""));
    return graphGet(`/drives/${driveId}/root:/${encoded}:/children`);
}
async function listChildrenByItemId(driveId, folderItemId) {
    const all = [];
    let page = await graphGet(`/drives/${driveId}/items/${folderItemId}/children?$select=id,name,eTag,cTag,size,lastModifiedDateTime,file,folder`);
    all.push(...page.value);
    while (page["@odata.nextLink"]) {
        const nextPath = page["@odata.nextLink"].replace("https://graph.microsoft.com/v1.0", "");
        page = await graphGet(nextPath);
        all.push(...page.value);
    }
    return all;
}
async function downloadItemToFile(params) {
    const { driveId, itemId, destPath } = params;
    const token = await (0, graphAuth_1.getAccessToken)();
    const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/content`;
    const res = await axios_1.default.get(url, {
        responseType: "stream",
        headers: { Authorization: `Bearer ${token}` },
        maxRedirects: 5,
    });
    await promises_1.default.mkdir(node_path_1.default.dirname(destPath), { recursive: true });
    await new Promise((resolve, reject) => {
        const tmp = `${destPath}.tmp`;
        const w = node_fs_1.default.createWriteStream(tmp);
        res.data.pipe(w);
        w.on("finish", async () => {
            try {
                await promises_1.default.rename(tmp, destPath);
                resolve();
            }
            catch (e) {
                reject(e);
            }
        });
        w.on("error", reject);
    });
}
//# sourceMappingURL=oneDriveService.js.map