import { FolderInfo, FileInfo } from "../../types/oneDriveCache";
export type { FolderInfo, FileInfo };
export declare function init(): Promise<void>;
export declare function getRootFolderNames(): string[];
export declare function getSubfolders(rootFolderName: string): Promise<string[]>;
export declare function getNestedSubfolders(rootFolderName: string, subfolderPath: string): Promise<string[]>;
export declare function getFilesInSubfolder(rootFolderName: string, subfolderPath: string): Promise<string[]>;
export declare function downloadFile(rootFolderName: string, subfolderPath: string, fileName: string): Promise<string>;
export declare function listContents(rootFolderName: string, subfolderPath?: string): Promise<{
    folders: string[];
    files: string[];
}>;
export declare function sync(): Promise<void>;
//# sourceMappingURL=oneDriveIndexer.d.ts.map