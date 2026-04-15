/**
 * orcamentoTools.ts
 *
 * Tools disponíveis para o agente de orçamentos.
 * Cada tool é uma função que o agente pode chamar durante a conversa.
 */

import { tool } from '@openai/agents';
import { z } from 'zod';
import { searchProducts, ensureCacheFresh, searchProductsInERP } from '../../services/productCache';
import { getMaxDiscount } from '../../config/config';
import { generateQuotePDF, generateDiscountSummary, QuoteData } from '../../services/pdfGenerator';
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

// Cache de PDFs gerados por sessão (mesmo padrão de oneDriveTools)
const pendingPDFs = new Map<string, { path: string; name: string }>();
const pendingDiscountSummaries = new Map<string, string>();
let currentOrcamentoSession: string | null = null;

export function setOrcamentoSession(sessionId: string) {
    currentOrcamentoSession = sessionId;
}

export function getAndClearPendingPDF(sessionId: string): { path: string; name: string } | null {
    const pdf = pendingPDFs.get(sessionId);
    if (pdf) {
        pendingPDFs.delete(sessionId);
        return pdf;
    }
    return null;
}

export function getAndClearPendingDiscountSummary(sessionId: string): string | null {
    const summary = pendingDiscountSummaries.get(sessionId);
    if (summary) {
        pendingDiscountSummaries.delete(sessionId);
        return summary;
    }
    return null;
}

// ─── Tool: Buscar Produtos ───────────────────────────────────────────────────

export const searchProductsTool = tool({
    name: 'search_products',
    description:
        'Busca produtos no catálogo por nome, código ou descrição. ' +
        'Retorna uma lista de até 5 produtos encontrados. ' +
        'Analise os resultados comparando com o que o representante pediu e decida qual produto usar ou se deve apresentar opções ao representante.',
    parameters: z.object({
        query: z.string().describe('Termos de busca (nome, código ou parte do nome do produto)'),
    }),
    async execute({ query }) {
        console.log(`[Tool:search_products] Buscando "${query}"...`);
        await ensureCacheFresh();

        const cacheResult = searchProducts(query);
        let scoredResults = cacheResult.scoredProducts;
        let source = 'cache';

        // Busca no ERP se: cache vazio, ou score fraco (menos da metade dos termos matched)
        const isWeakMatch = cacheResult.totalTerms > 0 && cacheResult.maxScore < Math.ceil(cacheResult.totalTerms / 2);
        if (scoredResults.length === 0 || isWeakMatch) {
            console.log(`[Tool:search_products] Cache ${scoredResults.length === 0 ? 'vazio' : 'com resultado fraco (score ' + cacheResult.maxScore + '/' + cacheResult.totalTerms + ')'}. Buscando no ERP...`);
            const erpResults = await searchProductsInERP(query);
            if (erpResults.length > 0) {
                // ERP results don't have scores, assign max score to all
                scoredResults = erpResults.map((p) => ({ product: p, score: cacheResult.totalTerms }));
                source = 'erp';
            }
        }

        console.log(`[Tool:search_products] ${scoredResults.length} resultados encontrados (${source})`);

        // Debug: mostrar top 10 resultados com scores
        const debugTop = scoredResults.slice(0, 10);
        for (let i = 0; i < debugTop.length; i++) {
            const s = debugTop[i];
            const combined = (s as { combinedScore?: number }).combinedScore ?? 'N/A';
            console.log(`[Tool:search_products] #${i + 1} score=${s.score} combined=${combined} | ${s.product.code} - ${s.product.name}`);
        }

        if (scoredResults.length === 0) {
            return JSON.stringify({
                found: 0,
                query,
                message: 'Nenhum produto encontrado para essa busca.',
                products: [],
            });
        }

        const limited = scoredResults.slice(0, 5);

        return JSON.stringify({
            found: limited.length,
            totalMatches: scoredResults.length,
            source,
            query,
            products: limited.map((s) => ({
                code: s.product.code,
                name: `${s.product.code} - ${s.product.name}`,
                description: s.product.description,
                unit: s.product.unit,
                price: s.product.price,
            })),
        });
    },
});

// ─── Tool: Desconto Máximo por UF ────────────────────────────────────────────

export const getMaxDiscountTool = tool({
    name: 'get_max_discount',
    description:
        'Retorna a porcentagem máxima de desconto permitida para um estado (UF) do cliente.',
    parameters: z.object({
        uf: z.string().describe('Sigla do estado (UF) do cliente, ex: SP, RJ, MG'),
    }),
    execute({ uf }) {
        console.log(`[Tool:get_max_discount] UF: ${uf}`);
        const maxDiscount = getMaxDiscount(uf);
        console.log(`[Tool:get_max_discount] Desconto máximo para ${uf.toUpperCase()}: ${maxDiscount}%`);
        return JSON.stringify({
            uf: uf.trim().toUpperCase(),
            maxDiscountPercent: maxDiscount,
        });
    },
});

// ─── Tool: Calcular Orçamento ────────────────────────────────────────────────

const quoteItemSchema = z.object({
    productCode: z.string().describe('Código do produto'),
    productName: z.string().describe('Nome do produto (retornado pelo search_products)'),
    unitPrice: z.number().positive().describe('Preço unitário do produto (retornado pelo search_products)'),
    quantity: z.number().positive().describe('Quantidade do produto'),
    discountPercent: z.number().min(0).max(100).describe('Porcentagem de desconto solicitada para este item'),
});

export const calculateQuoteTool = tool({
    name: 'calculate_quote',
    description:
        'Calcula o orçamento completo com itens, descontos e totais. ' +
        'Cada item DEVE incluir productCode, productName, unitPrice (do search_products), quantity e discountPercent. ' +
        'Valida se cada desconto está dentro do máximo permitido para a UF do cliente. ' +
        'Se algum desconto exceder o máximo, ajusta automaticamente e avisa.',
    parameters: z.object({
        uf: z.string().describe('Sigla do estado (UF) do cliente'),
        items: z.array(quoteItemSchema).min(1).describe('Lista de itens do orçamento com preço unitário incluso'),
        withCD: z.boolean().default(false).describe('Se true, aplica desconto de Condição de Pagamento (CD) de 2% sobre o total do pedido'),
    }),
    async execute({ uf, items, withCD }) {
        console.log(`[Tool:calculate_quote] UF: ${uf}, ${items.length} item(ns)`);

        const maxDiscount = getMaxDiscount(uf);
        const warnings: string[] = [];
        const quoteItems: Array<{
            productCode: string;
            productName: string;
            unit: string;
            quantity: number;
            unitPrice: number;
            requestedDiscount: number;
            appliedDiscount: number;
            subtotal: number;
        }> = [];

        for (const item of items) {
            console.log(`[Tool:calculate_quote] Item: ${item.productCode} | ${item.productName} | Preço: ${item.unitPrice} | Qtd: ${item.quantity} | Desc: ${item.discountPercent}%`);

            let appliedDiscount = item.discountPercent;
            if (appliedDiscount > maxDiscount) {
                warnings.push(
                    `Desconto de ${item.discountPercent}% para "${item.productName}" excede o máximo de ${maxDiscount}% para ${uf.toUpperCase()}. Ajustado para ${maxDiscount}%.`,
                );
                appliedDiscount = maxDiscount;
            }

            const discountedPrice = item.unitPrice * (1 - appliedDiscount / 100);
            const subtotal = discountedPrice * item.quantity;

            quoteItems.push({
                productCode: item.productCode,
                productName: item.productName,
                unit: 'UN',
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                requestedDiscount: item.discountPercent,
                appliedDiscount,
                subtotal: Math.round(subtotal * 100) / 100,
            });
        }

        const total = quoteItems.reduce((sum, item) => sum + item.subtotal, 0);
        const totalWithoutDiscount = quoteItems.reduce(
            (sum, item) => sum + item.unitPrice * item.quantity,
            0,
        );

        const result: Record<string, unknown> = {
            uf: uf.toUpperCase(),
            maxDiscountAllowed: maxDiscount,
            items: quoteItems,
            totalWithoutDiscount: Math.round(totalWithoutDiscount * 100) / 100,
            totalWithDiscount: Math.round(total * 100) / 100,
            totalSavings: Math.round((totalWithoutDiscount - total) * 100) / 100,
            warnings,
            withCD: false,
        };

        if (withCD) {
            const cdDiscountValue = Math.round(total * 0.02 * 100) / 100;
            const totalWithCD = Math.round(total * 0.98 * 100) / 100;
            result.withCD = true;
            result.cdDiscountValue = cdDiscountValue;
            result.totalWithCD = totalWithCD;
        }

        return JSON.stringify(result);
    },
});

// ─── Tool: Confirmar Orçamento e Gerar PDF ──────────────────────────────────────

const confirmQuoteItemSchema = z.object({
    productCode: z.string(),
    productName: z.string(),
    unit: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    appliedDiscount: z.number(),
    subtotal: z.number(),
});

export const confirmQuoteTool = tool({
    name: 'confirm_quote',
    description:
        'Confirma o orçamento e gera o PDF. Chame esta tool SOMENTE quando o representante confirmar o orçamento (ex: "sim", "confirmar", "ok"). ' +
        'Passe todos os dados do orçamento calculado anteriormente.',
    parameters: z.object({
        uf: z.string().describe('UF do cliente'),
        items: z.array(confirmQuoteItemSchema).min(1).describe('Itens do orçamento (do resultado de calculate_quote)'),
        totalWithoutDiscount: z.number(),
        totalWithDiscount: z.number(),
        totalSavings: z.number(),
        warnings: z.array(z.string()).default([]),
        withCD: z.boolean().default(false).describe('Se true, indica que o desconto de Condição de Pagamento (CD) de 2% foi aplicado'),
        cdDiscountValue: z.number().default(0).describe('Valor do desconto de CD aplicado sobre o total'),
        totalWithCD: z.number().default(0).describe('Total final após desconto de CD'),
    }),
    async execute({ uf, items, totalWithoutDiscount, totalWithDiscount, totalSavings, warnings, withCD, cdDiscountValue, totalWithCD }) {
        console.log(`[Tool:confirm_quote] Gerando PDF do orçamento...`);

        try {
            const quoteData: QuoteData = {
                clientState: uf,
                items,
                totalWithoutDiscount,
                totalWithDiscount,
                totalSavings,
                warnings: warnings,
                withCD,
                cdDiscountValue,
                totalWithCD,
            };

            const pdfBuffer = await generateQuotePDF(quoteData);

            // Salva PDF em arquivo temporário
            const tmpDir = path.resolve(__dirname, '../../../tmp');
            await mkdir(tmpDir, { recursive: true });
            const fileName = `orcamento_${Date.now()}.pdf`;
            const filePath = path.join(tmpDir, fileName);
            await writeFile(filePath, pdfBuffer);

            console.log(`[Tool:confirm_quote] PDF gerado: ${filePath}`);

            // Armazena o PDF para o telegram.ts enviar
            if (currentOrcamentoSession) {
                pendingPDFs.set(currentOrcamentoSession, { path: filePath, name: fileName });

                // Gera resumo de desconto para o representante
                const discountSummary = generateDiscountSummary(quoteData);
                if (discountSummary) {
                    pendingDiscountSummaries.set(currentOrcamentoSession, discountSummary);
                }
            }

            return JSON.stringify({ success: true, message: 'PDF do orçamento gerado com sucesso.' });
        } catch (err) {
            console.error('[Tool:confirm_quote] Erro ao gerar PDF:', err);
            return JSON.stringify({ error: 'Erro ao gerar o PDF do orçamento. Tente novamente.' });
        }
    },
});

// ─── Export de todas as tools ─────────────────────────────────────────────────

export const orcamentoTools = [
    searchProductsTool,
    getMaxDiscountTool,
    calculateQuoteTool,
    confirmQuoteTool,
];
