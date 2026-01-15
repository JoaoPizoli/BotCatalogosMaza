export interface CacheEntry {
    itemId: string;
    driveId: string;
    fileName: string;
    localPath: string;
    size?: number;
    eTag?: string;
    cachedAt: string;
    folderId?: string;
    folderName?: string;
}
export interface FolderInfo {
    id: string;
    name: string;
    childCount?: number;
    eTag?: string;
}
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
    folders: Record<string, FolderInfo>;
    files: Record<string, CacheEntry>;
    folderOrder: string[];
    lastSync: string;
}
//# sourceMappingURL=oneDriveCache.d.ts.map