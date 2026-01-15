/**
 * Script de teste para verificar as pastas e download do OneDrive
 * Execute com: npx tsx src/testOneDrive.ts
 */

import { init, getRootFolderNames, getSubfolders, getFilesInSubfolder, downloadFile, listContents } from "./services/OneDrive/oneDriveIndexer";

async function main() {
    console.log("=== Teste OneDrive ===\n");

    // 1. Inicializa
    await init();

    // 2. Lista pastas raiz
    console.log("\n📁 Pastas Mãe Disponíveis:");
    const rootFolders = getRootFolderNames();
    rootFolders.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));

    if (rootFolders.length === 0) {
        console.log("❌ Nenhuma pasta raiz encontrada!");
        return;
    }

    // 3. Escolhe primeira pasta mãe
    const primeiraPasta = rootFolders[0];
    console.log(`\n📂 Entrando em "${primeiraPasta}"...`);

    const { folders: subpastas, files: arquivosDiretos } = await listContents(primeiraPasta);
    console.log(`   Subpastas: ${subpastas.length}`);
    console.log(`   Arquivos: ${arquivosDiretos.length}`);

    // 4. Se tem arquivos diretos, baixa o primeiro
    if (arquivosDiretos.length > 0) {
        console.log(`\n⬇️ Baixando arquivo direto: "${arquivosDiretos[0]}"...`);
        const items = await listContents(primeiraPasta);
        // Precisamos navegar até a pasta para baixar
        // Como está na raiz, usamos um path vazio especial
    }

    // 5. Se tem subpastas, entra na primeira e lista
    if (subpastas.length > 0) {
        const primeiraSubpasta = subpastas[0];
        console.log(`\n📂 Entrando em subpasta: "${primeiraSubpasta}"...`);

        const arquivos = await getFilesInSubfolder(primeiraPasta, primeiraSubpasta);
        console.log(`   Arquivos encontrados: ${arquivos.length}`);
        arquivos.slice(0, 5).forEach((name) => console.log(`   - ${name}`));

        // 6. Baixa primeiro arquivo
        if (arquivos.length > 0) {
            const primeiroArquivo = arquivos[0];
            console.log(`\n⬇️ Baixando: "${primeiroArquivo}"...`);

            const localPath = await downloadFile(primeiraPasta, primeiraSubpasta, primeiroArquivo);
            console.log(`✅ Arquivo baixado em: ${localPath}`);
        } else {
            console.log("   Nenhum arquivo na subpasta, verificando subpastas aninhadas...");

            const { folders: subSubpastas } = await listContents(primeiraPasta, primeiraSubpasta);
            if (subSubpastas.length > 0) {
                const caminhoAninhado = `${primeiraSubpasta}/${subSubpastas[0]}`;
                console.log(`\n📂 Entrando em: "${caminhoAninhado}"...`);

                const arquivosAninhados = await getFilesInSubfolder(primeiraPasta, caminhoAninhado);
                console.log(`   Arquivos: ${arquivosAninhados.length}`);

                if (arquivosAninhados.length > 0) {
                    const localPath = await downloadFile(primeiraPasta, caminhoAninhado, arquivosAninhados[0]);
                    console.log(`✅ Arquivo baixado em: ${localPath}`);
                }
            }
        }
    }

    console.log("\n✅ Teste concluído!");
}

main().catch(console.error);
