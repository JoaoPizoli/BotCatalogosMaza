/** Entrada de arquivo no cache */
export interface CacheEntry {
    itemId: string;
    driveId: string;
    fileName: string;
    localPath: string;
    size?: number;
    eTag?: string;
    cachedAt: string;
    folderId?: string;   // ID da pasta pai
    folderName?: string; // Nome da pasta pai
}

/** Informação de uma pasta */
export interface FolderInfo {
    id: string;
    name: string;
    childCount?: number;
    eTag?: string;
}

/** Informação de um arquivo */
export interface FileInfo {
    id: string;
    name: string;
    mimeType?: string;
    size?: number;
    eTag?: string;
    isVideo: boolean;
    folderId: string;
    folderName: string;
}


export interface CacheIndex {
    folders: Record<string, FolderInfo>;   // folderId -> FolderInfo
    files: Record<string, CacheEntry>;     // itemId -> CacheEntry
    folderOrder: string[];                 // IDs das pastas na ordem original
    lastSync: string;
}
