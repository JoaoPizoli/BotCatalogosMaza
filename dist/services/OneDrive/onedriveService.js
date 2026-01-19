"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphGet = graphGet;
exports.getSiteIdFromPersonalPath = getSiteIdFromPersonalPath;
exports.getDriveIdFromSite = getDriveIdFromSite;
exports.getItemByPath = getItemByPath;
exports.listChildrenByItemId = listChildrenByItemId;
const axios_1 = __importDefault(require("axios"));
const graphAuth_1 = require("../../infra/auth/graphAuth");
const concurrency_1 = require("../../utils/concurrency");
const retry_1 = require("../../utils/retry");
async function graphGet(path) {
    return concurrency_1.oneDriveSemaphore.run(() => (0, retry_1.withRetry)(async () => {
        const token = await (0, graphAuth_1.getAccessToken)();
        const res = await axios_1.default.get(`https://graph.microsoft.com/v1.0${path}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    }, {
        maxRetries: 2,
        baseDelayMs: 1000,
    }));
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
//# sourceMappingURL=oneDriveService.js.map