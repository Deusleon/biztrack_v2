// path: frontend/src/utils/subscriptionReceiptPdf.js
//
// Generates a professional, branded PDF receipt for a single subscription
// payment (item #7). This is a BizTrack -> Store receipt (BizTrack is the
// seller here), so it's intentionally separate from receiptPdf.js, which
// prints a store's own POS sales receipts with the store's branding.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDateLocalized } from "@/utils/formatDateLocalized";

// BizTrack brand palette (matches the marketing site / product UI)
const BRAND = {
  accent: [22, 78, 99],       // #164E63 — deep teal
  accentMid: [14, 116, 144],  // #0E7490
  accentLight: [34, 166, 201],// #22A6C9
  text1: [11, 31, 38],        // #0B1F26
  text3: [108, 136, 145],     // #6C8891
  bg: [234, 243, 246],        // #EAF3F6
  success: [16, 130, 70],
  white: [255, 255, 255],
};

function toCurrency(amount, currency = "TZS") {
  return new Intl.NumberFormat("en-TZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

function friendlyPaymentMethod(transaction) {
  const method = transaction.payment_method && String(transaction.payment_method).trim();
  // Payment method as recorded (e.g. the actual mobile network channel)
  // is fine to show. What we never show is the raw processor/provider
  // name (e.g. "clickpesa") -- that's an implementation detail, not
  // something the store needs to see on their receipt.
  if (method && method.toLowerCase() !== "clickpesa") {
    return method.replace(/_/g, " ");
  }
  if (transaction.provider === "bank_transfer" || method === "bank_transfer") {
    return "Bank Transfer";
  }
  return "Mobile Money";
}

/**
 * The transaction history endpoint doesn't return explicit period
 * start/end columns, so derive the billing period the same way the
 * subscription itself is extended: one cycle length from the payment
 * date, based on billing_cycle.
 */
function getBillingPeriod(transaction) {
  const start = new Date(transaction.paid_at || transaction.created_at);
  if (isNaN(start.getTime())) return null;

  const end = new Date(start);
  switch (transaction.billing_cycle) {
    case "annual":
      end.setFullYear(end.getFullYear() + 1);
      break;
    case "quarterly":
      end.setMonth(end.getMonth() + 3);
      break;
    default:
      end.setMonth(end.getMonth() + 1);
  }

  return { start, end };
}

/**
 * @param {object} transaction - one row from GET /subscriptions/history
 * @param {object} store - { name } of the paying store, if available
 */
export function downloadSubscriptionReceipt(transaction, store = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  const paid = String(transaction.status || "").toLowerCase() === "paid";
  const statusLabel = paid ? "PAID" : String(transaction.status || "").toUpperCase();
  const receiptNo = transaction.provider_reference || transaction.request_id || String(transaction.id || "").slice(0, 12);
  const issuedDate = transaction.paid_at || transaction.created_at;

  // -- Header band --------------------------------------------------------
  doc.setFillColor(...BRAND.accent);
  doc.rect(0, 0, pageWidth, 34, "F");

  doc.setTextColor(...BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("BizTrack", margin, 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Sales & Inventory Management Platform", margin, 22.5);
  doc.text("biztrack.co.tz  ·  info@biztrack.co.tz", margin, 27.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SUBSCRIPTION RECEIPT", pageWidth - margin, 16, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`No. ${receiptNo}`, pageWidth - margin, 22.5, { align: "right" });
  doc.text(formatDateLocalized(issuedDate, { includeTime: true }), pageWidth - margin, 27.5, { align: "right" });

  // -- Status badge ---------------------------------------------------------
  const badgeColor = paid ? BRAND.success : [180, 60, 60];
  const badgeWidth = doc.getTextWidth(statusLabel) + 10;
  doc.setFillColor(...badgeColor);
  doc.roundedRect(pageWidth - margin - badgeWidth, 40, badgeWidth, 8, 2, 2, "F");
  doc.setTextColor(...BRAND.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(statusLabel, pageWidth - margin - badgeWidth / 2, 45.5, { align: "center" });

  // -- Billed to / Payment info ----------------------------------------------
  let y = 52;
  doc.setTextColor(...BRAND.text3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("BILLED TO", margin, y);
  doc.text("PAYMENT METHOD", margin + contentWidth / 2, y);

  y += 5.5;
  doc.setTextColor(...BRAND.text1);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(store?.name || "-", margin, y);
  doc.text(
    friendlyPaymentMethod(transaction),
    margin + contentWidth / 2,
    y,
  );

  // Billing period (start & end date this payment covers)
  const period = getBillingPeriod(transaction);
  if (period) {
    y += 9;
    doc.setTextColor(...BRAND.text3);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("BILLING PERIOD", margin, y);

    y += 5.5;
    doc.setTextColor(...BRAND.text1);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(
      `${formatDateLocalized(period.start)} — ${formatDateLocalized(period.end)}`,
      margin,
      y,
    );
  }

  y += 10;
  doc.setDrawColor(...BRAND.bg);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // -- Line item table --------------------------------------------------------
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3, left: 0, right: 0 }, textColor: BRAND.text1 },
    headStyles: {
      textColor: BRAND.text3,
      fontStyle: "bold",
      fontSize: 8.5,
      lineWidth: { bottom: 0.4 },
      lineColor: BRAND.bg,
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.55 },
      1: { cellWidth: contentWidth * 0.2, halign: "center" },
      2: { cellWidth: contentWidth * 0.25, halign: "right" },
    },
    head: [["DESCRIPTION", "BILLING CYCLE", "AMOUNT"]],
    body: [
      [
        `${transaction.plan_name || "Subscription"} plan`,
        (transaction.billing_cycle || "-").replace(/^\w/, (c) => c.toUpperCase()),
        toCurrency(transaction.amount, transaction.currency),
      ],
    ],
    margin: { left: margin, right: margin },
  });

  y = doc.lastAutoTable.finalY + 4;
  doc.setDrawColor(...BRAND.bg);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // -- Total --------------------------------------------------------------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.text3);
  doc.text("TOTAL PAID", margin, y);
  doc.setFontSize(15);
  doc.setTextColor(...BRAND.accent);
  doc.text(toCurrency(transaction.amount, transaction.currency), pageWidth - margin, y, { align: "right" });

  y += 14;

  // -- Footer ---------------------------------------------------------------
  doc.setDrawColor(...BRAND.bg);
  doc.setFillColor(...BRAND.bg);
  doc.rect(margin, y, contentWidth, 18, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.text1);
  doc.text(
    "This receipt confirms a subscription payment to BizTrack for continued access to the platform.",
    margin + 4,
    y + 7,
    { maxWidth: contentWidth - 8 },
  );
  doc.setTextColor(...BRAND.text3);
  doc.text("Thank you for using BizTrack.", margin + 4, y + 13);

  const filename = `biztrack-receipt-${String(receiptNo).slice(0, 20)}.pdf`;
  doc.save(filename);
}