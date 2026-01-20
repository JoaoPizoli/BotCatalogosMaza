import { getDb } from "../database/db";

/**
 * Salva o file_id do Telegram para um arquivo específico
 */
export async function saveFileId(fileName: string, fileId: string, fileType: 'photo' | 'video' | 'document' | 'audio') {
    const db = getDb();
    if (!db) return;

    try {
        await db.run(
            `INSERT OR REPLACE INTO telegram_file_cache (file_name, file_id, file_type) VALUES (?, ?, ?)`,
            [fileName, fileId, fileType]
        );
        console.log(`[Cache] FileID salvo para: ${fileName}`);
    } catch (error) {
        console.error(`[Cache] Erro ao salvar FileID:`, error);
    }
}

/**
 * Busca o file_id do Telegram para um arquivo
 */
export async function getFileId(fileName: string): Promise<string | null> {
    const db = getDb();
    if (!db) return null;

    try {
        const result = await db.get(
            `SELECT file_id FROM telegram_file_cache WHERE file_name = ?`,
            [fileName]
        );

        if (result && result.file_id) {
            console.log(`[Cache] FileID encontrado para: ${fileName}`);
            return result.file_id;
        }
    } catch (error) {
        console.error(`[Cache] Erro ao buscar FileID:`, error);
    }

    return null;
}
