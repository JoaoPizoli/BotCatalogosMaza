export type DriveItem = {
    id: string;
    name: string;
    eTag?: string;
    cTag?: string;
    size?: number;
    lastModifiedDateTime?: string;
    folder?: {
        childCount?: number;
    };
    file?: {
        mimeType?: string;
    };
};
//# sourceMappingURL=oneDrive.d.ts.map