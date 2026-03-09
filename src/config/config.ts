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
    AC: 10, AL: 10, AP: 10, AM: 10, BA: 12, CE: 12, DF: 15, ES: 12,
    GO: 12, MA: 10, MT: 10, MS: 10, MG: 15, PA: 10, PB: 10, PR: 15,
    PE: 12, PI: 10, RJ: 15, RN: 10, RS: 15, RO: 10, RR: 10, SC: 15,
    SP: 15, SE: 10, TO: 10,
};

export const DEFAULT_MAX_DISCOUNT = 10;

export function getMaxDiscount(uf: string): number {
    const normalized = uf.trim().toUpperCase();
    return MAX_DISCOUNT_BY_STATE[normalized] ?? DEFAULT_MAX_DISCOUNT;
}
