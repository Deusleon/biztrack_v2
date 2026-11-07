import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { t } from "@/utils/i18n";
import { formatDateLocalized } from "@/utils/formatDateLocalized";
import { formatCurrency } from "@/utils/numberUtils";

/**
 * Paper size configurations (all in mm).
 * Font sizes are in pt (jsPDF default). Tailwind text-xs ≈ 12px ≈ 9pt,
 * text-sm ≈ 14px ≈ 10.5pt, text-base ≈ 16px ≈ 12pt.
 *
 * We scale these down proportionally for the narrow receipt paper:
 * Screen receipt at 80mm width uses text-xs (9pt) as base.
 * But 80mm on screen ≠ 80mm on paper (screen has higher effective DPI for reading).
 * The sizes below are tuned to look correct when printed at actual mm dimensions.
 */
const PAPER = {
  "58mm": {
    width: 48,
    padding: 0,
    bodySize: 9, // base body text
    headerSize: 12, // business name (text-base equivalent)
    subHeaderSize: 10, // receipt type (font-semibold)
    infoSize: 8, // address, email, phone, TIN/VRN (text-xs)
    itemSize: 9, // item rows
    totalLabelSize: 9, // TOTAL row
    footerSize: 7, // footer text
    poweredSize: 6, // "Powered by" text
    logoH: 15, // logo height in mm
    qrSize: 17, // QR code size in mm
    lineGap: 0.8, // gap between text lines
    sectionGap: 0.5, // gap between sections
  },
  "80mm": {
    width: 72,
    padding: 2,
    bodySize: 12,
    headerSize: 16,
    subHeaderSize: 13,
    infoSize: 11,
    itemSize: 12,
    totalLabelSize: 12,
    footerSize: 10,
    poweredSize: 8,
    logoH: 20,
    qrSize: 23,
    lineGap: 1.2,
    sectionGap: 1,
  },
  A5: {
    width: 148,
    height: 210,
    padding: 12,
    bodySize: 11,
    headerSize: 18,
    subHeaderSize: 14,
    infoSize: 10,
    itemSize: 11,
    totalLabelSize: 12,
    footerSize: 9,
    poweredSize: 8,
    logoH: 20,
    qrSize: 25,
    lineGap: 1.5,
    sectionGap: 2,
    mode: "document",
  },
  A4: {
    width: 210,
    height: 297,
    padding: 15,
    bodySize: 12,
    headerSize: 20,
    subHeaderSize: 15,
    infoSize: 11,
    itemSize: 12,
    totalLabelSize: 13,
    footerSize: 10,
    poweredSize: 8,
    logoH: 22,
    qrSize: 30,
    lineGap: 1.5,
    sectionGap: 3,
    mode: "document",
  },
};

export function generateReceiptPDF(data, receiptSize = "80mm") {
  const p = PAPER[receiptSize] || PAPER["80mm"];

  // Document sizes (A5, A4) use a different layout matching InvoiceReceipt
  if (p.mode === "document") {
    return renderDocumentReceipt(data, receiptSize);
  }

  // Thermal sizes (58mm, 80mm) use measure-then-render
  const measuredHeight = renderReceipt(null, data, receiptSize);
  return renderReceipt(measuredHeight, data, receiptSize);
}

// ═══════════════════════════════════════════════════════════
// DOCUMENT MODE (A5 / A4) — matches InvoiceReceipt.jsx layout
// ═══════════════════════════════════════════════════════════

function renderDocumentReceipt(data, receiptSize) {
  const {
    businessInfo = {},
    orderInfo = {},
    customerInfo = {},
    paymentInfo = {},
    items = [],
    settings = {},
  } = data;

  const p = PAPER[receiptSize] || PAPER["A5"];
  const dp = settings.defaultDecimalPlaces ?? 0;
  const isA4 = receiptSize === "A4";
  const minRows = isA4 ? 10 : 6;

  const doc = new jsPDF({
    unit: "mm",
    format: [p.width, p.height],
  });

  const M = p.padding;
  const W = p.width;
  const CW = W - M * 2;
  let y = M;

  // ── Helpers ──────────────────────────────────────────────
  const fmt = (val) => {
    const num = parseFloat(String(val).replace(/,/g, ""));
    if (isNaN(num)) return "0";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    });
  };

  const _now = new Date();
  const formattedDate = new Date().toLocaleString("en-GB").replace(",", "");

  const bodyFs = isA4 ? 10 : 9;
  const headFs = isA4 ? 14 : 12;
  const smallFs = isA4 ? 9 : 8;
  const titleFs = isA4 ? 14 : 12;

  // Primary color (approximate var(--primary) — use a blue)
  const PRIMARY = [59, 130, 246]; // blue-500
  const RED = [239, 68, 68]; // red-500

  // ── BUSINESS HEADER (two columns) ───────────────────────
  const _headerLeftX = M;
  const headerRightX = W - M;
  const headerStartY = y;

  // LEFT side: Logo + business details
  let leftY = y;
  let logoEndX = M;

  if (settings.showLogoOnReceipt && businessInfo.logo) {
    try {
      const logoH = isA4 ? 16 : 12;
      doc.addImage(businessInfo.logo, "PNG", M, leftY, logoH, logoH);
      logoEndX = M + logoH + 3;
      leftY = y; // text starts at the same top as logo
    } catch {
      // skip logo
    }
  }

  const textStartX = logoEndX > M ? logoEndX : M;

  if (businessInfo.name) {
    doc.setFontSize(headFs);
    doc.setFont("helvetica", "bold");
    doc.text(businessInfo.name, textStartX, leftY + headFs * 0.38);
    leftY += headFs * 0.38 + 1.5;
  }

  doc.setFontSize(smallFs);
  doc.setFont("helvetica", "normal");
  if (businessInfo.address) {
    doc.text(businessInfo.address, textStartX, leftY + smallFs * 0.35);
    leftY += smallFs * 0.35 + 1;
  }
  if (businessInfo.email || businessInfo.website) {
    const line = [businessInfo.email, businessInfo.website].filter(Boolean).join(" | ");
    doc.text(line, textStartX, leftY + smallFs * 0.35);
    leftY += smallFs * 0.35 + 1;
  }
  if (businessInfo.phone) {
    doc.text(`Tel: ${businessInfo.phone}`, textStartX, leftY + smallFs * 0.35);
    leftY += smallFs * 0.35 + 1;
  }
  if (businessInfo.tin || businessInfo.VRN) {
    const parts = [];
    if (businessInfo.tin) parts.push(`TIN: ${businessInfo.tin}`);
    if (businessInfo.VRN) parts.push(`VRN: ${businessInfo.VRN}`);
    doc.text(parts.join(" | "), textStartX, leftY + smallFs * 0.35);
    leftY += smallFs * 0.35 + 1;
  }

  // RIGHT side: Invoice type + details (right-aligned)
  let rightY = headerStartY;

  // Invoice type label
  const invoiceLabel =
    parseFloat(String(paymentInfo.amountDue || "0").replace(/,/g, "")) > 0
      ? t("credit_invoice") || "CREDIT INVOICE"
      : t("sales_invoice") || "SALES INVOICE";
  doc.setFontSize(titleFs);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text(invoiceLabel, headerRightX, rightY + titleFs * 0.38, { align: "right" });
  rightY += titleFs * 0.38 + 2;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(smallFs);
  doc.setFont("helvetica", "normal");

  // Invoice number
  const invLabel = `${t("invoice_no") || "Invoice No"}: `;
  const invNum = orderInfo.invoice_number || "N/A";
  doc.text(invLabel, headerRightX - doc.getTextWidth(invLabel + invNum), rightY + smallFs * 0.35);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RED);
  doc.text(invNum, headerRightX, rightY + smallFs * 0.35, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  rightY += smallFs * 0.35 + 1;

  // Sales Date
  if (orderInfo?.sales_date) {
    const sdLine = `${t("sales_date") || "Sales Date"}: ${formatDateLocalized(orderInfo.sales_date, settings)}`;
    doc.text(sdLine, headerRightX, rightY + smallFs * 0.35, { align: "right" });
    rightY += smallFs * 0.35 + 1;
  }

  // Printed on
  const printedLine = `${t("printed_on") || "Printed on"}: ${formattedDate}`;
  doc.text(printedLine, headerRightX, rightY + smallFs * 0.35, { align: "right" });
  rightY += smallFs * 0.35 + 1;

  // Issued by
  if (orderInfo.cashierName) {
    const issuedLine = `${t("issued_by") || "Issued by"}: ${orderInfo.cashierName}`;
    doc.text(issuedLine, headerRightX, rightY + smallFs * 0.35, { align: "right" });
    rightY += smallFs * 0.35 + 1;
  }

  y = Math.max(leftY, rightY) + 2;

  // Header border-bottom
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 3;

  // ── CUSTOMER + PAYMENT INFO (two columns) ────────────────
  const colLeftX = M;
  const colRightX = M + CW * 0.5;
  let custY = y;
  let payY = y;

  // Bill To
  doc.setFontSize(bodyFs);
  doc.setFont("helvetica", "bold");
  doc.text(`${t("bill_to") || "Bill To"}:`, colLeftX, custY + bodyFs * 0.38);
  custY += bodyFs * 0.38 + 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(smallFs);
  if (customerInfo.name) {
    doc.text(`${t("name") || "Name"}: ${customerInfo.name}`, colLeftX, custY + smallFs * 0.35);
    custY += smallFs * 0.35 + 1;
  }
  if (customerInfo.address) {
    doc.text(`${t("address") || "Address"}: ${customerInfo.address}`, colLeftX, custY + smallFs * 0.35);
    custY += smallFs * 0.35 + 1;
  }
  if (customerInfo.phone) {
    doc.text(`${t("phone") || "Phone"}: ${customerInfo.phone}`, colLeftX, custY + smallFs * 0.35);
    custY += smallFs * 0.35 + 1;
  }
  if (customerInfo.email) {
    doc.text(`${t("email") || "Email"}: ${customerInfo.email}`, colLeftX, custY + smallFs * 0.35);
    custY += smallFs * 0.35 + 1;
  }
  if (customerInfo.tin) {
    doc.text(`TIN: ${customerInfo.tin}`, colLeftX, custY + smallFs * 0.35);
    custY += smallFs * 0.35 + 1;
  }

  // Payment Info
  doc.setFontSize(bodyFs);
  doc.setFont("helvetica", "bold");
  doc.text(`${t("payment_info") || "Payment Info"}:`, colRightX, payY + bodyFs * 0.38);
  payY += bodyFs * 0.38 + 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(smallFs);
  if (paymentInfo.method) {
    doc.text(`${t("payment_method") || "Payment Method"}: ${t(paymentInfo.method) || paymentInfo.method}`, colRightX, payY + smallFs * 0.35);
    payY += smallFs * 0.35 + 1;
  }
  // Status
  const statusText = t(paymentInfo.status) || paymentInfo.status || "N/A";
  doc.text(`${t("status") || "Status"}: `, colRightX, payY + smallFs * 0.35);
  const statusLabelW = doc.getTextWidth(`${t("status") || "Status"}: `);
  if (paymentInfo.status === "paid") doc.setTextColor(22, 163, 74);
  else if (paymentInfo.status === "not_paid") doc.setTextColor(220, 38, 38);
  else if (paymentInfo.status === "partial_paid") doc.setTextColor(202, 138, 4);
  doc.text(statusText, colRightX + statusLabelW, payY + smallFs * 0.35);
  doc.setTextColor(0, 0, 0);
  payY += smallFs * 0.35 + 1;

  const due = parseFloat(String(paymentInfo.amountDue || "0").replace(/,/g, ""));
  if (due > 0) {
    doc.text(`${t("amount_due") || "Amount Due"}: ${fmt(paymentInfo.amountDue)}`, colRightX, payY + smallFs * 0.35);
    payY += smallFs * 0.35 + 1;
    if (paymentInfo.dueDate) {
      doc.text(`${t("due_date") || "Due Date"}: ${formatDateLocalized(paymentInfo.dueDate, settings)}`, colRightX, payY + smallFs * 0.35);
      payY += smallFs * 0.35 + 1;
    }
  }

  y = Math.max(custY, payY) + 2;

  // Customer section border-bottom
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 3;

  // ── ITEMS TABLE (5 columns with borders) ──────────────────
  const colWidths = {
    no: CW * 0.06,
    item: CW * 0.44,
    qty: CW * 0.10,
    price: CW * 0.20,
    total: CW * 0.20,
  };

  // Build table data
  const emptyRows = Math.max(0, minRows - items.length);
  const tableBody = items.map((item, i) => [
    `${i + 1}.`,
    item.name || "",
    fmt(item.quantity),
    fmt(item.price),
    fmt(parseFloat(item.price) * parseFloat(item.quantity)),
  ]);
  // Add empty rows
  for (let i = 0; i < emptyRows; i++) {
    tableBody.push(["", "", "", "", ""]);
  }

  autoTable(doc, {
    startY: y,
    head: [[t("no.") || "No.", t("item") || "Item", t("qty") || "Qty", t("unit_price") || "Unit Price", t("total") || "Total"]],
    body: tableBody,
    theme: "grid",
    margin: { left: M, right: M },
    tableWidth: CW,
    styles: {
      fontSize: smallFs,
      cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 },
      textColor: [0, 0, 0],
      font: "helvetica",
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: "bold",
      fontSize: smallFs,
      fillColor: [240, 245, 255],
      textColor: [0, 0, 0],
      lineColor: [180, 180, 180],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { halign: "center", cellWidth: colWidths.no },
      1: { halign: "left", cellWidth: colWidths.item },
      2: { halign: "center", cellWidth: colWidths.qty },
      3: { halign: "right", cellWidth: colWidths.price },
      4: { halign: "right", cellWidth: colWidths.total },
    },
  });

  y = doc.lastAutoTable.finalY + 3;

  // ── TOTALS SECTION (right-aligned, ~35% width) ────────────
  const totalsW = CW * (isA4 ? 0.33 : 0.36);
  const totalsX = W - M - totalsW;
  const labelX = totalsX;
  const valueX = W - M;

  const totalsRow = (label, value, bold = false) => {
    doc.setFontSize(smallFs);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lh = smallFs * 0.38;
    doc.text(label, labelX, y + lh);
    doc.text(String(value), valueX, y + lh, { align: "right" });
    y += lh + 1.5;
  };

  if (paymentInfo.subTotal) {
    totalsRow(`${t("subtotal") || "Subtotal"}:`, fmt(paymentInfo.subTotal));
  }
  if (settings.allowVAT) {
    totalsRow(
      `${t("tax") || "Tax"} (${settings.defaultTaxRate || 0}%):`,
      fmt(paymentInfo.taxAmount),
    );
  }
  if (settings.allowDiscount) {
    const discLabel =
      settings.defaultDiscountType === "percentage"
        ? `${t("discount") || "Discount"} (${paymentInfo.discountPercentage || 0}%):`
        : `${t("discount") || "Discount"}:`;
    totalsRow(discLabel, fmt(paymentInfo.amountDiscount));
    // border after discount
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(labelX, y - 0.5, valueX, y - 0.5);
  }

  // TOTAL (bold, with border)
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(labelX, y, valueX, y);
  y += 1;
  totalsRow(`${t("total") || "Total"}:`, fmt(paymentInfo.amountTotal), true);
  doc.line(labelX, y - 0.5, valueX, y - 0.5);

  if (settings.showChangeOnReceipt) {
    totalsRow(`${t("amount_paid") || "Amount Paid"}:`, fmt(paymentInfo.amountPaid));
    if (due > 0) {
      totalsRow(`${t("amount_due") || "Amount Due"}:`, fmt(paymentInfo.amountDue));
    }
    const change = parseFloat(String(paymentInfo.amountChange || "0").replace(/,/g, ""));
    if (due <= 0 && change >= 0) {
      totalsRow(`${t("change") || "Change"}:`, fmt(paymentInfo.amountChange));
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(labelX, y - 0.5, valueX, y - 0.5);
    }
  }

  y += 5;

  // ── FOOTER ──────────────────────────────────────────────
  // Border-top
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 4;

  const footer = businessInfo.footer || t("thank_you_for_your_business") || "Thank you for your business!";
  doc.setFontSize(smallFs);
  doc.setFont("helvetica", "normal");
  const footerW = doc.getTextWidth(footer);
  doc.text(footer, M + (CW - footerW) / 2, y + smallFs * 0.35);
  y += smallFs * 0.35 + 2;

  doc.setFontSize(p.poweredSize);
  doc.setTextColor(120, 120, 120);
  const powered = t("powered_by") || "Powered By BizTrack Software";
  const powW = doc.getTextWidth(powered);
  doc.text(powered, M + (CW - powW) / 2, y + p.poweredSize * 0.35);
  doc.setTextColor(0, 0, 0);

  return doc;
}

function renderReceipt(pageHeight, data, receiptSize) {
  const {
    businessInfo = {},
    orderInfo = {},
    customerInfo = {},
    paymentInfo = {},
    items = [],
    settings = {},
  } = data;

  const p = PAPER[receiptSize] || PAPER["80mm"];
  const dp = settings.defaultDecimalPlaces ?? 0;
  const isDocument = p.mode === "document";
  const measuring = !isDocument && pageHeight === null;

  const doc = new jsPDF({
    unit: "mm",
    format: isDocument
      ? [p.width, p.height]
      : [p.width, measuring ? 800 : pageHeight],
  });

  const W = p.width;
  const M = p.padding; // left/right margin
  const CW = W - M * 2; // content width
  let y = M; // cursor

  // ── Helpers ──────────────────────────────────────────────
  const fmt = (val) => {
    const num = parseFloat(String(val).replace(/,/g, ""));
    if (isNaN(num)) return "0";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    });
  };

  const fmtPrc = (val) => {
    const num = parseFloat(String(val).replace(/,/g, ""));
    if (isNaN(num)) return "0";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: dp,
    });
  };

  const now = new Date();
  const formatted =
    String(now.getDate()).padStart(2, "0") +
    "/" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "/" +
    now.getFullYear() +
    " " +
    String(now.getHours()).padStart(2, "0") +
    ":" +
    String(now.getMinutes()).padStart(2, "0") +
    ":" +
    String(now.getSeconds()).padStart(2, "0");


  /** Print centered text, returns nothing, advances y. */
  const centerText = (text, size, style = "normal") => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    const lines = doc.splitTextToSize(String(text), CW);
    const lh = size * 0.38; // line height in mm
    for (const line of lines) {
      const tw = doc.getTextWidth(line);
      doc.text(line, M + (CW - tw) / 2, y + lh);
      y += lh + p.lineGap * 0.3;
    }
  };

  /** Print a left-aligned label + right-aligned value on the same line. */
  const lrRow = (left, right, size = p.bodySize, style = "normal") => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    const lh = size * 0.38;
    const rightStr = String(right);
    const rw = doc.getTextWidth(rightStr);
    const leftMaxW = CW - rw - 1;
    const leftLines = doc.splitTextToSize(String(left), leftMaxW);
    for (let i = 0; i < leftLines.length; i++) {
      doc.text(leftLines[i], M, y + lh);
      if (i === 0) {
        doc.text(rightStr, W - M, y + lh, { align: "right" });
      }
      y += lh + p.lineGap * 0.3;
    }
  };

  /** Solid horizontal line (like border-b in CSS). */
  const solidLine = (thickness = 0.2) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(thickness);
    doc.line(M, y, W - M, y);
    y += 0.2;
  };

  /** Add vertical spacing (like mb-2 ≈ 0.5rem ≈ ~2mm on receipt). */
  const gap = (mm) => {
    y += mm || p.sectionGap;
  };

  // ── HEADER SECTION ──────────────────────────────────────
  // Logo
  if (settings.showLogoOnReceipt && businessInfo.logo) {
    try {
      const imgW = p.logoH; // approximate aspect ratio
      const imgX = M + (CW - imgW) / 2;
      doc.addImage(businessInfo.logo, "PNG", imgX, y, imgW, p.logoH);
      y += p.logoH + 1;
    } catch {
      // skip logo if it fails
    }
  }

  // Business name — text-base / text-sm, font-bold
  if (businessInfo.name) {
    centerText(businessInfo.name, p.headerSize, "bold");
    y += 0.3;
  }

  // Address — text-xs
  if (businessInfo.address) {
    centerText(businessInfo.address, p.infoSize);
  }

  // Email | Website — text-xs
  if (businessInfo.email || businessInfo.website) {
    const emailWeb = [];
    if (businessInfo.website) emailWeb.push(`Website: ${businessInfo.website}`);
    if (businessInfo.email) emailWeb.push(`Email: ${businessInfo.email}`);
    const sep = receiptSize === "58mm" ? " \n " : " \n ";
    centerText(emailWeb.join(sep), p.infoSize);
  }

  // Phone — text-xs
  if (businessInfo.phone) {
    centerText(`Tel: ${businessInfo.phone}`, p.infoSize);
  }

  // TIN | VRN — text-xs, on same line with | separator (80mm) or separate (58mm)
  if (businessInfo.tin || businessInfo.VRN) {
    const tinVrn = [];
    if (businessInfo.tin) tinVrn.push(`TIN: ${businessInfo.tin}`);
    if (businessInfo.VRN) tinVrn.push(`VRN: ${businessInfo.VRN}`);
    const sep = receiptSize === "58mm" ? " | " : " | ";
    centerText(tinVrn.join(sep), p.infoSize);
  }

  // Receipt type — font-semibold
  y += 0.5;
  const receiptType =
    parseFloat(String(paymentInfo.amountDue || "0").replace(/,/g, "")) > 0
      ? "CREDIT RECEIPT"
      : "CASH RECEIPT";
  centerText(receiptType, p.subHeaderSize, "bold");

  // border-b pb-1 → solid line + small gap
  y += 0.5;
  solidLine(0.2);
  gap(p.sectionGap);

  // ── TRANSACTION INFO ────────────────────────────────────
  lrRow("Receipt No:", orderInfo.invoice_number || "N/A", p.bodySize);
  lrRow("Payment:", t(paymentInfo.method) || "N/A", p.bodySize);
  if (orderInfo?.paymentInfo?.sales_date) {
    lrRow(
      "Sales Date:",
      formatDateLocalized(orderInfo.paymentInfo.sales_date, settings),
      p.bodySize,
    );
  }
  lrRow("Printed on:", formatted, p.bodySize);
  if (orderInfo.cashierName) {
    lrRow("Issued by:", orderInfo.cashierName, p.bodySize);
  }

  // border-b mb-2
  y += 1;
  solidLine(0.2);

  // ── CUSTOMER INFO ───────────────────────────────────────
  const hasCust = customerInfo.name || customerInfo.phone || customerInfo.tin;
  if (hasCust) {
    if (customerInfo.name) lrRow("Customer:", customerInfo.name, p.bodySize);
    if (customerInfo.phone) lrRow("Phone:", customerInfo.phone, p.bodySize);
    if (customerInfo.tin) lrRow("TIN:", customerInfo.tin, p.bodySize);
    gap(1);
  }

  // ── ITEMS TABLE ─────────────────────────────────────────

  const tableHead = [["Item", "Total"]];
  const tableBody = items.map((item) => {
    const total = parseFloat(item.price) * parseFloat(item.quantity);
    return [
      `${item.name}\n(${item.quantity} x ${fmtPrc(item.price)})`,
      fmt(total),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: tableHead,
    body: tableBody,
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
    headStyles: {
      fontStyle: "bold",
      fontSize: p.itemSize,
      cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
    },
    columnStyles: {
      0: { halign: "left", cellWidth: CW * 0.6, valign: "middle" },
      1: {
        halign: "right",
        cellWidth: CW * 0.4,
        valign: "middle",
        whitespace: "nowrap",
      },
    },
    // Draw border-t-2 border-b-2 on header, border-b border-gray-200 on body rows
    didParseCell: (hookData) => {
      if (hookData.section === "head") {
        if (hookData.column.index === 1) {
          hookData.cell.styles.halign = "right";
        }
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

  // ── TOTALS SECTION ──────────────────────────────────────
  solidLine(0.5); // border-t
  y += 0.5; // pt-2 equivalent

  if (paymentInfo.subTotal && (settings.allowDiscount || settings.allowVAT)) {
    lrRow("Subtotal:", formatCurrency(paymentInfo.subTotal, settings), p.bodySize);
  }
  if (settings.allowDiscount) {
    const dl =
      settings.defaultDiscountType === "percentage"
        ? `Discount (${paymentInfo.discountPercentage || 0}%):`
        : "Discount:";
    lrRow(dl, formatCurrency(paymentInfo.amountDiscount, settings), p.bodySize);
  }
  if (settings.allowVAT) {
    lrRow(
      `Tax (${settings.defaultTaxRate || 0}%):`,
      formatCurrency(paymentInfo.taxAmount, settings),
      p.bodySize,
    );
  }

  // TOTAL row — border-t border-b py-1 font-bold mt-1
  y += 0.5; // mt-1
  solidLine(0.2);
  y += 0.3;
  lrRow("TOTAL:", formatCurrency(paymentInfo.amountTotal, settings), p.totalLabelSize, "bold");

  // Paid / Due / Change — below the total line
  if (settings.showChangeOnReceipt) {
    y += 0.2; // py-1
    lrRow("Paid:", formatCurrency(paymentInfo.amountPaid, settings), p.bodySize);

    const due = parseFloat(
      String(paymentInfo.amountDue || "0").replace(/,/g, ""),
    );
    if (due > 0) {
      lrRow("Due:", formatCurrency(paymentInfo.amountDue, settings), p.bodySize);
    }

    const change = parseFloat(
      String(paymentInfo.amountChange || "0").replace(/,/g, ""),
    );
    if (due <= 0 && change >= 0) {
      lrRow("Change:", formatCurrency(paymentInfo.amountChange, settings), p.bodySize);
      // border-b on change row
    }
  }
  y += 0.3;
  solidLine(0.2);

  // border-b of the totals section
  y += 0.3;

  // ── QR CODE ─────────────────────────────────────────────
  y += p.sectionGap;

  // Generate QR code as a simple data matrix using jsPDF's built-in capabilities
  // Since jsPDF doesn't have a built-in QR generator, we draw a placeholder box
  // with the invoice text centered. For real QR, the logo/QR could be loaded async.
  //   const qrS = p.qrSize;
  //   const qrX = M + (CW - qrS) / 2;
  //   doc.setDrawColor(180, 180, 180);
  //   doc.setLineWidth(0.2);
  //   doc.rect(qrX, y, qrS, qrS);
  //   doc.setFontSize(p.poweredSize);
  //   doc.setFont("helvetica", "normal");
  //   doc.setTextColor(120, 120, 120);
  //   const qrLabel = `Invoice: ${orderInfo.invoice_number || ""}`;
  //   const qrTW = doc.getTextWidth(qrLabel);
  //   doc.text(qrLabel, M + (CW - qrTW) / 2, y + qrS / 2 + 1);
  //   doc.setTextColor(0, 0, 0);
  //   y += qrS + 1;

  // ── FOOTER ──────────────────────────────────────────────
  y += 2;

  const footer = businessInfo.footer || "Thank you for your business!";
  centerText(footer, p.footerSize);
  y += 0.5;
  doc.setTextColor(20, 20, 20);
  centerText("Powered By BizTrack Software", p.poweredSize);
  doc.setTextColor(0, 0, 0);

  y += 3; // bottom margin

  if (measuring) {
    return y; // return total height
  }
  return doc;
}

// Generate the receipt PDF and return as a base64 string (for QZ Tray printing).

export function generateReceiptPDFBase64(data, receiptSize = "80mm") {
  const doc = generateReceiptPDF(data, receiptSize);
  return doc.output("datauristring").split(",")[1];
}

// Generate the receipt PDF and return as a Blob URL for preview.
export function generateReceiptPDFUrl(data, receiptSize = "80mm") {
  const doc = generateReceiptPDF(data, receiptSize);
  const blob = doc.output("blob");
  return URL.createObjectURL(blob);
}
