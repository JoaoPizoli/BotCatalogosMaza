import { setDefaultOpenAIKey } from "@openai/agents";

setDefaultOpenAIKey(process.env.OPENAI_API_KEY!);

/**
 * Configuração do OneDrive
 */
export const oneDriveConfig = {

    siteHostname: "cloudmaza-my.sharepoint.com",

    personalPath: "/personal/caio_constantino_maza_com_br",

    driveId: "",

    rootFolders: [
        {
            name: "Embalagens",
            path: "Área de Trabalho/Maza/19. Area Representantes/1. Embalagens",
            id: "", 
        },
        {
            name: "Produtos",
            path: "Área de Trabalho/Maza/19. Area Representantes/2. Produtos",
            id: "",
        },
        {
            name: "Treinamento Sistemas",
            path: "Área de Trabalho/Maza/19. Area Representantes/6. Treinamento Sistemas",
            id: "",
        },
        {
            name: "Catálogo Digitais",
            path: "Área de Trabalho/Maza/19. Area Representantes/7. Catálogo Digitais",
            id: "",
        },
    ],
};

export type RootFolder = (typeof oneDriveConfig.rootFolders)[number];
