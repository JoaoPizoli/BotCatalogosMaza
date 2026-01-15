import { DriveItem } from "../../types/oneDrive";
type DriveChildrenResponse = {
    value: DriveItem[];
    "@odata.nextLink"?: string;
};
export declare function graphGet<T = any>(path: string): Promise<T>;
export declare function getSiteIdFromPersonalPath(hostname: string, personalPath: string): Promise<string>;
export declare function getDriveIdFromSite(siteId: string): Promise<string>;
export declare function getItemByPath(driveId: string, itemPath: string): Promise<DriveItem>;
export declare function listChildrenByDrivePath(driveId: string, drivePath: string): Promise<DriveChildrenResponse>;
export declare function listChildrenByItemId(driveId: string, folderItemId: string): Promise<DriveItem[]>;
export declare function downloadItemToFile(params: {
    driveId: string;
    itemId: string;
    destPath: string;
}): Promise<void>;
export {};
//# sourceMappingURL=oneDriveService.d.ts.map