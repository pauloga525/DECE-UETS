import PDFDocument = require('pdfkit');

/** Colores del sistema DECE para los PDF de reportes. */
export const PDF_COLORS = {
  GREEN: '#1f6f5c',
  INK: '#141a17',
  SOFT: '#5b665f',
  LINE: '#e2e5e1',
  RED: '#a33a2c',
  AMBER: '#8a5a00',
};

export type PdfCol = { title: string; w: number; align?: 'left' | 'center' };
export type PdfRow = { cells: string[]; colors?: (string | undefined)[] };

/**
 * Esqueleto común de los PDF de reportes (A4 apaisado): encabezado verde, indicadores, secciones,
 * tablas que repiten su encabezado al saltar de página y pie con numeración. Las columnas se
 * definen como fracción del ancho útil (`w` en 0–1).
 */
export function createPdfReport(title: string, subtitle: string[], footer: string) {
  const { GREEN, INK, SOFT, LINE } = PDF_COLORS;
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 36,
    bufferPages: true,
    info: { Title: title, Author: 'Sistema DECE · UETS' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 14;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };

  doc.rect(L, 36, W, 58).fill(GREEN);
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16).text(title, L + 14, 46);
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .text(['Unidad Educativa Técnico Salesiano · DECE', ...subtitle.filter(Boolean)].join('   ·   '), L + 14, 70, {
      width: W - 28,
    });
  doc.y = 108;

  return {
    doc,
    kpis(items: [label: string, value: string | number, color?: string][]) {
      const kw = (W - (items.length - 1) * 8) / items.length;
      const ky = doc.y;
      items.forEach(([label, value, color], i) => {
        const x = L + i * (kw + 8);
        doc.roundedRect(x, ky, kw, 46, 4).strokeColor(LINE).lineWidth(1).stroke();
        doc.fill(SOFT).font('Helvetica').fontSize(8.5).text(label, x + 10, ky + 8, { width: kw - 20 });
        doc.fill(color ?? INK).font('Helvetica-Bold').fontSize(17).text(String(value), x + 10, ky + 20, { width: kw - 20 });
      });
      doc.y = ky + 62;
    },
    section(text: string, color = GREEN) {
      ensure(80);
      doc.fill(color).font('Helvetica-Bold').fontSize(11.5).text(text, L, doc.y);
      doc.y += 4;
    },
    space(h: number) {
      ensure(130);
      doc.y += h;
    },
    table(cols: PdfCol[], rows: PdfRow[]) {
      const widths = cols.map((c) => c.w * W);
      const header = () => {
        ensure(60);
        const y = doc.y;
        let x = L;
        // Alto según el título más largo (algunos ocupan dos líneas).
        doc.font('Helvetica-Bold').fontSize(8);
        const hh = Math.max(18, ...cols.map((c, i) => doc.heightOfString(c.title.toUpperCase(), { width: widths[i] - 10 }) + 10));
        doc.rect(L, y, W, hh).fill('#e4efec');
        cols.forEach((c, i) => {
          doc.fill('#123f34').font('Helvetica-Bold').fontSize(8).text(c.title.toUpperCase(), x + 5, y + 5, { width: widths[i] - 10, align: c.align ?? 'left' });
          x += widths[i];
        });
        doc.y = y + hh;
      };
      header();
      for (const row of rows) {
        doc.font('Helvetica').fontSize(8.5);
        const h = Math.max(...row.cells.map((t, i) => doc.heightOfString(t || '—', { width: widths[i] - 10 }))) + 8;
        if (doc.y + h > bottom()) {
          doc.addPage();
          header();
        }
        const y = doc.y;
        let x = L;
        row.cells.forEach((t, i) => {
          doc
            .fill(row.colors?.[i] ?? INK)
            .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8.5)
            .text(t || '—', x + 5, y + 4, { width: widths[i] - 10, align: cols[i].align ?? 'left' });
          x += widths[i];
        });
        doc.y = y + h;
        doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor(LINE).lineWidth(0.6).stroke();
      }
      doc.y += 10;
    },
    /** Pie con numeración y cierre del documento. */
    end(): Promise<Buffer> {
      const pages = doc.bufferedPageRange();
      for (let i = pages.start; i < pages.start + pages.count; i++) {
        doc.switchToPage(i);
        // Se escribe dentro del margen inferior: sin bajarlo a 0, pdfkit agregaría una página nueva.
        const marginBottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        const y = doc.page.height - marginBottom + 6;
        doc.fill(SOFT).font('Helvetica').fontSize(7.5);
        doc.text(footer, L, y, { width: W / 2, lineBreak: false });
        doc.text(`Página ${i + 1} de ${pages.count}`, L + W / 2, y, { width: W / 2, align: 'right', lineBreak: false });
        doc.page.margins.bottom = marginBottom;
      }
      doc.end();
      return done;
    },
  };
}

/** Rango de fechas legible para el subtítulo del PDF. */
export const dateRangeLabel = (from?: string, to?: string) =>
  from || to ? `${from ?? '…'} a ${to ?? '…'}` : 'Todas las fechas';
