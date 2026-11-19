// A small PDF table writer. Uses the standard Courier and Helvetica fonts
// so the file needs no embedded font, and columns stay aligned.

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 40;
const LINE = 12;

function pdfText(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function clip(value, width) {
  const text = String(value ?? '');
  return text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…`.replace('…', '.') : text;
}

function pad(value, width) {
  const text = clip(value, width);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/**
 * @param {{ title: string, subtitle?: string, columns: { key: string, label: string, width: number }[], rows: object[] }} doc
 * @returns {Buffer}
 */
export function buildTablePdf({ title, subtitle = '', columns, rows }) {
  const header = columns.map((col) => pad(col.label, col.width)).join('  ');
  const body = rows.map((row) => columns.map((col) => pad(row[col.key], col.width)).join('  '));
  const firstLines = 6;
  const perPage = Math.floor((PAGE_H - MARGIN * 2 - firstLines * LINE) / LINE);
  const pages = [];
  if (body.length === 0) pages.push([]);
  for (let i = 0; i < body.length; i += perPage) pages.push(body.slice(i, i + perPage));

  const streams = pages.map((lines, index) => {
    const commands = [
      'BT',
      '/F1 14 Tf',
      `${MARGIN} ${PAGE_H - MARGIN - 14} Td`,
      `(${pdfText(title)}) Tj`,
      '/F1 10 Tf',
      `0 -18 Td`,
      `(${pdfText(subtitle)}) Tj`,
      `0 -16 Td`,
      `(${pdfText(index > 0 ? `Page ${index + 1} of ${pages.length}` : '')}) Tj`,
      '/F2 9 Tf',
      '0 -20 Td',
      `(${pdfText(header)}) Tj`,
      '0 -8 Td',
      `(${pdfText('-'.repeat(Math.min(header.length, 96)))}) Tj`,
    ];
    lines.forEach((line) => {
      commands.push('0 -12 Td');
      commands.push(`(${pdfText(line)}) Tj`);
    });
    commands.push('ET');
    return commands.join('\n');
  });

  return assemblePdf(streams);
}

function assemblePdf(streams) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const fontMono = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const pageIds = [];
  streams.forEach((stream) => {
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent PAGES 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
      + `/Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontBold} 0 R /F2 ${fontMono} 0 R >> >> >>`,
    );
    pageIds.push(pageId);
  });
  const pagesId = add(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    const id = index + 1;
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${body.replace('Parent PAGES 0 R', `Parent ${pagesId} 0 R`)}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let id = 1; id <= objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
