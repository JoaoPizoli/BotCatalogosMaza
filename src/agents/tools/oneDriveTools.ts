import { tool } from '@openai/agents';
import { z } from 'zod';
import {
    init,
    getRootFolderNames,
    getSubfolders,
    listContents,
    downloadFile,
    getFilesInSubfolder,
} from '../../services/OneDrive/oneDriveIndexer';

// Flag para garantir inicialização única
let isInitialized = false;

// Cache global de arquivos baixados por sessão
// Isso permite enviar o arquivo automaticamente após o agente processar
const downloadedFiles = new Map<string, { path: string; name: string }>();

/**
 * Obtém e limpa o arquivo baixado para uma sessão
 */
export function getAndClearDownloadedFile(sessionId: string): { path: string; name: string } | null {
    const file = downloadedFiles.get(sessionId);
    if (file) {
        downloadedFiles.delete(sessionId);
        return file;
    }
    return null;
}

/**
 * Define o ID da sessão atual (chamado antes de processar com o agente)
 */
let currentSessionId: string | null = null;
export function setCurrentSession(sessionId: string) {
    currentSessionId = sessionId;
}

/**
 * Garante que o OneDrive está inicializado
 */
async function ensureInitialized(): Promise<void> {
    if (!isInitialized) {
        await init();
        isInitialized = true;
    }
}

/**
 * Tool: Lista as pastas raiz disponíveis
 */
export const listRootFoldersTool = tool({
    name: 'list_root_folders',
    description: 'Lista as pastas principais disponíveis no OneDrive (ex: Embalagens, Catálogos, Treinamentos)',
    parameters: z.object({}),
    execute: async () => {
        await ensureInitialized();
        const folders = getRootFolderNames();
        return `Pastas disponíveis:\n${folders.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
    },
});

/**
 * Tool: Lista conteúdo de uma pasta (subpastas e arquivos)
 */
export const listContentsTool = tool({
    name: 'list_contents',
    description: 'Lista o conteúdo (subpastas e arquivos) de uma pasta específica. Use para navegar pela estrutura de pastas.',
    parameters: z.object({
        rootFolder: z.string().describe('Nome da pasta raiz (ex: "Embalagens", "Catálogo Digitais")'),
        subfolderPath: z.string().nullable().describe('Caminho da subpasta (ex: "Cervejas" ou "Cervejas/Premium"). Use null para listar o conteúdo raiz.'),
    }),
    execute: async ({ rootFolder, subfolderPath }) => {
        await ensureInitialized();

        try {
            const contents = await listContents(rootFolder, subfolderPath ?? undefined);

            const parts: string[] = [];

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
        } catch (error: any) {
            return `Erro ao listar conteúdo: ${error.message}`;
        }
    },
});

/**
 * Tool: Busca arquivos em uma subpasta
 */
export const getFilesTool = tool({
    name: 'get_files',
    description: 'Lista apenas os arquivos de uma pasta específica.',
    parameters: z.object({
        rootFolder: z.string().describe('Nome da pasta raiz'),
        subfolderPath: z.string().describe('Caminho da subpasta onde buscar arquivos'),
    }),
    execute: async ({ rootFolder, subfolderPath }) => {
        await ensureInitialized();

        try {
            const files = await getFilesInSubfolder(rootFolder, subfolderPath);

            if (files.length === 0) {
                return 'Nenhum arquivo encontrado nesta pasta.';
            }

            return `Arquivos encontrados:\n${files.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
        } catch (error: any) {
            return `Erro ao buscar arquivos: ${error.message}`;
        }
    },
});

/**
 * Tool: Baixa um arquivo e armazena no cache da sessão
 */
export const downloadFileTool = tool({
    name: 'download_file',
    description: 'Baixa um arquivo do OneDrive. O arquivo será enviado automaticamente ao usuário.',
    parameters: z.object({
        rootFolder: z.string().describe('Nome da pasta raiz'),
        subfolderPath: z.string().describe('Caminho da subpasta onde o arquivo está'),
        fileName: z.string().describe('Nome do arquivo (pode ser parcial, busca case-insensitive)'),
    }),
    execute: async ({ rootFolder, subfolderPath, fileName }) => {
        await ensureInitialized();

        try {
            const localPath = await downloadFile(rootFolder, subfolderPath, fileName);

            // Armazena no cache da sessão atual
            if (currentSessionId) {
                downloadedFiles.set(currentSessionId, { path: localPath, name: fileName });
                console.log(`[Tool] Arquivo baixado e armazenado para sessão ${currentSessionId}`);
            }

            // Retorna confirmação simples (não depende do LLM copiar o marcador)
            return `Arquivo "${fileName}" baixado com sucesso. Será enviado automaticamente.`;
        } catch (error: any) {
            return `Erro ao baixar arquivo: ${error.message}`;
        }
    },
});

/**
 * Tool: Lista subpastas de uma pasta raiz
 */
export const listSubfoldersTool = tool({
    name: 'list_subfolders',
    description: 'Lista apenas as subpastas dentro de uma pasta raiz.',
    parameters: z.object({
        rootFolder: z.string().describe('Nome da pasta raiz'),
    }),
    execute: async ({ rootFolder }) => {
        await ensureInitialized();

        try {
            const subfolders = await getSubfolders(rootFolder);

            if (subfolders.length === 0) {
                return 'Nenhuma subpasta encontrada.';
            }

            return `Subpastas disponíveis:\n${subfolders.map((f, i) => `${i + 1}. ${f}`).join('\n')}`;
        } catch (error: any) {
            return `Erro ao listar subpastas: ${error.message}`;
        }
    },
});

/**
 * Exporta todas as tools como array para uso nos agentes
 */
export const oneDriveTools = [
    listRootFoldersTool,
    listContentsTool,
    listSubfoldersTool,
    getFilesTool,
    downloadFileTool,
];
