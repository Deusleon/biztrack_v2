// utils/purchaseOrderPdf.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { t } from "./i18n";
import { formatNumberWithCommas } from "./numberUtils";
import { formatDateLocalized } from "@/utils/formatDateLocalized";

const FALLBACK_PRIMARY = [30, 58, 95];

const getPrimaryColorRGB = () => {
  try {
    if (typeof window === "undefined") return FALLBACK_PRIMARY;

    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();

    if (!primaryColor) return FALLBACK_PRIMARY;

    // Supports rgb(30, 58, 95) / rgba(30, 58, 95, 1)
    const rgbMatch = primaryColor.match(/rgba?\(([^)]+)\)/i);
    if (rgbMatch) {
      const parts = rgbMatch[1]
        .split(",")
        .slice(0, 3)
        .map((part) => parseInt(part.trim(), 10));
      if (parts.every((part) => Number.isFinite(part))) return parts;
    }

    // Supports #1e3a5f and #13a
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

const getStatusTheme = (status) => {
  const themes = {
    pending_approval: {
      fill: [255, 251, 235],
      text: [180, 83, 9],
      border: [245, 158, 11],
    },
    approved: {
      fill: [239, 246, 255],
      text: [29, 78, 216],
      border: [59, 130, 246],
    },
    not_received: {
      fill: [239, 246, 255],
      text: [29, 78, 216],
      border: [59, 130, 246],
    },
    partially_received: {
      fill: [238, 242, 255],
      text: [79, 70, 229],
      border: [99, 102, 241],
    },
    received: {
      fill: [236, 253, 245],
      text: [4, 120, 87],
      border: [16, 185, 129],
    },
    cancelled: {
      fill: [254, 242, 242],
      text: [185, 28, 28],
      border: [239, 68, 68],
    },
  };

  return themes[status] || {
    fill: [243, 244, 246],
    text: [55, 65, 81],
    border: [156, 163, 175],
  };
};

/**
 * Generate and open a PDF for a single Purchase Order.
 *
 * Keeps the same public API: exportPurchaseOrderToPDF(order, settings)
 * but improves the visual layout: modern header, info cards, clean table,
 * totals card, notes section, signatures, and page footer.
 *
 * @param {Object} order    - Full purchase order object (including items array)
 * @param {Object} settings - Store/system settings from useStoreSettings
 */
export const exportPurchaseOrderToPDF = (order, settings) => {
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = getPrimaryColorRGB();

  const M = 12;
  const CONTENT_W = pageWidth - M * 2;
  const decimals = settings?.defaultDecimalPlaces ?? 2;
  const currency = settings?.defaultCurrency || "";
  const shouldShowCurrency = settings?.showCurrency !== false && !!currency;

  const fmt = (val) => formatNumberWithCommas(val || 0, decimals);
  const fmtDate = (val) => (val ? formatDateLocalized(val, settings) : "-");
  const fmtMoney = (val) => {
    const formatted = fmt(val);
    if (!shouldShowCurrency) return formatted;
    return settings?.defaultCurrencyPosition === "before"
      ? `${currency} ${formatted}`
      : `${formatted} ${currency}`;
  };

  const LABEL_COLOR = [107, 114, 128];
  const VALUE_COLOR = [17, 24, 39];
  const BORDER_COLOR = [229, 231, 235];
  const SOFT_BG = [249, 250, 251];
  const WHITE = [255, 255, 255];

  const businessName =
    settings?.businessName || settings?.storeName || "BizTrack";
  const statusKey = order?.status === "approved" ? "not_received" : order?.status;
  const statusLabel = t(statusKey || "pending_approval") || safeText(statusKey);
  const statusTheme = getStatusTheme(statusKey);

  doc.setProperties({
    title: `${t("purchase_order")} - ${safeText(order?.po_number, "")}`,
    subject: t("purchase_order"),
    author: businessName,
  });

  const addTopHeader = () => {
    doc.setFillColor(...primary);
    doc.rect(0, 0, pageWidth, 38, "F");

    // Decorative shapes
    doc.setFillColor(255, 255, 255);
    doc.triangle(0, 0, 12, 0, 0, 26, "F");
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.circle(pageWidth - 13, 0.5, 1.2, "S");

    // Business details
    let headerY = 13;
    doc.setTextColor(...WHITE);
    doc.setFont(undefined, "bold");
    doc.setFontSize(16);
    doc.text(businessName, M, headerY);

    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    headerY += 5;

    const contactLines = [
      settings?.address,
      settings?.phone ? `${t("phone")}: ${settings.phone}` : null,
      settings?.email ? `${t("email_address")}: ${settings.email}` : null,
    ].filter(Boolean);

    contactLines.slice(0, 3).forEach((line) => {
      doc.text(safeText(line), M, headerY);
      headerY += 4;
    });

    // Right PO block
    doc.setFontSize(8.5);
    doc.setFont(undefined, "normal");
    doc.text(t("purchase_order").toUpperCase(), pageWidth - M, 14, {
      align: "right",
    });

    doc.setFontSize(15);
    doc.setFont(undefined, "bold");
    doc.text(safeText(order?.po_number, "-"), pageWidth - M, 22, {
      align: "right",
    });

    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(`${t("generated_on")}: ${fmtDate(new Date())}`, pageWidth - M, 31, {
      align: "right",
    });
  };

  const addFooter = (pageNumber, totalPages) => {
    const footerY = pageHeight - 12;
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(M, footerY, pageWidth - M, footerY);

    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(
      `${t("page")} ${pageNumber} / ${totalPages}`,
      pageWidth - M,
      footerY + 5,
      { align: "right" },
    );
    doc.text(t("powered_by"), pageWidth / 2, footerY + 5, {
      align: "center",
    });
    doc.text(businessName, M, footerY + 5);
  };

  const rowHeight = (value, width) => {
    const lines = doc.splitTextToSize(safeText(value), width);
    return Math.max(5.2, lines.length * 4.2);
  };

  const getCardHeight = (rows, width) => {
    const valueWidth = width - 40;
    return (
      13 +
      rows.reduce((height, row) => height + rowHeight(row.value, valueWidth), 0) +
      4
    );
  };

  const drawInfoCard = (x, y, w, h, title, rows) => {
    doc.setFillColor(...SOFT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.35);
    roundedRect(doc, x, y, w, h, 1, 1, "FD");

    doc.setFillColor(243, 244, 246);
    doc.rect(x, y, w, 8, "F");
    doc.setFont(undefined, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(title.toUpperCase(), x + 4, y + 5.4);

    let rowY = y + 13;
    const labelX = x + 4;
    const valueX = x + 34;
    const valueW = w - 38;

    rows.forEach((row) => {
      const value = safeText(row.value);
      const lines = doc.splitTextToSize(value, valueW);
      const height = Math.max(5.2, lines.length * 4.2);

      doc.setFont(undefined, "normal");
      doc.setFontSize(8.2);
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

  // First-page header
  addTopHeader();

  // Title area
  let y = 47;
  doc.setFont(undefined, "bold");
  doc.setFontSize(13);
  doc.setTextColor(...VALUE_COLOR);
  doc.text(t("purchase_order").toUpperCase(), M, y);

  // Status badge
  const badgeText = statusLabel.toUpperCase();
  const badgeW = Math.max(28, doc.getTextWidth(badgeText) + 10);
  const badgeX = pageWidth - M - badgeW;
  doc.setFillColor(...statusTheme.fill);
  doc.setDrawColor(...statusTheme.border);
  roundedRect(doc, badgeX, y - 5, badgeW, 7, 3, 3, "FD");
  doc.setFont(undefined, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...statusTheme.text);
  doc.text(badgeText, badgeX + badgeW / 2, y - 0.5, { align: "center" });

  y += 8;
  doc.setDrawColor(...BORDER_COLOR);
  doc.line(M, y, pageWidth - M, y);
  y += 6;

  // Order and supplier cards
  const cardGap = 6;
  const cardW = (CONTENT_W - cardGap) / 2;
  const leftRows = [
    { label: t("po_number"), value: order?.po_number, strong: true },
    { label: t("order_date"), value: fmtDate(order?.order_date) },
    { label: t("expected_date"), value: fmtDate(order?.expected_delivery_date) },
    { label: t("created_by"), value: order?.created_by_name },
    ...(order?.approved_by_name
      ? [{ label: t("approved_by"), value: order.approved_by_name }]
      : []),
  ];

  const rightRows = [
    { label: t("name"), value: order?.supplier_name, strong: true },
    ...(order?.delivery_address
      ? [{ label: t("shipping_address"), value: order.delivery_address }]
      : []),
    ...(order?.payment_terms
      ? [{ label: t("payment_terms"), value: order.payment_terms }]
      : []),
    ...(order?.supplier_phone
      ? [{ label: t("phone"), value: order.supplier_phone }]
      : []),
    ...(order?.supplier_email
      ? [{ label: t("email_address"), value: order.supplier_email }]
      : []),
  ];

  const cardH = Math.max(
    getCardHeight(leftRows, cardW),
    getCardHeight(rightRows, cardW),
  );

  drawInfoCard(M, y, cardW, cardH, t("order_details"), leftRows);
  drawInfoCard(M + cardW + cardGap, y, cardW, cardH, t("supplier"), rightRows);
  y += cardH + 8;

  // Items table
  const items = Array.isArray(order?.items) ? order.items : [];
  const hasVat = items.some((item) => parseFloat(item.tax_rate) > 0);
  const hasDiscount = items.some((item) => parseFloat(item.discount_amount) > 0);

  doc.setFont(undefined, "bold");
  doc.setFontSize(9);
  doc.setTextColor(...VALUE_COLOR);
  doc.text(t("items").toUpperCase(), M, y);
  y += 3;

  const tableColumns = [
    { header: "#", dataKey: "no" },
    { header: t("product"), dataKey: "product" },
    { header: t("quantity"), dataKey: "quantity" },
    { header: t("unit_price"), dataKey: "unit_price" },
    ...(hasVat ? [{ header: `${t("tax")} %`, dataKey: "tax_rate" }] : []),
    ...(hasDiscount ? [{ header: t("discount"), dataKey: "discount" }] : []),
    { header: t("total"), dataKey: "total" },
  ];

  const tableRows = items.map((item, idx) => ({
    no: `${idx + 1}.`,
    product: item.sku
      ? `${safeText(item.product_name || item.name)}\n${safeText(item.sku)}`
      : safeText(item.product_name || item.name),
    quantity: fmt(item.quantity),
    unit_price: fmtMoney(item.unit_price),
    ...(hasVat ? { tax_rate: `${item.tax_rate || 0}%` } : {}),
    ...(hasDiscount ? { discount: fmtMoney(item.discount_amount || 0) } : {}),
    total: fmtMoney(item.line_total),
  }));

  autoTable(doc, {
    startY: y,
    columns: tableColumns,
    body: tableRows,
    styles: {
      fontSize: 8.4,
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
      no: { cellWidth: 8, halign: "center" },
      product: { cellWidth: "auto" },
      quantity: { cellWidth: 20, halign: "right" },
      unit_price: { cellWidth: 28, halign: "right" },
      tax_rate: { cellWidth: 16, halign: "right" },
      discount: { cellWidth: 25, halign: "right" },
      total: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
    margin: { top: 14, right: M, bottom: 24, left: M },
    showHead: "everyPage",
    didParseCell(data) {
      if (data.section === "body" && data.column.dataKey === "product") {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  y = (doc.lastAutoTable?.finalY || y) + 8;

  // Totals and notes section
  const subtotal = parseFloat(order?.subtotal || 0);
  const totalAmt = parseFloat(order?.total_amount || 0);
  const taxAmount = parseFloat(order?.tax_amount || 0);
  const discountAmount = parseFloat(order?.discount_amount || 0);

  const totalRows = [
    ...(subtotal > 0 && subtotal !== totalAmt
      ? [{ label: t("subtotal"), value: fmtMoney(order.subtotal) }]
      : []),
    ...(discountAmount > 0
      ? [{ label: t("discount"), value: `- ${fmtMoney(discountAmount)}` }]
      : []),
    ...(taxAmount > 0 ? [{ label: t("tax"), value: fmtMoney(taxAmount) }] : []),
    { label: t("total"), value: fmtMoney(order?.total_amount), total: true },
  ];

  const totalBoxW = 78;
  const notesGap = 7;
  const notesW = CONTENT_W - totalBoxW - notesGap;
  const totalBoxX = pageWidth - M - totalBoxW;
  const totalBoxH = 12 + totalRows.length * 7 + 4;

  const notesText = [order?.notes, order?.internal_notes]
    .filter(Boolean)
    .join("\n\n");
  const noteLines = notesText ? doc.splitTextToSize(notesText, notesW - 8) : [];
  const notesBoxH = notesText ? Math.max(28, 14 + noteLines.length * 4.2) : 0;

  ensureSpace(Math.max(totalBoxH, notesBoxH) + 8);
  const sectionTop = y;

  if (notesText) {
    doc.setFillColor(...SOFT_BG);
    doc.setDrawColor(...BORDER_COLOR);
    roundedRect(doc, M, sectionTop, notesW, notesBoxH, 2, 2, "FD");

    doc.setFont(undefined, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(t("notes").toUpperCase(), M + 4, sectionTop + 6);

    doc.setFont(undefined, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...VALUE_COLOR);
    doc.text(noteLines, M + 4, sectionTop + 12);
  }

  // Total card
  doc.setFillColor(...SOFT_BG);
  doc.setDrawColor(...BORDER_COLOR);
  roundedRect(doc, totalBoxX, sectionTop, totalBoxW, totalBoxH, 1, 1, "FD");

  doc.setFont(undefined, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL_COLOR);
  doc.text(t("summary").toUpperCase(), totalBoxX + 4, sectionTop + 6);

  let totalY = sectionTop + 14;
  totalRows.forEach((row) => {
    if (row.total) {
      doc.setDrawColor(...BORDER_COLOR);
      doc.line(totalBoxX + 4, totalY - 4, totalBoxX + totalBoxW - 4, totalY - 4);
      doc.setFont(undefined, "bold");
      doc.setTextColor(...VALUE_COLOR);
    } else {
      doc.setFont(undefined, "normal");
      doc.setTextColor(...LABEL_COLOR);
    }

    doc.setFontSize(row.total ? 10 : 8.5);
    doc.text(`${row.label}:`, totalBoxX + 4, totalY);
    doc.setTextColor(...(row.total ? primary : VALUE_COLOR));
    doc.text(safeText(row.value), totalBoxX + totalBoxW - 4, totalY, {
      align: "right",
    });
    totalY += row.total ? 7.5 : 6.5;
  });

  y = sectionTop + Math.max(totalBoxH, notesBoxH) + 12;

  // Signature area
  ensureSpace(26);
  const sigGap = 10;
  const sigW = (CONTENT_W - sigGap * 2) / 3;
  const signatures = [
    t("prepared_by"),
    t("approved_by"),
    t("supplier_signature"),
  ];

  signatures.forEach((label, index) => {
    const x = M + index * (sigW + sigGap);
    doc.setDrawColor(190, 190, 190);
    doc.line(x, y + 10, x + sigW, y + 10);
    doc.setFont(undefined, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL_COLOR);
    doc.text(label, x + sigW / 2, y + 15, { align: "center" });
  });

  // Footer on all pages, after all content is created
  const pageCount = doc.internal.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    addFooter(pageNumber, pageCount);
  }

  // Open in new tab
  const pdfBlob = doc.output("bloburl");
  window.open(pdfBlob, "_blank");
};
