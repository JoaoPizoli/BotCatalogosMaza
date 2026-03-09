/**
 * pdfGenerator.ts
 *
 * Gera o PDF do orçamento a partir dos dados calculados pelo agente.
 */

import PDFDocument from 'pdfkit';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface QuoteItem {
    productCode: string;
    productName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    appliedDiscount: number;
    subtotal: number;
}

export interface QuoteData {
    representanteName?: string;
    clientState: string;
    items: QuoteItem[];
    totalWithoutDiscount: number;
    totalWithDiscount: number;
    totalSavings: number;
    warnings?: string[];
    date?: Date;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MARGIN = 50;
const FONT_SIZE_TITLE = 18;
const FONT_SIZE_SUBTITLE = 12;
const FONT_SIZE_BODY = 10;
const FONT_SIZE_SMALL = 8;

const COL_WIDTHS = {
    item: 30,
    product: 160,
    unit: 35,
    qty: 40,
    price: 70,
    discount: 55,
    subtotal: 75,
};

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Gera um PDF do orçamento e retorna como Buffer.
 */
export function generateQuotePDF(data: QuoteData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const quoteDate = data.date ?? new Date();

        // ── Cabeçalho ─────────────────────────────────────────────────────
        doc.fontSize(FONT_SIZE_TITLE).text('ORÇAMENTO', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(FONT_SIZE_SUBTITLE);
        doc.text(`Data: ${formatDate(quoteDate)}`, { align: 'right' });

        if (data.representanteName) {
            doc.text(`Representante: ${data.representanteName}`);
        }
        doc.text(`Estado do Cliente: ${data.clientState.toUpperCase()}`);
        doc.moveDown(1);

        // ── Cabeçalho da tabela ───────────────────────────────────────────
        const tableTop = doc.y;
        const headerY = tableTop;

        doc.fontSize(FONT_SIZE_SMALL).font('Helvetica-Bold');

        let x = MARGIN;
        drawCell(doc, '#', x, headerY, COL_WIDTHS.item);
        x += COL_WIDTHS.item;
        drawCell(doc, 'Produto', x, headerY, COL_WIDTHS.product);
        x += COL_WIDTHS.product;
        drawCell(doc, 'Un.', x, headerY, COL_WIDTHS.unit);
        x += COL_WIDTHS.unit;
        drawCell(doc, 'Qtd', x, headerY, COL_WIDTHS.qty);
        x += COL_WIDTHS.qty;
        drawCell(doc, 'Preço Un.', x, headerY, COL_WIDTHS.price);
        x += COL_WIDTHS.price;
        drawCell(doc, 'Desc.%', x, headerY, COL_WIDTHS.discount);
        x += COL_WIDTHS.discount;
        drawCell(doc, 'Subtotal', x, headerY, COL_WIDTHS.subtotal);

        // Linha separadora
        const lineY = headerY + 15;
        doc.moveTo(MARGIN, lineY)
            .lineTo(MARGIN + 465, lineY)
            .stroke();

        // ── Itens ─────────────────────────────────────────────────────────
        doc.font('Helvetica').fontSize(FONT_SIZE_BODY);
        let rowY = lineY + 5;

        for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i]!;

            if (rowY > 720) {
                doc.addPage();
                rowY = MARGIN;
            }

            x = MARGIN;
            drawCell(doc, String(i + 1), x, rowY, COL_WIDTHS.item);
            x += COL_WIDTHS.item;
            drawCell(doc, truncate(item.productName, 30), x, rowY, COL_WIDTHS.product);
            x += COL_WIDTHS.product;
            drawCell(doc, item.unit, x, rowY, COL_WIDTHS.unit);
            x += COL_WIDTHS.unit;
            drawCell(doc, String(item.quantity), x, rowY, COL_WIDTHS.qty);
            x += COL_WIDTHS.qty;
            drawCell(doc, formatCurrency(item.unitPrice), x, rowY, COL_WIDTHS.price);
            x += COL_WIDTHS.price;
            drawCell(doc, `${item.appliedDiscount}%`, x, rowY, COL_WIDTHS.discount);
            x += COL_WIDTHS.discount;
            drawCell(doc, formatCurrency(item.subtotal), x, rowY, COL_WIDTHS.subtotal);

            rowY += 18;
        }

        // Linha separadora final
        rowY += 5;
        doc.moveTo(MARGIN, rowY)
            .lineTo(MARGIN + 465, rowY)
            .stroke();

        // ── Totais ────────────────────────────────────────────────────────
        rowY += 10;
        doc.fontSize(FONT_SIZE_BODY).font('Helvetica');

        doc.text(`Total sem desconto: ${formatCurrency(data.totalWithoutDiscount)}`, MARGIN + 280, rowY, { width: 200, align: 'right' });
        rowY += 16;
        doc.text(`Economia: -${formatCurrency(data.totalSavings)}`, MARGIN + 280, rowY, { width: 200, align: 'right' });
        rowY += 16;

        doc.font('Helvetica-Bold').fontSize(FONT_SIZE_SUBTITLE);
        doc.text(`TOTAL: ${formatCurrency(data.totalWithDiscount)}`, MARGIN + 280, rowY, { width: 200, align: 'right' });

        // ── Avisos ────────────────────────────────────────────────────────
        if (data.warnings && data.warnings.length > 0) {
            rowY += 30;
            doc.font('Helvetica').fontSize(FONT_SIZE_SMALL);
            doc.text('Observações:', MARGIN, rowY);
            rowY += 12;
            for (const warning of data.warnings) {
                doc.text(`• ${warning}`, MARGIN + 10, rowY);
                rowY += 12;
            }
        }

        doc.end();
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function drawCell(doc: PDFKit.PDFDocument, text: string, x: number, y: number, _width: number): void {
    doc.text(text, x, y, { width: _width, lineBreak: false });
}

function formatCurrency(value: number): string {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function truncate(text: string, max: number): string {
    return text.length > max ? text.slice(0, max - 3) + '...' : text;
}
