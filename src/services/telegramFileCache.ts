import { getPgPool } from "../database/db";

/**
 * Salva o file_id do Telegram para um arquivo específico
 */
export async function saveFileId(fileName: string, fileId: string, fileType: 'photo' | 'video' | 'document' | 'audio') {
    const pool = getPgPool();

    try {
        await pool.query(
            `INSERT INTO telegram_file_cache (file_name, file_id, file_type) VALUES ($1, $2, $3)
             ON CONFLICT (file_name) DO UPDATE SET file_id = $2, file_type = $3`,
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
    const pool = getPgPool();

    try {
        const result = await pool.query(
            `SELECT file_id FROM telegram_file_cache WHERE file_name = $1`,
            [fileName]
        );

        if (result.rows.length > 0 && result.rows[0].file_id) {
            console.log(`[Cache] FileID encontrado para: ${fileName}`);
            return result.rows[0].file_id;
        }
    } catch (error) {
        console.error(`[Cache] Erro ao buscar FileID:`, error);
    }

    return null;
}
