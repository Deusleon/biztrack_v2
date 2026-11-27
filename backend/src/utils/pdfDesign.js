/** Which PDF letterhead the store uses. Design 1 is the original layout. */
export function pdfDesignId(value) {
  const id = String(value ?? '1').trim();
  return id === '2' || id === '3' ? id : '1';
}

const NAVY = [30, 58, 95];
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const WHITE = [255, 255, 255];

export function rgbFromHex(hex, fallback = NAVY) {
  const raw = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return fallback;
  return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
}

function tint(color, amount = 0.9) {
  const source = Array.isArray(color) && color.length >= 3 ? color : NAVY;
  return source.slice(0, 3).map((channel) => Math.round(Number(channel) + (255 - Number(channel)) * amount));
}

function asColor(primary) {
  return Array.isArray(primary) && primary.length >= 3 ? primary.slice(0, 3).map(Number) : NAVY;
}

export function tableTheme(design, primary) {
  const color = asColor(primary);
  if (design === '2') {
    return {
      styles: {
        lineColor: tint(color, 0.62),
        lineWidth: { top: 0, right: 0, bottom: 0.2, left: 0 },
        textColor: INK,
      },
      headStyles: {
        fillColor: WHITE,
        textColor: color,
        fontStyle: 'bold',
        lineColor: color,
        lineWidth: { top: 0, right: 0, bottom: 0.55, left: 0 },
      },
      alternateRowStyles: { fillColor: WHITE },
      footFill: WHITE,
      footText: color,
    };
  }
  if (design === '3') {
    return {
      styles: { lineColor: tint(color, 0.78), lineWidth: 0.15, textColor: INK },
      headStyles: { fillColor: color, textColor: WHITE, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: tint(color, 0.93) },
      footFill: tint(color, 0.84),
      footText: color,
    };
  }
  return null;
}

function oneLine(doc, text, width) {
  const lines = doc.splitTextToSize(String(text ?? ''), Math.max(12, width));
  return lines[0] || '';
}

function factItems(facts, rightLines) {
  if (Array.isArray(facts) && facts.some((fact) => fact && fact.value)) {
    return facts.filter((fact) => fact && fact.value).slice(0, 3);
  }
  return (rightLines || []).filter(Boolean).slice(0, 3).map((value) => ({ label: '', value }));
}

/** Returns the y where the body should start. Design 2 is a letter, design 3 is a dossier. */
export function paintBandHeader(doc, design, options = {}) {
  const color = asColor(options.primary);
  if (design === '3') return paintDossier(doc, { ...options, primary: color });
  return paintLetter(doc, { ...options, primary: color });
}

function paintLetter(doc, { pageWidth, margin, primary, kicker, title, businessName, contactLines, facts, rightLines }) {
  const items = factItems(facts, rightLines);
  const rightW = 62;
  const leftW = pageWidth - margin * 2 - rightW - 6;
  let y = 13;
  if (kicker) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primary);
    doc.text(String(kicker).toUpperCase(), margin, y);
    y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  const titleLines = doc.splitTextToSize(String(title || ''), leftW).slice(0, 2);
  doc.text(titleLines.length ? titleLines : [''], margin, y);
  const titleBottom = y + Math.max(titleLines.length, 1) * 6.4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...primary);
  doc.text(oneLine(doc, businessName, rightW), pageWidth - margin, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  let by = 18;
  (contactLines || []).filter(Boolean).slice(0, 3).forEach((line) => {
    doc.text(oneLine(doc, line, rightW), pageWidth - margin, by, { align: 'right' });
    by += 3.6;
  });

  y = Math.max(titleBottom, by) + 2.5;
  if (items.length) {
    const gap = 2.5;
    const w = (pageWidth - margin * 2 - gap * (items.length - 1)) / items.length;
    items.forEach((fact, index) => {
      const x = margin + index * (w + gap);
      doc.setFillColor(...tint(primary, 0.92));
      doc.rect(x, y, w, 11.5, 'F');
      doc.setFillColor(...primary);
      doc.rect(x, y, w, 0.7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...primary);
      if (fact.label) doc.text(oneLine(doc, String(fact.label).toUpperCase(), w - 4), x + 2, y + 4.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(oneLine(doc, fact.value, w - 4), x + 2, y + 8.4);
    });
    y += 14.5;
  }
  doc.setDrawColor(...primary);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  return y + 5;
}

function paintDossier(doc, { pageWidth, margin, primary, kicker, title, businessName, contactLines, facts, rightLines }) {
  const items = factItems(facts, rightLines);
  const split = Math.min(Math.max(pageWidth * 0.4, 62), 92);
  const panelH = 32;
  doc.setFillColor(...primary);
  doc.rect(0, 0, split, panelH, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  if (kicker) doc.text(oneLine(doc, String(kicker).toUpperCase(), split - 14), 8, 9);
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(String(title || ''), split - 14).slice(0, 2);
  doc.text(titleLines.length ? titleLines : [''], 8, kicker ? 17 : 14);

  const textX = split + 6;
  const textW = pageWidth - margin - textX;
  doc.setTextColor(...primary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(oneLine(doc, businessName, textW), textX, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  let cy = 17.5;
  (contactLines || []).filter(Boolean).slice(0, 3).forEach((line) => {
    doc.text(oneLine(doc, line, textW), textX, cy);
    cy += 4;
  });

  doc.setFillColor(...tint(primary, 0.9));
  doc.rect(0, panelH, pageWidth, 8.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const strip = items.map((fact) => (fact.label ? `${fact.label}: ${fact.value}` : String(fact.value))).join('     ');
  if (strip) doc.text(oneLine(doc, strip, pageWidth - 16), 8, panelH + 5.4);
  return panelH + 13;
}

export function paintBandFooter(doc, design, {
  pageWidth, pageHeight, margin, left = '', center = '', right = '', primary,
}) {
  const color = asColor(primary);
  const y = pageHeight - 11;
  if (design === '3') {
    doc.setFillColor(...color);
    doc.rect(0, 0, 3.2, pageHeight, 'F');
    doc.setDrawColor(...color);
    doc.setLineWidth(0.7);
    doc.line(margin + 1, y - 2, margin + 34, y - 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...color);
    const pageLabel = String(right || '');
    doc.text(pageLabel, margin + 1, y + 2);
    const pageW = doc.getTextWidth(pageLabel);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...INK);
    const nameRoom = pageWidth - margin * 2 - pageW - 28;
    if (nameRoom > 16) doc.text(oneLine(doc, left, nameRoom), margin + 1 + pageW + 3, y + 2);
    doc.setTextColor(...MUTED);
    doc.text(oneLine(doc, center, 52), pageWidth - margin, y + 2, { align: 'right' });
    return;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const pageLabel = String(right || '');
  const pillW = Math.max(18, doc.getTextWidth(pageLabel) + 6);
  doc.setFillColor(...color);
  doc.roundedRect(margin, y - 3.6, pillW, 6, 1.1, 1.1, 'F');
  doc.setTextColor(...WHITE);
  doc.text(pageLabel, margin + pillW / 2, y + 0.6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);
  const nameX = margin + pillW + 3;
  const nameW = pageWidth - margin - nameX - 48;
  if (nameW > 16) doc.text(oneLine(doc, left, nameW), nameX, y + 0.6);
  doc.setTextColor(...MUTED);
  doc.text(oneLine(doc, center, 46), pageWidth - margin, y + 0.6, { align: 'right' });
}
