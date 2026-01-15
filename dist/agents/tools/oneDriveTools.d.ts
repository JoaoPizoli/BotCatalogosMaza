import { z } from 'zod';
export declare const listRootFoldersTool: import("@openai/agents").FunctionTool<unknown, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>, string>;
export declare const listContentsTool: import("@openai/agents").FunctionTool<unknown, z.ZodObject<{
    rootFolder: z.ZodString;
    subfolderPath: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    rootFolder: string;
    subfolderPath: string | null;
}, {
    rootFolder: string;
    subfolderPath: string | null;
}>, string>;
export declare const getFilesTool: import("@openai/agents").FunctionTool<unknown, z.ZodObject<{
    rootFolder: z.ZodString;
    subfolderPath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    rootFolder: string;
    subfolderPath: string;
}, {
    rootFolder: string;
    subfolderPath: string;
}>, string>;
export declare const downloadFileTool: import("@openai/agents").FunctionTool<unknown, z.ZodObject<{
    rootFolder: z.ZodString;
    subfolderPath: z.ZodString;
    fileName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    rootFolder: string;
    subfolderPath: string;
    fileName: string;
}, {
    rootFolder: string;
    subfolderPath: string;
    fileName: string;
}>, string>;
export declare const listSubfoldersTool: import("@openai/agents").FunctionTool<unknown, z.ZodObject<{
    rootFolder: z.ZodString;
}, "strip", z.ZodTypeAny, {
    rootFolder: string;
}, {
    rootFolder: string;
}>, string>;
export declare const oneDriveTools: import("@openai/agents").FunctionTool<unknown, z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>, string>[];
//# sourceMappingURL=oneDriveTools.d.ts.map