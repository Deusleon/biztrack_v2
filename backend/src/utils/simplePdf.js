// Report PDF used by notification emails. Same navy header, table and footer
// as the reports exported from the app.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const NAVY = [30, 58, 95];
const WHITE = [255, 255, 255];
const VALUE = [31, 41, 55];
const LABEL = [107, 114, 128];
const LINE = [229, 231, 235];
const ZEBRA = [250, 251, 252];

// The built-in PDF font only draws Latin-1. Anything else would print as garbage ("→" became "!'"),
// so common symbols are swapped for plain ones and the rest is replaced with "?".
const SWAPS = { '→': 'to', '←': 'from', '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '•': '-', '×': 'x' };
export const pdfSafe = (value) => String(value ?? '')
  .replace(/[→←—–’‘“”…•×]/g, (ch) => SWAPS[ch])
  .replace(/[^\u0009\u000A\u0020-\u007E\u00A0-\u00FF]/g, '?');

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Africa/Dar_es_Salaam';

function generatedOn() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

// Alignment rules for every table PDF: quantities left, money right, text left.
// The heading is aligned exactly like its values.
const ALIGN = { qty: 'left', money: 'right', text: 'left', index: 'left' };

/**
 * @param {{ title: string, subtitle?: string, businessName?: string, address?: string, phone?: string, email?: string,
 *   columns: { key: string, label: string, type?: 'text'|'qty'|'money' }[], rows: object[],
 *   totals?: Record<string,string>, index?: boolean }} doc
 *   columns[].type decides alignment. totals is keyed like a row; its first text column gets the label "Total".
 * @returns {Buffer}
 */
export function buildTablePdf({
  title,
  subtitle = '',
  businessName = 'BizTrack',
  address = '',
  phone = '',
  email = '',
  columns: inputColumns,
  rows: inputRows,
  totals = null,
  index = true,
}) {
  const columns = index
    ? [{ key: '__no', label: '#', type: 'index' }, ...inputColumns]
    : inputColumns;
  const rows = inputRows.map((row, i) => ({
    __no: String(i + 1),
    ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, pdfSafe(v)])),
  }));
  title = pdfSafe(title);
  subtitle = pdfSafe(subtitle);
  const alignOf = (col) => ALIGN[col.type || (col.halign === 'right' ? 'money' : 'text')] || 'left';
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 9;
  const store = businessName || 'BizTrack';

  doc.setProperties({
    title,
    subject: `${title} - ${store}`,
    author: store,
  });

  const drawHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setFillColor(...WHITE);
    doc.triangle(0, 0, 9, 0, 0, 20, 'F');

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(store, margin, 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const contacts = [address, phone ? `Phone: ${phone}` : '', email ? `Email: ${email}` : ''].filter(Boolean);
    let y = 14;
    contacts.slice(0, 2).forEach((line) => {
      doc.text(String(line).slice(0, 70), margin, y);
      y += 4;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(String(title).toUpperCase(), pageWidth - margin, 8, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    if (subtitle) doc.text(String(subtitle), pageWidth - margin, 13, { align: 'right' });
    doc.text(`Generated: ${generatedOn()}`, pageWidth - margin, subtitle ? 17.5 : 13, { align: 'right' });
  };

  drawHeader();

  autoTable(doc, {
    startY: 32,
    head: [columns.map((col) => ({ content: col.label, styles: { halign: alignOf(col) } }))],
    body: rows.map((row) => columns.map((col) => row[col.key] ?? '')),
    foot: totals
      ? [columns.map((col, i) => {
          const firstText = columns.findIndex((c) => (c.type || 'text') === 'text');
          const content = i === firstText ? 'Total' : (totals[col.key] ?? '');
          return { content, styles: { halign: alignOf(col) } };
        })]
      : undefined,
    showFoot: 'lastPage',
    footStyles: { fillColor: [238, 242, 247], textColor: NAVY, fontStyle: 'bold', fontSize: 9 },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      overflow: 'linebreak',
      cellPadding: { top: 1.4, right: 1.6, bottom: 1.4, left: 1.6 },
      textColor: VALUE,
      lineColor: LINE,
      lineWidth: 0.15,
      valign: 'middle',
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 1.6, right: 1.6, bottom: 1.6, left: 1.6 },
    },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles: Object.fromEntries(columns.map((col, i) => [i, {
      halign: alignOf(col),
      ...(col.type === 'index' ? { cellWidth: 11 } : {}),
    }])),
    margin: { top: 16, right: margin, bottom: 16, left: margin },
    showHead: 'everyPage',
  });

  const pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    const footerY = pageHeight - 12;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY, pageWidth - margin, footerY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...LABEL);
    doc.text(`${store}`, margin, footerY + 5);
    doc.text('Powered by BizTrack', pageWidth / 2, footerY + 5, { align: 'center' });
    doc.text(`Page ${page} / ${pages}`, pageWidth - margin, footerY + 5, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
