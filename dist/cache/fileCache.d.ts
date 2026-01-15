import { DriveItem } from "../types/oneDrive";
import { CacheEntry, FolderInfo, FileInfo } from "../types/oneDriveCache";
export declare function listFolders(): Promise<FolderInfo[]>;
export declare function findFolder(searchTerm: string): Promise<FolderInfo | undefined>;
export declare function updateFolders(folders: DriveItem[]): Promise<void>;
export declare function listFilesInFolder(folderNameOrId: string): Promise<FileInfo[]>;
export declare function getFileByName(folderNameOrId: string, fileName: string): Promise<CacheEntry | undefined>;
export declare function getFile(driveId: string, item: DriveItem, folderId?: string, folderName?: string): Promise<string>;
export declare function updateFilesIndex(driveId: string, folderId: string, folderName: string, items: DriveItem[]): Promise<void>;
export declare function getVideoUrl(driveId: string, itemId: string): Promise<string>;
export declare function clearCache(): Promise<void>;
export declare function getCacheStats(): Promise<{
    folderCount: number;
    fileCount: number;
    cachedFileCount: number;
    lastSync: string;
}>;
//# sourceMappingURL=fileCache.d.ts.map