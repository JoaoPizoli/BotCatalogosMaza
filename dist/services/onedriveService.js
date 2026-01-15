"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.graphGet = graphGet;
exports.getSiteIdFromPersonalPath = getSiteIdFromPersonalPath;
exports.getDriveIdFromSite = getDriveIdFromSite;
exports.listChildrenByDrivePath = listChildrenByDrivePath;
const axios_1 = __importDefault(require("axios"));
const graphAuth_1 = require("../infra/auth/graphAuth");
async function graphGet(path) {
    const token = await (0, graphAuth_1.getAcessToken)();
    try {
        const res = await axios_1.default.get(`https://graph.microsoft.com/v1.0${path}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    }
    catch (err) {
        const status = err?.response.status;
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
async function listChildrenByDrivePath(driveId, drivePath) {
    const encoded = safeEncodePath(drivePath.replace(/^\/+/, ""));
    return graphGet(`/drives/${driveId}/root:/${encoded}:/children`);
}
const hostname = "cloudmaza-my.sharepoint.com";
const personalPath = "/personal/caio_constantino_maza_com_br";
const drivePath = "Área de Trabalho/Maza/19. Area Representantes";
(async () => {
    try {
        console.log("Iniciando teste do OneDrive...");
        const siteId = await getSiteIdFromPersonalPath(hostname, personalPath);
        console.log("Site ID:", siteId);
        const driveId = await getDriveIdFromSite(siteId);
        console.log("Drive ID:", driveId);
        const children = await listChildrenByDrivePath(driveId, drivePath);
        console.log("Arquivos encontrados:", children);
    }
    catch (error) {
        console.error("Erro ao testar OneDrive:", error);
    }
})();
//# sourceMappingURL=onedriveService.js.map