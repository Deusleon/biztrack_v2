// utils/exportUtils.js
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { t } from "./i18n";
import { formatNumberWithCommas } from "./numberUtils";
import { formatDateLocalized } from "@/utils/formatDateLocalized";
import { getStoreSettings } from "@/services/SettingsService";

// The cache lives in its own tiny module so Configuration can clear it WITHOUT loading the PDF/Excel libraries.
import { pdfSettingsCache as cache, clearPdfSettingsCache } from "./pdfSettingsCache";
export { clearPdfSettingsCache };

const hasReadyPdfSettings = (settings) =>
  !!settings &&
  typeof settings === "object" &&
  (settings.defaultDecimalPlaces !== undefined ||
    settings.defaultCurrency !== undefined ||
    settings.defaultCurrencyPosition !== undefined ||
    settings.showCurrency !== undefined);

const normalizeStoreSettingsResponse = (response) => {
  const systemSettings = response?.data?.systemSettings || {};
  const storeSettings = response?.data?.storeSettings || {};

  return {
    ...(systemSettings.businessInfo || {}),
    ...(systemSettings.systemDefaults || {}),
    ...(storeSettings.operations || {}),
  };
};

const loadPdfSettings = async () => {
  if (cache.settings) return cache.settings;

  if (!cache.promise) {
    cache.promise = getStoreSettings()
      .then((response) => {
        cache.settings = normalizeStoreSettingsResponse(response);
        return cache.settings;
      })
      .catch((error) => {
        console.error("Failed to fetch settings for PDF export:", error);
        return {};
      })
      .finally(() => {
        cache.promise = null;
      });
  }

  return cache.promise;
};

const resolvePdfSettings = async (settings) => {
  if (hasReadyPdfSettings(settings)) return settings;
  return loadPdfSettings();
};

// Helper function to get display value
const getDisplayValue = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value.toString();
};

// Helper function to format currency with negative sign after currency symbol
const formatCurrencyWithNegative = (value, settings) => {
  if (!value && value !== 0) return "";

  const numValue = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(numValue)) return "";

  const isNegative = numValue < 0;
  const absValue = Math.abs(numValue);
  const decimals = settings?.defaultDecimalPlaces || 2;

  // Format the absolute value with commas
  const formattedNumber = formatNumberWithCommas(absValue.toFixed(decimals));

  // If showCurrency is disabled, return number with negative sign before
  if (!settings?.showCurrency) {
    return isNegative ? `-${formattedNumber}` : formattedNumber;
  }

  const currency = settings.defaultCurrency || "";
  const position = settings.defaultCurrencyPosition || "before";

  // Position currency and negative sign
  if (position === "after") {
    return isNegative ? `${formattedNumber} -${currency}` : `${formattedNumber} ${currency}`;
  } else {
    return isNegative ? `${currency} -${formattedNumber}` : `${currency} ${formattedNumber}`;
  }
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") value = JSON.stringify(value);

  let stringValue = value.toString();

  // Kama ina comma na ni number formatted, toa comma
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(stringValue)) {
    stringValue = stringValue.replace(/,/g, "");
  }

  return stringValue;
};

const getStoreNameForExport = (businessInfo = null, settings = null) => {
  const candidates = [
    businessInfo?.storeName,
    businessInfo?.store_name,
    businessInfo?.currentStoreName,
    settings?.storeName,
    settings?.store_name,
    settings?.currentStoreName,
  ];

  if (typeof localStorage !== "undefined") {
    candidates.push(localStorage.getItem("currentStoreName"));
  }

  return candidates.find(
    (value) => value !== null && value !== undefined && String(value).trim() !== "",
  ) || "";
};

const toHexByte = (value) =>
  Math.max(0, Math.min(255, Number(value) || 0))
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

const rgbToHex = (rgb) => safeRgb(rgb, FALLBACK_PRIMARY).map(toHexByte).join("");

const isNumericLike = (value) => {
  if (value === null || value === undefined || value === "") return false;
  const normalized = String(value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
  return normalized !== "" && !Number.isNaN(Number(normalized));
};

const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value !== "string") return parseFloat(value);
  // Cells are already formatted for display ("TSh 1,200.50", "Sh. 1,200", "-350.00"): take the first number in the text so a
  // currency symbol that contains a dot or a letter cannot change the total.
  const match = value.match(/-?\d[\d,]*(?:\.\d+)?/);
  return match ? parseFloat(match[0].replace(/,/g, "")) : NaN;
};

// withFooter can be `true` (legacy behavior) or an array of column keys.
// Columns can also opt-in via `total: true` (or `footerTotal: true`).
export const isFooterEnabled = (withFooter) =>
  withFooter === true || (Array.isArray(withFooter) && withFooter.length > 0);

export const resolveFooterTotalKeys = (
  withFooter,
  columns = [],
  fallbackKeys = [],
) => {
  if (Array.isArray(withFooter)) {
    const valid = withFooter.filter((key) =>
      columns.some((col) => col.key === key),
    );
    if (valid.length > 0) return valid;
  }

  const flagged = columns
    .filter((col) => col.total === true || col.footerTotal === true)
    .map((col) => col.key);
  if (flagged.length > 0) return flagged;

  return fallbackKeys.filter((key) => columns.some((col) => col.key === key));
};

// Human-readable date range for report headers. Returns "" when no dates
// are provided so callers can skip the line entirely.
export const buildDateRangeLabel = (fromDate, toDate, settings = {}) => {
  let from = "";
  let to = "";
  try {
    from = fromDate ? formatDateLocalized(fromDate, settings) : "";
    to = toDate ? formatDateLocalized(toDate, settings) : "";
  } catch {
    from = fromDate ? String(fromDate) : "";
    to = toDate ? String(toDate) : "";
  }

  if (from && to) return `${t("from_date")}: ${from} - ${t("to_date")}: ${to}`;
  if (from) return `${t("from_date")}: ${from}`;
  if (to) return `${t("to_date")}: ${to}`;
  return "";
};

// Build a footer row (array of cells) with totals for the chosen columns.
const buildTotalsRow = (rows, columns, totalKeys, totalLabel) => {
  const totalIndexes = totalKeys
    .map((key) => columns.findIndex((col) => col.key === key))
    .filter((idx) => idx >= 0);

  const totalRow = Array(columns.length).fill("");

  for (const idx of totalIndexes) {
    let sum = 0;
    for (const row of rows) {
      const numeric = parseNumericValue(row[idx]);
      if (!Number.isNaN(numeric)) sum += numeric;
    }
    totalRow[idx] = sum.toFixed(2);
  }

  // Label placement: right before a single totaled column when possible,
  // otherwise in the first non-totaled column.
  let labelIdx = -1;
  if (totalIndexes.length === 1 && totalIndexes[0] > 0) {
    labelIdx = totalIndexes[0] - 1;
  } else {
    labelIdx = columns.findIndex(
      (col, idx) =>
        !totalIndexes.includes(idx) &&
        col.key !== "image" &&
        col.key !== "image_url",
    );
  }
  if (labelIdx >= 0 && !totalIndexes.includes(labelIdx)) {
    totalRow[labelIdx] = totalLabel;
  }

  return totalRow;
};

export const exportToCSV = (
  data,
  filename,
  columns,
  title,
  withFooter = false,
  fromDate = null,
  toDate = null,
) => {
  try {
    const dateRangeLabel = buildDateRangeLabel(fromDate, toDate);
    const headers = columns.map((col) => t(col.title));
    const rows = data.map((row) =>
      columns.map((col) => escapeCSV(getDisplayValue(row[col.key])))
    );

    const footerEnabled = isFooterEnabled(withFooter);

    let totalRow = [];
    if (footerEnabled) {
      const totalKeys = resolveFooterTotalKeys(withFooter, columns, [
        columns[columns.length - 1]?.key,
      ]);
      totalRow = buildTotalsRow(rows, columns, totalKeys, t("total"));
    }

    const csvContent = [
      [title],
      ...(dateRangeLabel ? [[escapeCSV(dateRangeLabel)]] : []),
      headers,
      ...rows,
      ...(footerEnabled ? [totalRow] : []),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (error) {
    console.error("CSV export error:", error);
    return false;
  }
};

export const exportToXLSX = (
  data,
  filename,
  columns,
  title,
  withFooter = false,
  fromDate = null,
  toDate = null,
) => {
  try {
    const headers = columns.map((col) => t(col.title));
    const rows = (data || []).map((row) =>
      columns.map((col) => escapeCSV(getDisplayValue(row[col.key]))),
    );

    const storeName = getStoreNameForExport();
    let generatedOn = new Date().toLocaleString();
    try {
      generatedOn = formatDateLocalized(new Date(), {}) || generatedOn;
    } catch {
      // Keep native browser timestamp if localized formatter is unavailable here.
    }
    const columnCount = Math.max(columns.length, 1);
    const lastCol = XLSX.utils.encode_col(columnCount - 1);

    // Footer totals: columns come from withFooter (array), `total: true`
    // flags on column defs, or fall back to the last column (legacy).
    const footerEnabled = isFooterEnabled(withFooter);
    let totalRow = [];
    if (footerEnabled) {
      const totalKeys = resolveFooterTotalKeys(withFooter, columns, [
        columns[columns.length - 1]?.key,
      ]);
      totalRow = buildTotalsRow(rows, columns, totalKeys, t("total"));
    }

    const dateRangeLabel = buildDateRangeLabel(fromDate, toDate);

    const metaRows = [
      [`${t("store")}: ${storeName || t("n_a")}`],
      [`${t("generated_on")}: ${generatedOn}`],
      ...(dateRangeLabel ? [[dateRangeLabel]] : []),
    ];

    // Row index (0-based) of the table header row; everything above is meta.
    const headerRowIndex = 1 + metaRows.length;

    const sheetRows = [
      [title || t("report")],
      ...metaRows,
      headers,
      ...rows,
      ...(footerEnabled ? [totalRow] : []),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);

    worksheet["!merges"] = Array.from({ length: headerRowIndex }, (_, i) =>
      XLSX.utils.decode_range(`A${i + 1}:${lastCol}${i + 1}`),
    );

    worksheet["!autofilter"] = {
      ref: `A${headerRowIndex + 1}:${lastCol}${sheetRows.length}`,
    };

    // Some spreadsheet readers support this freeze metadata; unsupported readers ignore it safely.
    worksheet["!freeze"] = {
      xSplit: 0,
      ySplit: headerRowIndex + 1,
      topLeftCell: `A${headerRowIndex + 2}`,
      activePane: "bottomLeft",
      state: "frozen",
    };

    const primaryHex = rgbToHex(getPrimaryColorRGB());
    const border = {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } },
    };

    const titleStyle = {
      font: { bold: true, sz: 16, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: primaryHex } },
      alignment: { horizontal: "center", vertical: "center" },
    };

    const metaStyle = {
      font: { bold: true, sz: 10, color: { rgb: "374151" } },
      fill: { fgColor: { rgb: "F3F4F6" } },
      alignment: { horizontal: "center", vertical: "center" },
    };

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: primaryHex } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border,
    };

    const bodyStyle = (rowIndex) => ({
      font: { color: { rgb: "111827" }, sz: 10 },
      fill: { fgColor: { rgb: rowIndex % 2 === 0 ? "FFFFFF" : "F9FAFB" } },
      alignment: { vertical: "center", wrapText: true },
      border,
    });

    const footerStyle = {
      font: { bold: true, color: { rgb: "111827" } },
      fill: { fgColor: { rgb: "E5E7EB" } },
      alignment: { vertical: "center" },
      border,
    };

    const range = XLSX.utils.decode_range(worksheet["!ref"]);

    for (let R = range.s.r; R <= range.e.r; R += 1) {
      for (let C = range.s.c; C <= range.e.c; C += 1) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        if (!worksheet[cellRef]) continue;

        if (R === 0) {
          worksheet[cellRef].s = titleStyle;
        } else if (R < headerRowIndex) {
          worksheet[cellRef].s = metaStyle;
        } else if (R === headerRowIndex) {
          worksheet[cellRef].s = headerStyle;
        } else if (footerEnabled && R === range.e.r) {
          worksheet[cellRef].s = footerStyle;
        } else {
          worksheet[cellRef].s = bodyStyle(R);
          if (isNumericLike(worksheet[cellRef].v)) {
            worksheet[cellRef].s.alignment = {
              ...worksheet[cellRef].s.alignment,
              horizontal: "right",
            };
          }
        }
      }
    }

    worksheet["!rows"] = [
      { hpt: 24 },
      ...metaRows.map(() => ({ hpt: 18 })),
      { hpt: 22 },
      ...rows.map(() => ({ hpt: 18 })),
      ...(footerEnabled ? [{ hpt: 20 }] : []),
    ];

    worksheet["!cols"] = headers.map((header, index) => {
      const values = [header, ...rows.map((row) => row[index] || "")];
      if (footerEnabled) values.push(totalRow[index] || "");
      const maxLength = Math.max(
        ...values.map((value) => String(value).split("\n").reduce((m, part) => Math.max(m, part.length), 0)),
      );
      return { wch: Math.min(Math.max(maxLength + 3, 12), 42) };
    });

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: title || t("report"),
      Subject: `${title || t("report")} - ${storeName || t("store")}`,
      Author: "BizTrack",
      CreatedDate: new Date(),
    };

    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${filename}.xlsx`, {
      bookType: "xlsx",
      cellStyles: true,
    });
    return true;
  } catch (error) {
    console.error("Excel export error:", error);
    return false;
  }
};

// Helper: Get primary color from CSS variables
const FALLBACK_PRIMARY = [30, 58, 95];
const WHITE = [255, 255, 255];
const LABEL_COLOR = [107, 114, 128];
const VALUE_COLOR = [17, 24, 39];
const BORDER_COLOR = [229, 231, 235];
const SOFT_BG = [249, 250, 251];

const isValidRgbArray = (value) =>
  Array.isArray(value) &&
  value.length >= 3 &&
  value.slice(0, 3).every((part) => Number.isFinite(Number(part)));

const safeRgb = (value, fallback = VALUE_COLOR) => {
  if (!isValidRgbArray(value)) return fallback;
  return value.slice(0, 3).map((part) => Math.max(0, Math.min(255, Number(part))));
};

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
      if (isValidRgbArray(parts)) return safeRgb(parts, FALLBACK_PRIMARY);
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
  } catch (error) {
    console.error("Error getting primary color:", error);
    return FALLBACK_PRIMARY;
  }
};

const safeText = (value, fallback = "-") => {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
};

const _roundedRect = (doc, x, y, w, h, rx = 2, ry = 2, style = "S") => {
  if (typeof doc.roundedRect === "function") {
    doc.roundedRect(x, y, w, h, rx, ry, style);
  } else {
    doc.rect(x, y, w, h, style);
  }
};

const extractTextFromReactNode = (node) => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextFromReactNode).join("");
  if (node?.props?.children !== undefined) {
    return extractTextFromReactNode(node.props.children);
  }
  return getDisplayValue(node);
};

const getColumnDisplayValue = (row, col, index) => {
  if (col.key === "image") return "";

  if (col.render && typeof col.render === "function") {
    try {
      const rendered = col.render(row[col.key], row, index);
      return extractTextFromReactNode(rendered);
    } catch (error) {
      console.error(`Error rendering column ${col.key}:`, error);
      return getDisplayValue(row[col.key]);
    }
  }

  return getDisplayValue(row[col.key]);
};

const getBusinessValue = (businessInfo, settings, key, fallback = "") => {
  if (businessInfo?.[key] !== undefined && businessInfo?.[key] !== null) {
    return businessInfo[key];
  }
  if (settings?.[key] !== undefined && settings?.[key] !== null) {
    return settings[key];
  }
  return fallback;
};

// Helper: Convert image URL to base64
async function loadImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Image load error:", error);
    return null;
  }
}

export const exportToPDF = async (
  data,
  filename,
  columns,
  title = "",
  withFooter = false,
  businessInfo = null,
  settings,
  orientation = "portrait",
  columnStyles = {}, // Custom styling for specific columns
  fromDate = null,
  toDate = null,
) => {
  try {
    const resolvedSettings = await resolvePdfSettings(settings);

    const doc = new jsPDF({
      orientation: orientation === "landscape" ? "l" : "p",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const primaryColorRGB = safeRgb(getPrimaryColorRGB(), FALLBACK_PRIMARY);
    const imageMap = {};

    const M = orientation === "landscape" ? 8 : 9;
    const CONTENT_W = pageWidth - M * 2;
    const reportTitle = t(title) || title || t("report");
    const dateRange = buildDateRangeLabel(fromDate, toDate, resolvedSettings);
    const businessName =
      getBusinessValue(businessInfo, resolvedSettings, "businessName") ||
      getBusinessValue(businessInfo, resolvedSettings, "storeName") ||
      "BIZTRACK";
    const storeName = getStoreNameForExport(businessInfo, resolvedSettings);
    const storeDisplayName = storeName || businessName;

    doc.setProperties({
      title: `${filename}`,
      subject: `${reportTitle} - ${storeDisplayName}`,
      author: businessName,
    });

    // Load product images if any
    for (const row of data || []) {
      const url = row.image || row.image_url;
      if (url && !imageMap[url]) {
        imageMap[url] = await loadImageAsBase64(url);
      }
    }

    // Load business logo if available
    const logoBase64 = businessInfo?.logo?.preview || businessInfo?.logo || null;

    const addHeader = () => {
      const headerH = 26;
      doc.setFillColor(...primaryColorRGB);
      doc.rect(0, 0, pageWidth, headerH, "F");

      // Small decorative details without consuming vertical space.
      doc.setFillColor(255, 255, 255);
      doc.triangle(0, 0, 9, 0, 0, 20, "F");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.25);
      doc.circle(pageWidth - 9, 0.6, 1, "S");

      let headerX = M;
      if (logoBase64) {
        try {
          doc.addImage(logoBase64, "PNG", M, 6, 14, 14);
          headerX = M + 18;
        } catch (error) {
          headerX = M;
        }
      }

      // Business details — compact so the table gets more space.
      let headerY = 9;
      doc.setTextColor(...WHITE);
      doc.setFont(undefined, "bold");
      doc.setFontSize(14);
      doc.text(safeText(businessName, "BIZTRACK"), headerX, headerY);

      const contactLines = [
        getBusinessValue(businessInfo, resolvedSettings, "address"),
        getBusinessValue(businessInfo, resolvedSettings, "phone")
          ? `${t("phone")}: ${getBusinessValue(businessInfo, resolvedSettings, "phone")}`
          : null,
        getBusinessValue(businessInfo, resolvedSettings, "email")
          ? `${t("email_address")}: ${getBusinessValue(businessInfo, resolvedSettings, "email")}`
          : null,
      ].filter(Boolean);

      doc.setFont(undefined, "normal");
      doc.setFontSize(9.5);
      headerY += 4;
      contactLines.slice(0, 3).forEach((line) => {
        const lines = doc.splitTextToSize(safeText(line), pageWidth * 1);
        doc.text(lines.slice(0, 1), headerX, headerY);
        headerY += 4;
      });

      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      const titleLines = doc.splitTextToSize(`${reportTitle}`.toUpperCase(), 70);
      doc.text(titleLines.slice(0, 1), pageWidth - M, 8, { align: "right" });

      let rightY = 12.5;
      if (dateRange) {
        doc.setFontSize(8.5);
        doc.setFont(undefined, "normal");
        doc.text(dateRange, pageWidth - M, rightY, {
          align: "right",
        });
        rightY += 4.9;
      }

      doc.setFontSize(9.5);
      doc.setFont(undefined, "normal");
      doc.text(`${t("store")}: ${storeDisplayName}`, pageWidth - M, rightY, {
        align: "right",
      });
      doc.text(
        `${t("generated_on")}: ${formatDateLocalized(new Date(), resolvedSettings)}`,
        pageWidth - M,
        rightY + 4.2,
        { align: "right" },
      );
    };

    const addFooter = (pageNumber, totalPages) => {
      const footerY = pageHeight - 12;
      doc.setDrawColor(...BORDER_COLOR);
      doc.setLineWidth(0.3);
      doc.line(M, footerY, pageWidth - M, footerY);

      doc.setFont(undefined, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...LABEL_COLOR);
      doc.text(`${businessName} • ${storeDisplayName}`, M, footerY + 5);
      doc.text(`${t("page")} ${pageNumber} / ${totalPages}`, pageWidth - M, footerY + 5, {
        align: "right",
      });
      doc.text(t("powered_by"), pageWidth / 2, footerY + 5, {
        align: "center",
      });
    };

    // ==================== HEADER SECTION ====================
    addHeader();

    let currentY = 30;

    // ==================== BODY SECTION (TABLE) ====================
    const pdfColumns = columns.map((col) => ({
      header: t(col.title),
      dataKey: col.key,
      ...(col.halign && { halign: col.halign }),
      ...(col.cellWidth && { cellWidth: col.cellWidth }),
    }));

    const pdfRows = (data || []).map((row, index) =>
      Object.fromEntries(
        columns.map((col) => [
          col.key,
          getColumnDisplayValue(row, col, index),
        ]),
      ),
    );

    let grandTotalRowIndex = -1;
    const footerTotals = {}; // Store totals for styling logic

    const footerEnabled = isFooterEnabled(withFooter);

    if (footerEnabled) {
      // Total columns come from withFooter (array) or `total: true` flags;
      // legacy report columns remain the fallback.
      const totalColumns = resolveFooterTotalKeys(withFooter, columns, [
        "stock_worth",
        "potential_revenue",
        "potential_profit",
      ]);
      const labelKey =
        columns.find(
          (col) =>
            col.key !== "index" &&
            !totalColumns.includes(col.key) &&
            col.key !== "image" &&
            col.key !== "image_url",
        )?.key || columns[0]?.key;

      const totals = {};
      for (const colKey of totalColumns) {
        totals[colKey] = 0;
        for (const row of data || []) {
          const numeric = parseNumericValue(row[colKey]);
          if (!Number.isNaN(numeric)) totals[colKey] += numeric;
        }
      }

      Object.assign(footerTotals, totals);

      const footerRow = {};
      for (const col of columns) {
        if (col.key === labelKey) {
          footerRow[col.key] = t("total");
        } else if (totals[col.key] !== undefined) {
          const valueWithDecimals = parseFloat(
            totals[col.key].toFixed(resolvedSettings?.defaultDecimalPlaces || 2),
          );

          if (col.render && typeof col.render === "function") {
            try {
              footerRow[col.key] = extractTextFromReactNode(
                col.render(valueWithDecimals, { [col.key]: valueWithDecimals }),
              );
            } catch (error) {
              footerRow[col.key] = formatCurrencyWithNegative(valueWithDecimals, resolvedSettings);
            }
          } else {
            footerRow[col.key] = formatCurrencyWithNegative(valueWithDecimals, resolvedSettings);
          }
        } else {
          footerRow[col.key] = "";
        }
      }

      grandTotalRowIndex = pdfRows.length;
      pdfRows.push(footerRow);
    }

    const normalizedColumnStyles = Object.fromEntries(
      columns
        .filter((col) => col.halign || col.cellWidth)
        .map((col) => [
          col.key,
          {
            ...(col.halign && { halign: col.halign }),
            ...(col.cellWidth && { cellWidth: col.cellWidth }),
          },
        ]),
    );

    autoTable(doc, {
      startY: currentY,
      columns: pdfColumns,
      body: pdfRows,
      styles: {
        fontSize: orientation === "landscape" ? 8 : 9,
        overflow: "linebreak",
        cellPadding: { top: 1, right: 1.4, bottom: 1, left: 1.4 },
        textColor: VALUE_COLOR,
        lineColor: [235, 237, 240],
        lineWidth: 0.15,
        valign: "middle",
      },
      headStyles: {
        fillColor: primaryColorRGB,
        textColor: WHITE,
        fontStyle: "bold",
        toUpperCase: true,
        halign: "left",
        fontSize: orientation === "landscape" ? 8 : 9,
        cellPadding: { top: 1.3, right: 1.4, bottom: 1.3, left: 1.4 },
      },
      bodyStyles: {
        minCellHeight: 5,
      },
      columnStyles: normalizedColumnStyles,
      alternateRowStyles: {
        fillColor: [250, 251, 252],
      },
      margin: { top: 8, right: M, bottom: 16, left: M },
      showHead: "everyPage",

      didParseCell(dataCell) {
        // Apply alignment to header cells
        if (dataCell.section === "head") {
          const col = columns.find((c) => c.key === dataCell.column.dataKey);
          if (col?.halign) dataCell.cell.styles.halign = col.halign;
        }

        // Handle footer row styling first
        if (
          footerEnabled &&
          dataCell.section === "body" &&
          dataCell.row.index === grandTotalRowIndex
        ) {
          dataCell.cell.styles.fontStyle = "bold";
          dataCell.cell.styles.fillColor = [238, 242, 247];
          dataCell.cell.styles.fontSize = orientation === "landscape" ? 8 : 9;
          dataCell.cell.styles.textColor = VALUE_COLOR;

          const colKey = dataCell.column.dataKey;
          if (footerTotals[colKey] !== undefined) {
            const value = footerTotals[colKey];
            if (value < 0) {
              dataCell.cell.styles.textColor = [220, 38, 38];
            } else if (colKey === "potential_profit") {
              dataCell.cell.styles.textColor = [4, 120, 87];
            }
          }

          return;
        }

        // Apply custom column styling (only for non-footer rows)
        if (dataCell.section === "body" && dataCell.row.index < (data || []).length) {
          const colKey = dataCell.column.dataKey;
          const rowData = data[dataCell.row.index];
          if (!rowData || !columnStyles[colKey]) return;

          const style =
            typeof columnStyles[colKey] === "function"
              ? columnStyles[colKey](rowData[colKey], rowData)
              : columnStyles[colKey];

          if (!style || typeof style !== "object") return;

          if (isValidRgbArray(style.textColor)) {
            dataCell.cell.styles.textColor = safeRgb(style.textColor, VALUE_COLOR);
          }
          if (style.fontStyle) {
            dataCell.cell.styles.fontStyle = style.fontStyle;
          }
          if (isValidRgbArray(style.fillColor)) {
            dataCell.cell.styles.fillColor = safeRgb(style.fillColor, SOFT_BG);
          }
        }
      },

      didDrawCell(dataCell) {
        const { column, cell, row } = dataCell;
        if (dataCell.section === "body" && column.dataKey === "image") {
          const rowData = (data || [])[row.index];
          const url = rowData?.image || rowData?.image_url;
          const base64 = url ? imageMap[url] : null;
          if (base64) {
            const size = Math.min(5.5, cell.height - 1);
            const centerX = cell.x + (cell.width - size) / 2;
            const centerY = cell.y + (cell.height - size) / 2;
            doc.addImage(base64, "JPEG", centerX, centerY, size, size);
          }
        }
      },
    });

    // Footer on all pages after AutoTable has finished creating pages.
    const pageCount = doc.internal.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      doc.setPage(pageNumber);
      addFooter(pageNumber, pageCount);
    }

    const pdfBlob = doc.output("bloburl");
    window.open(pdfBlob, "_blank");
    return true;
  } catch (error) {
    console.error("PDF export error:", error);
    return false;
  }
};