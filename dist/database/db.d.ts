export declare function setupDatabase(): Promise<void>;
export declare function salvarEnquete(msgId: string, messageJson: any): Promise<void>;
export declare function buscarEnquete(msgId: string): Promise<any>;
export declare function criarUsuario(jsId: string): Promise<void | null>;
export declare function getEstadoUsuario(jsId: string): Promise<any>;
export declare function updateUsuario(jsId: string, estado: string): Promise<void | null>;
//# sourceMappingURL=db.d.ts.map