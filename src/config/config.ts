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

// ─── Sessão & Auth ───────────────────────────────────────────────────────────

export const SESSION_TIMEOUT_MS = parseInt(
    process.env.SESSION_TIMEOUT_MS ?? String(10 * 60 * 1000),
    10,
);

export const AUTH_TTL_MS = parseInt(
    process.env.AUTH_TTL_MS ?? String(30 * 24 * 60 * 60 * 1000),
    10,
);

export const MAX_MESSAGES_PER_MINUTE = parseInt(
    process.env.MAX_MESSAGES_PER_MINUTE ?? '20',
    10,
);

// ─── Cache de Produtos ──────────────────────────────────────────────────────

export const PRODUCT_CACHE_TTL_HOURS = parseInt(
    process.env.PRODUCT_CACHE_TTL_HOURS ?? '24',
    10,
);

// ─── Desconto Máximo por UF ─────────────────────────────────────────────────

export const MAX_DISCOUNT_BY_STATE: Record<string, number> = {
    AC: 45, AL: 45, AP: 45, AM: 45, BA: 45, CE: 45, DF: 42, ES: 33,
    GO: 42, MA: 45, MT: 42, MS: 42, MG: 33, PA: 45, PB: 45, PR: 39,
    PE: 45, PI: 45, RJ: 33, RN: 45, RS: 39, RO: 45, RR: 45, SC: 39,
    SP: 33, SE: 45, TO: 45,
};

export const DEFAULT_MAX_DISCOUNT = 33;

export function getMaxDiscount(uf: string): number {
    const normalized = uf.trim().toUpperCase();
    return MAX_DISCOUNT_BY_STATE[normalized] ?? DEFAULT_MAX_DISCOUNT;
}
