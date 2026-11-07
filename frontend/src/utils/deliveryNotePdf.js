import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { t } from "@/utils/i18n";
import { formatDateLocalized } from "@/utils/formatDateLocalized";
import { formatNumberWithCommas } from "@/utils/numberUtils";

/**
 * Paper size configurations for delivery notes.
 * Receipt sizes (58mm, 80mm) keep a compact thermal layout.
 * A5 and A4 use the redesigned document layout inspired by purchaseOrderPdf.js.
 */
const PAPER = {
  "58mm": {
    width: 48,
    padding: 0,
    headerSize: 11,
    subHeaderSize: 10,
    infoSize: 8,
    bodySize: 8,
    itemSize: 8,
    footerSize: 7,
    poweredSize: 6,
    logoH: 15,
    lineGap: 0.8,
    sectionGap: 0.5,
    mode: "thermal",
  },
  "80mm": {
    width: 72,
    padding: 2,
    headerSize: 14,
    subHeaderSize: 12,
    infoSize: 10,
    bodySize: 10,
    itemSize: 10,
    footerSize: 9,
    poweredSize: 7,
    logoH: 20,
    lineGap: 1,
    sectionGap: 0.8,
    mode: "thermal",
  },
  A5: {
    margin: 10,
    headerHeight: 32,
    titleSize: 12,
    infoSize: 8.2,
    bodySize: 8.8,
    itemSize: 8.2,
    poweredSize: 7,
    mode: "document",
  },
  A4: {
    margin: 12,
    headerHeight: 38,
    titleSize: 13,
    infoSize: 8.5,
    bodySize: 9,
    itemSize: 8.4,
    poweredSize: 8,
    mode: "document",
  },
};

const FALLBACK_PRIMARY = [30, 58, 95];

const getPrimaryColorRGB = () => {
  try {
    if (typeof window === "undefined") return FALLBACK_PRIMARY;

    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();

    if (!primaryColor) return FALLBACK_PRIMARY;

    const rgbMatch = primaryColor.match(/rgba?\(([^)]+)\)/i);
    if (rgbMatch) {
      const parts = rgbMatch[1]
        .split(",")
        .slice(0, 3)
        .map((part) => parseInt(part.trim(), 10));

      if (parts.every((part) => Number.isFinite(part))) return parts;
    }

    let hex = primaryColor.replace("#", "").trim();
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => `${char}${char}`)
        .join("");
    }

    if (hex.length !== 6) return FALLBACK_PRIMARY;

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    if ([r, g, b].some((value) => Number.isNaN(value))) {
      return FALLBACK_PRIMARY;
    }

    return [r, g, b];
  } catch {
    return FALLBACK_PRIMARY;
  }
};

const safeText = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const roundedRect = (doc, x, y, w, h, rx = 2, ry = 2, style = "S") => {
  if (typeof doc.roundedRect === "function") {
    doc.roundedRect(x, y, w, h, rx, ry, style);
  } else {
    doc.rect(x, y, w, h, style);
  }
};

const sumQuantity = (items = []) =>
  items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);

const getDeliveryRef = (orderInfo = {}) =>
  orderInfo.delivery_note_number ||
  orderInfo.delivery_number ||
  orderInfo.delivery_no ||
  orderInfo.invoice_number ||
  orderInfo.order_number ||
  orderInfo.po_number ||
  "N/A";

/**
 * Generate a delivery note PDF.
 * @param {Object} data - { businessInfo, orderInfo, customerInfo, items, settings }
 * @param {string} size - "58mm" | "80mm" | "A5" | "A4"
 * @returns {jsPDF} doc
 */
export function generateDeliveryNotePDF(data, size = "A4") {
  const p = PAPER[size] || PAPER.A4;

  if (p.mode === "thermal") {
    return generateThermalDeliveryNote(data, size);
  }

  return generateDocumentDeliveryNote(data, size);
}

// ── Thermal (58mm / 80mm) ──────────────────────────────────

function generateThermalDeliveryNote(data, size) {
  const p = PAPER[size] || PAPER["80mm"];

  const measuredHeight = renderThermal(null, data, p);
  return renderThermal(measuredHeight, data, p);
}

function renderThermal(pageHeight, data, p) {
  const {
    businessInfo = {},
    orderInfo = {},
    customerInfo = {},
    items = [],
    settings = {},
  } = data || {};
  const measuring = pageHeight === null;

  const doc = new jsPDF({
    unit: "mm",
    format: [p.width, measuring ? 600 : pageHeight],
  });

  const W = p.width;
  const M = p.padding;
  const CW = W - M * 2;
  let y = M;

  const centerText = (text, sz, style = "normal") => {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(sz);
    doc.setFont("helvetica", style);
    const lines = doc.splitTextToSize(safeText(text, ""), CW);
    const lh = sz * 0.38;
    lines.forEach((line) => {
      const tw = doc.getTextWidth(line);
      doc.text(line, M + (CW - tw) / 2, y + lh);
      y += lh + p.lineGap * 0.3;
    });
  };

  const lrRow = (left, right, sz = p.bodySize, style = "normal") => {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(sz);
    doc.setFont("helvetica", style);
    const lh = sz * 0.38;
    const rightText = safeText(right, "");
    const rw = doc.getTextWidth(rightText);
    const leftMaxW = Math.max(8, CW - rw - 1);
    const leftLines = doc.splitTextToSize(safeText(left, ""), leftMaxW);

    leftLines.forEach((line, index) => {
      doc.text(line, M, y + lh);
      if (index === 0) doc.text(rightText, W - M, y + lh, { align: "right" });
      y += lh + p.lineGap * 0.3;
    });
  };

  const solidLine = (thickness = 0.2) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(thickness);
    doc.line(M, y, W - M, y);
    y += 0.2;
  };

  const gap = (mm) => {
    y += mm || p.sectionGap;
  };

  if (settings.showLogoOnReceipt && businessInfo.logo) {
    try {
      const imgW = p.logoH;
      const imgX = M + (CW - imgW) / 2;
      doc.addImage(businessInfo.logo, "PNG", imgX, y, imgW, p.logoH);
      y += p.logoH + 1;
    } catch {
      // Ignore unsupported logo formats.
    }
  }

  if (businessInfo.name) {
    centerText(businessInfo.name, p.headerSize, "bold");
    y += 0.3;
  }
  if (businessInfo.address) centerText(businessInfo.address, p.infoSize);
  if (businessInfo.phone) centerText(`${t("phone")}: ${businessInfo.phone}`, p.infoSize);

  y += 0.5;
  centerText(t("delivery_note").toUpperCase(), p.subHeaderSize, "bold");
  y += 0.5;
  solidLine(0.2);
  gap(p.sectionGap);

  const ref = getDeliveryRef(orderInfo);
  const deliveryDate =
    orderInfo.delivery_date ||
    orderInfo.date ||
    orderInfo.sales_date ||
    orderInfo.created_at ||
    new Date();

  lrRow(`${t("reference")}:`, ref, p.bodySize);
  lrRow(`${t("date")}:`, formatDateLocalized(deliveryDate, settings), p.bodySize);
  if (orderInfo.cashierName || orderInfo.prepared_by) {
    lrRow(`${t("prepared_by")}:`, orderInfo.cashierName || orderInfo.prepared_by, p.bodySize);
  }
  y += 0.5;
  solidLine(0.2);

  if (customerInfo.name) lrRow(`${t("customer")}:`, customerInfo.name, p.bodySize);
  if (customerInfo.phone) lrRow(`${t("phone")}:`, customerInfo.phone, p.bodySize);
  if (customerInfo.address) lrRow(`${t("address")}:`, customerInfo.address, p.bodySize);
  gap(1);

  autoTable(doc, {
    startY: y,
    head: [[t("item"), t("qty")]],
    body: items.map((item) => [
      item.sku ? `${safeText(item.name)}\n${safeText(item.sku)}` : safeText(item.name),
      formatNumberWithCommas(Number(item.quantity || 0)),
    ]),
    theme: "plain",
    margin: { left: M, right: M },
    tableWidth: CW,
    styles: {
      fontSize: p.itemSize,
      cellPadding: { top: 0.8, bottom: 0.8, left: 0, right: 0 },
      textColor: [0, 0, 0],
      font: "helvetica",
      overflow: "linebreak",
    },
    headStyles: { fontStyle: "bold", fontSize: p.itemSize },
    columnStyles: {
      0: { halign: "left", cellWidth: CW * 0.74 },
      1: { halign: "right", cellWidth: CW * 0.26 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "head") {
        hookData.cell.styles.lineWidth = { top: 0.4, bottom: 0.4 };
        hookData.cell.styles.lineColor = [0, 0, 0];
      }
      if (hookData.section === "body") {
        hookData.cell.styles.lineWidth = { bottom: 0.2 };
        hookData.cell.styles.lineColor = [100, 100, 100];
      }
    },
  });

  y = doc.lastAutoTable.finalY;
  solidLine(0.3);
  y += 0.5;

  lrRow(`${t("total_items")}:`, String(items.length), p.bodySize, "bold");
  lrRow(`${t("total_quantity")}:`, formatNumberWithCommas(sumQuantity(items)), p.bodySize, "bold");

  y += 2;
  solidLine(0.2);
  gap(2);

  lrRow(`${t("prepared_by")}:`, ".....................", p.bodySize);
  gap(2);
  lrRow(`${t("received_by")}:`, ".....................", p.bodySize);

  y += 2;
  centerText(t("powered_by") || "Powered By BizTrack Software", p.poweredSize);
  y += 3;

  if (measuring) return y;
  return doc;
}

// ── Document (A5 / A4) ────────────────────────────────────

function generateDocumentDeliveryNote(data, size) {
  const p = PAPER[size] || PAPER.A4;
  const {
    businessInfo = {},
    orderInfo = {},
    customerInfo = {},
    items = [],
    settings = {},
  } = data || {};

  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: size === "A5" ? "a5" : "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = getPrimaryColorRGB();

  const M = p.margin;
  const CONTENT_W = pageWidth - M * 2;
  const LABEL_COLOR = [107, 114, 128];
  const VALUE_COLOR = [17, 24, 39];
  const BORDER_COLOR = [229, 231, 235];
  const SOFT_BG = [249, 250, 251];
  const WHITE = [255, 255, 255];

  const businessName =
    businessInfo.name || settings?.businessName || settings?.storeName || "BizTrack";
  const ref = getDeliveryRef(orderInfo);
  const deliveryDate =
    orderInfo.delivery_date ||
    orderInfo.date ||
    orderInfo.sales_date ||
    orderInfo.created_at ||
    new Date();
  const totalQty = sumQuantity(items);

  const fmtDate = (value) => (value ? formatDateLocalized(value, settings) : "-");
  const fmtQty = (value) => formatNumberWithCommas(Number(value || 0));

  doc.setProperties({
    title: `${t("delivery_note")} - ${safeText(ref, "")}`,
    subject: t("delivery_note"),
    author: businessName,
  });

  const addTopHeader = () => {
    const headerH = p.headerHeight;
    doc.setFillColor(...primary);
    doc.rect(0, 0, pageWidth, headerH, "F");

    // Decorative shapes, matching the purchase order style.
    doc.setFillColor(...WHITE);
    doc.triangle(0, 0, 12, 0, 0, Math.min(26, headerH - 6), "F");
    doc.setDrawColor(...WHITE);
    doc.setLineWidth(0.4);
    doc.circle(pageWidth - 13, 0.5, 1.2, "S");

    let headerY = size === "A5" ? 11 : 13;
    doc.setTextColor(...WHITE);
    doc.setFont(undefined, "bold");
    doc.setFontSize(size === "A5" ? 13 : 16);
    doc.text(safeText(businessName), M, headerY);

    doc.setFont(undefined, "normal");
    doc.setFontSize(size === "A5" ? 7.5 : 8.5);
    headerY += size === "A5" ? 4.6 : 5;

    const contactLines = [
      businessInfo.address,
      businessInfo.phone ? `${t("phone")}: ${businessInfo.phone}` : null,
      businessInfo.email ? `${t("email_address")}: ${businessInfo.email}` : null,
      businessInfo.tin ? `TIN: ${businessInfo.tin}` : null,
    ].filter(Boolean);

    contactLines.slice(0, size === "A5" ? 2 : 3).forEach((line) => {
      doc.text(safeText(line), M, headerY);
      headerY += size === "A5" ? 3.6 : 4;
    });

    doc.setFontSize(size === "A5" ? 7.5 : 8.5);
    doc.setFont(undefined, "normal");
    doc.text(t("delivery_note").toUpperCase(), pageWidth - M, size === "A5" ? 12 : 14, {
      align: "right",
    });

    doc.setFontSize(size === "A5" ? 12 : 15);
    doc.setFont(undefined, "bold");
    doc.text(safeText(ref), pageWidth - M, size === "A5" ? 19 : 22, {
      align: "right",
    });

    doc.setFontSize(size === "A5" ? 7 : 8);
    doc.setFont(undefined, "normal");
    doc.text(`${t("generated_on")}: ${fmtDate(new Date())}`, pageWidth - M, size === "A5" ? 27 : 31, {
      align: "right",
    });
  };

  const addFooter = (pageNumber, totalPages) => {
    const footerY = pageHeight - 12;
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(M, footerY, pageWidth - M, footerY);

    doc.setFont(undefined, "normal");
    doc.setFontSize(p.poweredSize);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(`${t("page")} ${pageNumber} / ${totalPages}`, pageWidth - M, footerY + 5, {
      align: "right",
    });
    doc.text(t("powered_by") || "Powered By BizTrack Software", pageWidth / 2, footerY + 5, {
      align: "center",
    });
    doc.text(businessName, M, footerY + 5);
  };

  const rowHeight = (value, width) => {
    const lines = doc.splitTextToSize(safeText(value), width);
    return Math.max(5.2, lines.length * 4.2);
  };

  const getCardHeight = (rows, width) => {
    const valueWidth = width - 38;
    return (
      13 +
      rows.reduce((height, row) => height + rowHeight(row.value, valueWidth), 0) +
      4
    );
  };

  const drawInfoCard = (x, cardY, w, h, title, rows) => {
    doc.setFillColor(...SOFT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.35);
    roundedRect(doc, x, cardY, w, h, 1, 1, "FD");

    doc.setFillColor(243, 244, 246);
    doc.rect(x, cardY, w, 8, "F");
    doc.setFont(undefined, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(title.toUpperCase(), x + 4, cardY + 5.4);

    let rowY = cardY + 13;
    const labelX = x + 4;
    const valueX = x + 32;
    const valueW = w - 36;

    rows.forEach((row) => {
      const lines = doc.splitTextToSize(safeText(row.value), valueW);
      const height = Math.max(5.2, lines.length * 4.2);

      doc.setFont(undefined, "normal");
      doc.setFontSize(p.infoSize);
      doc.setTextColor(...LABEL_COLOR);
      doc.text(`${row.label}:`, labelX, rowY);

      doc.setFont(undefined, row.strong ? "bold" : "normal");
      doc.setTextColor(...VALUE_COLOR);
      doc.text(lines, valueX, rowY);
      rowY += height;
    });
  };

  const ensureSpace = (heightNeeded) => {
    if (y + heightNeeded > pageHeight - 24) {
      doc.addPage();
      y = 18;
    }
  };

  addTopHeader();

  let y = p.headerHeight + 9;

  doc.setFont(undefined, "bold");
  doc.setFontSize(p.titleSize);
  doc.setTextColor(...VALUE_COLOR);
  doc.text(t("delivery_note").toUpperCase(), M, y);

  // Document purpose badge
  const badgeText = (t("goods_delivery") || "GOODS DELIVERY").toUpperCase();
  const badgeW = Math.max(34, doc.getTextWidth(badgeText) + 10);
  const badgeX = pageWidth - M - badgeW;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(...primary);
  roundedRect(doc, badgeX, y - 5, badgeW, 7, 3, 3, "FD");
  doc.setFont(undefined, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...primary);
  doc.text(badgeText, badgeX + badgeW / 2, y - 0.5, { align: "center" });

  y += 8;
  doc.setDrawColor(...BORDER_COLOR);
  doc.line(M, y, pageWidth - M, y);
  y += 6;

  const cardGap = size === "A5" ? 4 : 6;
  const cardW = (CONTENT_W - cardGap) / 2;

  const leftRows = [
    { label: t("reference"), value: ref, strong: true },
    { label: t("date"), value: fmtDate(deliveryDate) },
    ...(orderInfo.invoice_number && orderInfo.invoice_number !== ref
      ? [{ label: t("invoice_no"), value: orderInfo.invoice_number }]
      : []),
    ...(orderInfo.order_number
      ? [{ label: t("order_no"), value: orderInfo.order_number }]
      : []),
    ...(orderInfo.cashierName || orderInfo.prepared_by
      ? [{ label: t("prepared_by"), value: orderInfo.cashierName || orderInfo.prepared_by }]
      : []),
  ];

  const rightRows = [
    { label: t("name"), value: customerInfo.name || t("walk_in"), strong: true },
    ...(customerInfo.phone ? [{ label: t("phone"), value: customerInfo.phone }] : []),
    ...(customerInfo.address ? [{ label: t("address"), value: customerInfo.address }] : []),
    ...(customerInfo.tin ? [{ label: "TIN", value: customerInfo.tin }] : []),
  ];

  const cardH = Math.max(
    getCardHeight(leftRows, cardW),
    getCardHeight(rightRows, cardW),
  );

  drawInfoCard(M, y, cardW, cardH, t("delivery_information"), leftRows);
  drawInfoCard(M + cardW + cardGap, y, cardW, cardH, t("deliver_to"), rightRows);
  y += cardH + 8;

  doc.setFont(undefined, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...VALUE_COLOR);
  doc.text(t("items").toUpperCase(), M, y);
  y += 3;

  autoTable(doc, {
    startY: y,
    columns: [
      { header: "#", dataKey: "no" },
      { header: t("item_description"), dataKey: "item" },
      { header: t("quantity"), dataKey: "quantity" },
    ],
    body: items.map((item, index) => ({
      no: `${index + 1}.`,
      item: item.sku
        ? `${safeText(item.name || item.product_name)}\n${safeText(item.sku)}`
        : safeText(item.name || item.product_name),
      quantity: item.unit
        ? `${fmtQty(item.quantity)} ${safeText(item.unit, "")}`.trim()
        : fmtQty(item.quantity),
    })),
    styles: {
      fontSize: p.itemSize,
      overflow: "linebreak",
      cellPadding: { top: 2.4, right: 2, bottom: 2.4, left: 2 },
      textColor: VALUE_COLOR,
      lineColor: [235, 237, 240],
      lineWidth: 0.15,
      valign: "middle",
    },
    headStyles: {
      fillColor: primary,
      textColor: WHITE,
      fontStyle: "bold",
      halign: "left",
      fontSize: 8,
      cellPadding: { top: 2.8, right: 2, bottom: 2.8, left: 2 },
    },
    bodyStyles: {
      minCellHeight: 7,
    },
    columnStyles: {
      no: { cellWidth: 9, halign: "center" },
      item: { cellWidth: "auto" },
      quantity: { cellWidth: size === "A5" ? 28 : 35, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    margin: { top: 14, right: M, bottom: 24, left: M },
    showHead: "everyPage",
    didParseCell(hookData) {
      if (hookData.section === "body" && hookData.column.dataKey === "item") {
        hookData.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = (doc.lastAutoTable?.finalY || y) + 8;

  const noteText = [
    orderInfo.notes,
    orderInfo.delivery_notes,
    data?.notes,
    data?.deliveryNotes,
  ]
    .filter(Boolean)
    .join("\n\n");

  const summaryBoxW = size === "A5" ? 52 : 66;
  const notesGap = 7;
  const notesW = CONTENT_W - summaryBoxW - notesGap;
  const summaryX = pageWidth - M - summaryBoxW;
  const summaryRows = [
    { label: t("total_items"), value: formatNumberWithCommas(items.length) },
    { label: t("total_quantity"), value: formatNumberWithCommas(totalQty), total: true },
  ];
  const summaryBoxH = 12 + summaryRows.length * 7 + 4;
  const noteLines = noteText ? doc.splitTextToSize(noteText, notesW - 8) : [];
  const notesBoxH = noteText ? Math.max(28, 14 + noteLines.length * 4.2) : 0;

  ensureSpace(Math.max(summaryBoxH, notesBoxH) + 8);
  const sectionTop = y;

  if (noteText) {
    doc.setFillColor(...SOFT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    roundedRect(doc, M, sectionTop, notesW, notesBoxH, 2, 2, "FD");

    doc.setFont(undefined, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(t("notes").toUpperCase(), M + 4, sectionTop + 6);

    doc.setFont(undefined, "normal");
    doc.setFontSize(p.infoSize);
    doc.setTextColor(...VALUE_COLOR);
    doc.text(noteLines, M + 4, sectionTop + 12);
  }

  doc.setFillColor(...SOFT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  roundedRect(doc, summaryX, sectionTop, summaryBoxW, summaryBoxH, 1, 1, "FD");

  doc.setFont(undefined, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL_COLOR);
  doc.text(t("summary").toUpperCase(), summaryX + 4, sectionTop + 6);

  let summaryY = sectionTop + 14;
  summaryRows.forEach((row) => {
    if (row.total) {
      doc.setDrawColor(...BORDER_COLOR);
      doc.line(summaryX + 4, summaryY - 4, summaryX + summaryBoxW - 4, summaryY - 4);
      doc.setFont(undefined, "bold");
      doc.setTextColor(...VALUE_COLOR);
    } else {
      doc.setFont(undefined, "normal");
      doc.setTextColor(...LABEL_COLOR);
    }

    doc.setFontSize(row.total ? 10 : 8.5);
    doc.text(`${row.label}:`, summaryX + 4, summaryY);
    doc.setTextColor(...(row.total ? primary : VALUE_COLOR));
    doc.text(safeText(row.value), summaryX + summaryBoxW - 4, summaryY, {
      align: "right",
    });
    summaryY += row.total ? 7.5 : 6.5;
  });

  y = sectionTop + Math.max(summaryBoxH, notesBoxH) + 12;

  ensureSpace(size === "A5" ? 24 : 28);
  const sigGap = size === "A5" ? 5 : 10;
  const sigW = (CONTENT_W - sigGap * 2) / 3;
  const signatures = [
    t("prepared_by"),
    t("delivered_by"),
    t("received_by"),
  ];

  signatures.forEach((label, index) => {
    const x = M + index * (sigW + sigGap);
    doc.setDrawColor(190, 190, 190);
    doc.setLineWidth(0.3);
    doc.line(x, y + 10, x + sigW, y + 10);
    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(label, x + sigW / 2, y + 15, { align: "center" });
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    addFooter(pageNumber, pageCount);
  }

  return doc;
}

/**
 * Generate delivery note and return base64 for printing.
 */
export function generateDeliveryNotePDFBase64(data, size = "80mm") {
  const doc = generateDeliveryNotePDF(data, size);
  return doc.output("datauristring").split(",")[1];
}

/**
 * Generate delivery note and return blob URL for preview.
 */
export function generateDeliveryNotePDFUrl(data, size = "A4") {
  const doc = generateDeliveryNotePDF(data, size);
  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}
