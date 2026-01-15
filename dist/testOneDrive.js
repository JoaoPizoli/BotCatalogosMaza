"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const oneDriveIndexer_1 = require("./services/OneDrive/oneDriveIndexer");
async function main() {
    console.log("=== Teste OneDrive ===\n");
    await (0, oneDriveIndexer_1.init)();
    console.log("\n📁 Pastas Mãe Disponíveis:");
    const rootFolders = (0, oneDriveIndexer_1.getRootFolderNames)();
    rootFolders.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
    if (rootFolders.length === 0) {
        console.log("❌ Nenhuma pasta raiz encontrada!");
        return;
    }
    const primeiraPasta = rootFolders[0];
    console.log(`\n📂 Entrando em "${primeiraPasta}"...`);
    const { folders: subpastas, files: arquivosDiretos } = await (0, oneDriveIndexer_1.listContents)(primeiraPasta);
    console.log(`   Subpastas: ${subpastas.length}`);
    console.log(`   Arquivos: ${arquivosDiretos.length}`);
    if (arquivosDiretos.length > 0) {
        console.log(`\n⬇️ Baixando arquivo direto: "${arquivosDiretos[0]}"...`);
        const items = await (0, oneDriveIndexer_1.listContents)(primeiraPasta);
    }
    if (subpastas.length > 0) {
        const primeiraSubpasta = subpastas[0];
        console.log(`\n📂 Entrando em subpasta: "${primeiraSubpasta}"...`);
        const arquivos = await (0, oneDriveIndexer_1.getFilesInSubfolder)(primeiraPasta, primeiraSubpasta);
        console.log(`   Arquivos encontrados: ${arquivos.length}`);
        arquivos.slice(0, 5).forEach((name) => console.log(`   - ${name}`));
        if (arquivos.length > 0) {
            const primeiroArquivo = arquivos[0];
            console.log(`\n⬇️ Baixando: "${primeiroArquivo}"...`);
            const localPath = await (0, oneDriveIndexer_1.downloadFile)(primeiraPasta, primeiraSubpasta, primeiroArquivo);
            console.log(`✅ Arquivo baixado em: ${localPath}`);
        }
        else {
            console.log("   Nenhum arquivo na subpasta, verificando subpastas aninhadas...");
            const { folders: subSubpastas } = await (0, oneDriveIndexer_1.listContents)(primeiraPasta, primeiraSubpasta);
            if (subSubpastas.length > 0) {
                const caminhoAninhado = `${primeiraSubpasta}/${subSubpastas[0]}`;
                console.log(`\n📂 Entrando em: "${caminhoAninhado}"...`);
                const arquivosAninhados = await (0, oneDriveIndexer_1.getFilesInSubfolder)(primeiraPasta, caminhoAninhado);
                console.log(`   Arquivos: ${arquivosAninhados.length}`);
                if (arquivosAninhados.length > 0) {
                    const localPath = await (0, oneDriveIndexer_1.downloadFile)(primeiraPasta, caminhoAninhado, arquivosAninhados[0]);
                    console.log(`✅ Arquivo baixado em: ${localPath}`);
                }
            }
        }
    }
    console.log("\n✅ Teste concluído!");
}
main().catch(console.error);
//# sourceMappingURL=testOneDrive.js.map