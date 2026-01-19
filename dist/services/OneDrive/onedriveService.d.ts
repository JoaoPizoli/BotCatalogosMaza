import { DriveItem } from "../../types/oneDrive";
export declare function graphGet<T = any>(path: string): Promise<T>;
export declare function getSiteIdFromPersonalPath(hostname: string, personalPath: string): Promise<string>;
export declare function getDriveIdFromSite(siteId: string): Promise<string>;
export declare function getItemByPath(driveId: string, itemPath: string): Promise<DriveItem>;
export declare function listChildrenByItemId(driveId: string, folderItemId: string): Promise<DriveItem[]>;
//# sourceMappingURL=oneDriveService.d.ts.map