"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oneDriveTools = exports.listSubfoldersTool = exports.downloadFileTool = exports.getFilesTool = exports.listContentsTool = exports.listRootFoldersTool = void 0;
const agents_1 = require("@openai/agents");
const zod_1 = require("zod");
const oneDriveIndexer_1 = require("../../services/OneDrive/oneDriveIndexer");
let isInitialized = false;
async function ensureInitialized() {
    if (!isInitialized) {
        await (0, oneDriveIndexer_1.init)();
        isInitialized = true;
    }
}
exports.listRootFoldersTool = (0, agents_1.tool)({
    name: 'list_root_folders',
    description: 'Lista as pastas principais disponíveis no OneDrive (ex: Embalagens, Catálogos, Treinamentos)',
    parameters: zod_1.z.object({}),
    execute: async () => {
        await ensureInitialized();
        const folders = (0, oneDriveIndexer_1.getRootFolderNames)();
        return `Pastas disponíveis:\n${folders.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
    },
});
exports.listContentsTool = (0, agents_1.tool)({
    name: 'list_contents',
    description: 'Lista o conteúdo (subpastas e arquivos) de uma pasta específica. Use para navegar pela estrutura de pastas.',
    parameters: zod_1.z.object({
        rootFolder: zod_1.z.string().describe('Nome da pasta raiz (ex: "Embalagens", "Catálogo Digitais")'),
        subfolderPath: zod_1.z.string().nullable().describe('Caminho da subpasta (ex: "Cervejas" ou "Cervejas/Premium"). Use null para listar o conteúdo raiz.'),
    }),
    execute: async ({ rootFolder, subfolderPath }) => {
        await ensureInitialized();
        try {
            const contents = await (0, oneDriveIndexer_1.listContents)(rootFolder, subfolderPath ?? undefined);
            const parts = [];
            if (contents.folders.length > 0) {
                parts.push(`📂 Pastas:\n${contents.folders.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}`);
            }
            if (contents.files.length > 0) {
                parts.push(`📄 Arquivos:\n${contents.files.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}`);
            }
            if (parts.length === 0) {
                return 'Pasta vazia.';
            }
            return parts.join('\n\n');
        }
        catch (error) {
            return `Erro ao listar conteúdo: ${error.message}`;
        }
    },
});
exports.getFilesTool = (0, agents_1.tool)({
    name: 'get_files',
    description: 'Lista apenas os arquivos de uma pasta específica.',
    parameters: zod_1.z.object({
        rootFolder: zod_1.z.string().describe('Nome da pasta raiz'),
        subfolderPath: zod_1.z.string().describe('Caminho da subpasta onde buscar arquivos'),
    }),
    execute: async ({ rootFolder, subfolderPath }) => {
        await ensureInitialized();
        try {
            const files = await (0, oneDriveIndexer_1.getFilesInSubfolder)(rootFolder, subfolderPath);
            if (files.length === 0) {
                return 'Nenhum arquivo encontrado nesta pasta.';
            }
            return `Arquivos encontrados:\n${files.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
        }
        catch (error) {
            return `Erro ao buscar arquivos: ${error.message}`;
        }
    },
});
exports.downloadFileTool = (0, agents_1.tool)({
    name: 'download_file',
    description: 'Baixa um arquivo do OneDrive e retorna o caminho local para envio. Use quando o usuário pedir para receber um arquivo.',
    parameters: zod_1.z.object({
        rootFolder: zod_1.z.string().describe('Nome da pasta raiz'),
        subfolderPath: zod_1.z.string().describe('Caminho da subpasta onde o arquivo está'),
        fileName: zod_1.z.string().describe('Nome do arquivo (pode ser parcial, busca case-insensitive)'),
    }),
    execute: async ({ rootFolder, subfolderPath, fileName }) => {
        await ensureInitialized();
        try {
            const localPath = await (0, oneDriveIndexer_1.downloadFile)(rootFolder, subfolderPath, fileName);
            return `__FILE_READY__:${localPath}:${fileName}`;
        }
        catch (error) {
            return `Erro ao baixar arquivo: ${error.message}`;
        }
    },
});
exports.listSubfoldersTool = (0, agents_1.tool)({
    name: 'list_subfolders',
    description: 'Lista apenas as subpastas dentro de uma pasta raiz.',
    parameters: zod_1.z.object({
        rootFolder: zod_1.z.string().describe('Nome da pasta raiz'),
    }),
    execute: async ({ rootFolder }) => {
        await ensureInitialized();
        try {
            const subfolders = await (0, oneDriveIndexer_1.getSubfolders)(rootFolder);
            if (subfolders.length === 0) {
                return 'Nenhuma subpasta encontrada.';
            }
            return `Subpastas disponíveis:\n${subfolders.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
        }
        catch (error) {
            return `Erro ao listar subpastas: ${error.message}`;
        }
    },
});
exports.oneDriveTools = [
    exports.listRootFoldersTool,
    exports.listContentsTool,
    exports.listSubfoldersTool,
    exports.getFilesTool,
    exports.downloadFileTool,
];
//# sourceMappingURL=oneDriveTools.js.map