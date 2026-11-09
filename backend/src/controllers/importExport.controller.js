// path: backend/controllers/importExport.controller.js
import { normalizeContactPhone } from '../utils/phoneNumber.js';
import pool from '../config/db.js';
import * as _n7 from 'xlsx';
const XLSX = _n7.default ?? _n7;
import * as _n8 from 'exceljs';
const ExcelJS = _n8.default ?? _n8;
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getLang } from '../utils/getLang.js';
import { addContactToGroup } from './messaging.controller.js';
// ─── Excel theme palette (ARGB 8-hex) ────────────────────────────────────────
const THEME_COLORS = {
  "default":   "FF1E3A5F",
  "slate-pro": "FF3B82F6",
  "midnight":  "FF818CF8",
  "ocean":     "FF0077B6",
  "emerald":   "FF059669",
  "rose":      "FFE11D48",
  "violet":    "FF7C3AED",
  "carbon":    "FF404040",
  "sunset":    "FFF97316",
  "aurora":    "FF06B6D4",
  "navy":      "FF1E40AF",
  "aqua":      "FF06B6D4",
};

const XL_RED      = "FFDC2626";
const XL_WHITE    = "FFFFFFFF";
const XL_LT_BLUE  = "FFDBEAFE";
const XL_GRAY_BG  = "FFF8FAFC";
const XL_BORDER   = "FFE2E8F0";

function themeColor(req) {
  const t = req.query.theme;
  return THEME_COLORS[t] || THEME_COLORS["default"];
}

function xlFill(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
function xlBorder(argb = XL_BORDER) {
  return {
    top: { style: "thin", color: { argb } }, bottom: { style: "thin", color: { argb } },
    left: { style: "thin", color: { argb } }, right: { style: "thin", color: { argb } },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getStoreOps(storeId) {
  const res = await pool.query(
    "SELECT settings->'operations' AS ops FROM store_settings WHERE store_id = $1", [storeId]);
  return res.rows[0]?.ops || {};
}

async function getPriceCategories(storeId) {
  const res = await pool.query(
    "SELECT id, name FROM price_categories WHERE store_id = $1 ORDER BY name", [storeId]);
  return res.rows;
}

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const cleanKey = k.replace(/\s*\*\s*$/, "").trim().toLowerCase().replace(/\s+/g, "_");
    out[cleanKey] = v;
  }
  return out;
}

function parseNum(val) {
  const s = String(val ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

function findDuplicateBarcodes(rows) {
  const counts = {};
  for (const rawRow of rows) {
    const row = normalizeRow(rawRow);
    const bc = row.barcode ? String(row.barcode).trim() : null;
    if (bc) counts[bc] = (counts[bc] || 0) + 1;
  }
  return new Set(Object.entries(counts).filter(([, n]) => n > 1).map(([bc]) => bc));
}

async function resolveCategoryId(client, storeId, catName) {
  if (!catName) return null;
  const trimmed = String(catName).trim();
  if (!trimmed) return null;
  const res = await client.query(
    "SELECT id FROM product_categories WHERE store_id = $1 AND name ILIKE $2 LIMIT 1",
    [storeId, trimmed]);
  if (res.rows[0]?.id) return res.rows[0].id;
  // Category not found — auto-create it so imported products are categorised correctly
  const ins = await client.query(
    "INSERT INTO product_categories (store_id, name) VALUES ($1, $2) RETURNING id",
    [storeId, trimmed]);
  return ins.rows[0].id;
}

async function findProductId(client, storeId, barcode, productName) {
  if (barcode) {
    const res = await client.query(
      "SELECT id FROM products WHERE store_id = $1 AND barcode = $2 LIMIT 1",
      [storeId, String(barcode).trim()]);
    if (res.rows.length > 0) return res.rows[0].id;
  }
  if (productName) {
    const res = await client.query(
      "SELECT id FROM products WHERE store_id = $1 AND name ILIKE $2 LIMIT 1",
      [storeId, String(productName).trim()]);
    if (res.rows.length > 0) return res.rows[0].id;
  }
  return null;
}

// ─── Excel template helpers ───────────────────────────────────────────────────

function applyHeaderRow(ws, colDefs, primary) {
  const row = ws.getRow(1);
  row.height = 24;
  colDefs.forEach((col, idx) => {
    const cell = row.getCell(idx + 1);
    if (col.required) {
      cell.value = {
        richText: [
          { text: col.name, font: { bold: true, color: { argb: XL_WHITE }, name: "Calibri", size: 11 } },
          { text: " *", font: { bold: true, color: { argb: XL_RED }, name: "Calibri", size: 12 } },
        ],
      };
    } else {
      cell.value = col.name;
      cell.font = { bold: true, color: { argb: XL_WHITE }, name: "Calibri", size: 11 };
    }
    cell.fill = xlFill(primary);
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top:    { style: "thin",   color: { argb: XL_WHITE } },
      bottom: { style: "medium", color: { argb: "FF1E40AF" } },
      left:   { style: "thin",   color: { argb: XL_WHITE } },
      right:  { style: "thin",   color: { argb: XL_WHITE } },
    };
    ws.getColumn(idx + 1).width = Math.max(col.name.length + 8, 18);
  });
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
}

function applyDataRow(ws, rowNum, values, highlight = false) {
  const row = ws.getRow(rowNum);
  values.forEach((val, idx) => {
    const cell = row.getCell(idx + 1);
    cell.value = val !== undefined && val !== null ? val : "";
    cell.fill = xlFill(highlight ? XL_LT_BLUE : XL_GRAY_BG);
    cell.border = xlBorder();
    cell.alignment = { horizontal: "left", vertical: "middle" };
  });
  row.height = 18;
}

function colDesc(colName, lang) {
  const key = "col_desc_" + colName.toLowerCase().replace(/\s*\/\s*/g, "_").replace(/\s+/g, "_");
  return t(key, lang) || `Value for "${colName}"`;
}

function addInstructionsSheet(wb, typeKey, colDefs, extraTips, lang, primary) {
  const ws = wb.addWorksheet(t("instr_sheet_name", lang) || "⚠ Instructions");
  ws.columns = [{ width: 26 }, { width: 60 }];

  // Title row
  const titleVal = t("instr_title_" + typeKey, lang);
  const titleRow = ws.addRow([titleVal, ""]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 2);
  const tc = titleRow.getCell(1);
  tc.value = titleVal;
  tc.font = { bold: true, size: 14, color: { argb: XL_WHITE }, name: "Calibri" };
  tc.fill = xlFill(primary);
  tc.alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 30;

  ws.addRow([""]); // spacer

  // Column guide header
  const ch = ws.addRow([t("instr_col_column", lang), t("instr_col_description", lang)]);
  ch.height = 20;
  ch.eachCell((cell) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = xlFill("FFE2E8F0");
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = xlBorder("FF94A3B8");
  });

  // Per-column rows
  colDefs.forEach((col) => {
    const desc = colDesc(col.name, lang);
    const r = ws.addRow([col.name + (col.required ? " *" : ""), desc]);
    r.height = 18;
    r.getCell(1).font = { bold: col.required, color: { argb: col.required ? XL_RED : "FF334155" }, size: 10 };
    r.getCell(2).font = { size: 10 };
    r.eachCell((cell) => {
      cell.border = xlBorder("FFCBD5E1");
      cell.alignment = { wrapText: true, vertical: "top" };
    });
  });

  ws.addRow([""]); // spacer

  // Tips title
  const tipsTitle = ws.addRow([t("instr_tips_title", lang), ""]);
  ws.mergeCells(tipsTitle.number, 1, tipsTitle.number, 2);
  const ttc = tipsTitle.getCell(1);
  ttc.value = t("instr_tips_title", lang);
  ttc.font = { bold: true, size: 12, color: { argb: XL_WHITE }, name: "Calibri" };
  ttc.fill = xlFill(primary);
  ttc.alignment = { horizontal: "center", vertical: "middle" };
  tipsTitle.height = 22;

  const baseTips = [
    t("instr_tip_required", lang),
    t("instr_tip_duplicates", lang),
    t("instr_tip_no_modify_cols", lang),
    t("instr_tip_no_modify_header", lang),
    t("instr_tip_sample_row", lang),
    t("instr_tip_comment_rows", lang),
  ];
  [...baseTips, ...extraTips].forEach((tip) => {
    const r = ws.addRow([`• ${tip}`, ""]);
    ws.mergeCells(r.number, 1, r.number, 2);
    r.getCell(1).font = { size: 10 };
    r.getCell(1).fill = xlFill(XL_GRAY_BG);
    r.getCell(1).border = xlBorder();
    r.height = 16;
  });
}

// ─── Row processors ───────────────────────────────────────────────────────────

async function processFullRows(client, rows, storeId, userId, lang, priceCategories, allowExpireDate) {
  const results = { success: 0, failed: 0, errors: [] };
  const CHUNK_SIZE = 500;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Build price category lookup: normalizedKey -> id
  const catLookup = {};
  for (const c of priceCategories) {
    catLookup[c.name.toLowerCase().replace(/\s+/g, "_")] = c.id;
    catLookup[c.name.toLowerCase()] = c.id;
  }
  const STANDARD_KEYS = new Set([
    "product_name", "product_category", "barcode", "unit", "alert_quantity", "current_stock",
    "batch_number", "cost_price", "selling_price", "manufactured_date", "expiry_date",
    "description", "status",
  ]);

  // ── Pre-load existing barcodes, names, and categories from DB ──────────────
  const [bcRes, nameRes, catRes] = await Promise.all([
    client.query("SELECT barcode FROM products WHERE store_id=$1 AND barcode IS NOT NULL", [storeId]),
    client.query("SELECT LOWER(name) AS lname FROM products WHERE store_id=$1", [storeId]),
    client.query("SELECT id, LOWER(name) AS lname FROM product_categories WHERE store_id=$1", [storeId]),
  ]);
  const existingBarcodes = new Set(bcRes.rows.map(r => r.barcode));
  const existingNames    = new Set(nameRes.rows.map(r => r.lname));
  const categoryCache    = new Map(catRes.rows.map(r => [r.lname, r.id]));

  // ── Duplicate-barcode detection within the file ────────────────────────────
  const dupBarcodes = findDuplicateBarcodes(rows);

  // ── Pass 1: validate all rows in memory (zero DB round-trips) ────────────
  const validRows = [];
  for (let i = 0; i < rows.length; i++) {
    const row = normalizeRow(rows[i]);
    const rowNum = i + 2;

    if (String(row.product_name || "").trimStart().startsWith("#")) continue;

    const productName = String(row.product_name || "").trim();
    if (!productName) {
      results.failed++;
      results.errors.push({ row: rowNum, errorKey: "product_name_required", error: "Product name is required" });
      continue;
    }

    const currentStock = parseNum(row.current_stock);
    if (currentStock === null || isNaN(currentStock) || currentStock < 0) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "current_stock_invalid", error: "Current Stock must be a valid non-negative number" });
      continue;
    }
    const costPrice = parseNum(row.cost_price);
    if (costPrice === null || isNaN(costPrice) || costPrice < 0) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "cost_price_required", error: "Cost Price is required and must be 0 or greater" });
      continue;
    }

    // Collect price-category data for this row
    const priceCatData = [];
    for (const [key, val] of Object.entries(row)) {
      if (STANDARD_KEYS.has(key)) continue;
      const catId = catLookup[key] || catLookup[key.replace(/_/g, " ")];
      if (!catId) continue;
      const p = parseNum(val);
      if (p !== null && !isNaN(p) && p >= 0) priceCatData.push({ catId, price: p });
    }

    const sellingPrice    = parseNum(row.selling_price);
    const hasSellingPrice = sellingPrice !== null && !isNaN(sellingPrice) && sellingPrice >= 0;
    if (!hasSellingPrice && priceCatData.length === 0) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "selling_price_required_full", error: "Selling Price is required and must be 0 or greater" });
      continue;
    }
    if (hasSellingPrice && costPrice > 0 && sellingPrice > 0 && sellingPrice < costPrice) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "selling_price_below_cost", params: { price: sellingPrice, costPrice }, error: `Selling price (${sellingPrice}) cannot be lower than cost price (${costPrice})` });
      continue;
    }
    const basePrice = hasSellingPrice ? sellingPrice : 0;

    const barcode = row.barcode ? String(row.barcode).trim() : null;
    if (barcode && dupBarcodes.has(barcode)) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "duplicate_barcode_in_file", params: { barcode }, error: `Barcode '${barcode}' appears more than once in this file` });
      continue;
    }
    // Duplicate checks against pre-loaded sets (no DB query)
    if (barcode && existingBarcodes.has(barcode)) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "product_barcode_exists", params: { barcode }, error: `Product with barcode '${barcode}' already exists` });
      continue;
    }
    if (!barcode && existingNames.has(productName.toLowerCase())) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "product_name_exists", params: { name: productName }, error: `Product '${productName}' already exists` });
      continue;
    }

    let status = "active";
    if (row.status) {
      const s = String(row.status).trim().toLowerCase();
      if (!["active", "inactive"].includes(s)) {
        results.failed++;
        results.errors.push({ row: rowNum, name: productName, errorKey: "invalid_status", params: { status: row.status }, error: `Invalid status '${row.status}'. Use 'active' or 'inactive'` });
        continue;
      }
      status = s;
    }

    const mfgDate = row.manufactured_date ? String(row.manufactured_date).trim() || null : null;
    const expDate  = row.expiry_date       ? String(row.expiry_date).trim()       || null : null;
    if (mfgDate && isNaN(Date.parse(mfgDate))) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "invalid_manufactured_date", params: { date: mfgDate }, error: `Invalid manufactured date '${mfgDate}' — use YYYY-MM-DD` });
      continue;
    }
    if (expDate && isNaN(Date.parse(expDate))) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "invalid_expiry_date", params: { date: expDate }, error: `Invalid expiry date '${expDate}' — use YYYY-MM-DD` });
      continue;
    }
    if (mfgDate && expDate && new Date(expDate) <= new Date(mfgDate)) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "expiry_before_mfg", error: "Expiry date must be after manufactured date" });
      continue;
    }
    if (allowExpireDate && expDate) {
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (new Date(expDate) < tomorrow) {
        results.failed++;
        results.errors.push({ row: rowNum, name: productName, errorKey: "expiry_date_too_soon", params: { date: expDate }, error: `Expiry date '${expDate}' is today or already expired — cannot import` });
        continue;
      }
    }

    // Price-category below-cost check
    let priceCatBelowCost = false;
    for (const { catId, price } of priceCatData) {
      if (price > 0 && costPrice > 0 && price < costPrice) {
        const catLabel = priceCategories.find(c => c.id === catId)?.name || catId;
        results.failed++;
        results.errors.push({ row: rowNum, name: productName, errorKey: "selling_price_below_cost", params: { category: catLabel, price, costPrice }, error: `Selling price for '${catLabel}' (${price}) is below cost price (${costPrice})` });
        priceCatBelowCost = true;
        break;
      }
    }
    if (priceCatBelowCost) continue;

    // Mark as "seen" so later rows don't pass the same barcode/name
    if (barcode) existingBarcodes.add(barcode);
    else existingNames.add(productName.toLowerCase());

    const alertQty    = parseNum(row.alert_quantity);
    const description = row.description ? String(row.description).trim() || null : null;
    const unit        = row.unit ? String(row.unit).trim() || "pc" : "pc";
    const catName     = row.product_category ? String(row.product_category).trim() : null;
    const batchNumber = row.batch_number ? String(row.batch_number).trim() || null : null;

    validRows.push({ rowNum, productName, barcode, catName, unit, description, status,
      currentStock, costPrice, basePrice, mfgDate, expDate, batchNumber, priceCatData,
      alertQty: isNaN(alertQty) ? null : alertQty });
  }

  if (validRows.length === 0) return results;

  // ── Pass 2a: batch-create any missing categories (1–2 DB queries) ─────────
  const catNameOriginal = new Map(); // lowercase -> original case
  for (const r of validRows) {
    if (r.catName) catNameOriginal.set(r.catName.toLowerCase(), r.catName);
  }
  const missingCatKeys = [...catNameOriginal.keys()].filter(k => !categoryCache.has(k));
  if (missingCatKeys.length > 0) {
    const vals = [], params = [];
    let idx = 1;
    for (const lk of missingCatKeys) {
      vals.push(`($${idx},$${idx + 1})`);
      params.push(storeId, catNameOriginal.get(lk));
      idx += 2;
    }
    const ins = await client.query(
      `INSERT INTO product_categories (store_id, name) VALUES ${vals.join(",")}
       ON CONFLICT DO NOTHING RETURNING id, LOWER(name) AS lname`, params);
    for (const r of ins.rows) categoryCache.set(r.lname, r.id);
    // Re-fetch any that were already present (ON CONFLICT skipped)
    const stillMissing = missingCatKeys.filter(k => !categoryCache.has(k));
    if (stillMissing.length > 0) {
      const sel = await client.query(
        `SELECT id, LOWER(name) AS lname FROM product_categories
         WHERE store_id=$1 AND LOWER(name) = ANY($2::text[])`,
        [storeId, stillMissing]);
      for (const r of sel.rows) categoryCache.set(r.lname, r.id);
    }
  }

  // ── Pass 2b: bulk insert in chunks ────────────────────────────────────────
  for (let ci = 0; ci < validRows.length; ci += CHUNK_SIZE) {
    const chunk = validRows.slice(ci, ci + CHUNK_SIZE);

    try {
      await client.query("SAVEPOINT chunk_sp");

      // 1. Bulk INSERT products
      const pVals = [], pParams = [];
      let pi = 1;
      for (const r of chunk) {
        const catId = r.catName ? (categoryCache.get(r.catName.toLowerCase()) ?? null) : null;
        pVals.push(`($${pi},$${pi+1},$${pi+2},$${pi+3},$${pi+4},$${pi+5},$${pi+6},$${pi+7},$${pi+8},$${pi+9})`);
        pParams.push(storeId, catId, r.productName, r.basePrice, r.costPrice,
          r.barcode, r.unit, r.alertQty, r.description, r.status);
        pi += 10;
      }
      const prodRes = await client.query(
        `INSERT INTO products
           (store_id, category_id, name, price, cost_price, barcode, unit,
            minimum_stock, description, status)
         VALUES ${pVals.join(",")} RETURNING id`, pParams);
      const productIds = prodRes.rows.map(r => r.id);

      // 2. Bulk INSERT inventory_batches
      const bVals = [], bParams = [];
      let bi = 1;
      for (let j = 0; j < chunk.length; j++) {
        const r = chunk[j];
        bVals.push(`($${bi},$${bi+1},$${bi+2},$${bi+3},$${bi+4},$${bi+5},$${bi+6},'active',$${bi+7})`);
        bParams.push(storeId, productIds[j], r.batchNumber || `BT-${today}-${r.rowNum}`,
          r.costPrice, r.basePrice, r.mfgDate, r.expDate, userId);
        bi += 8;
      }
      const batchRes = await client.query(
        `INSERT INTO inventory_batches
           (store_id, product_id, batch_number, cost_price, selling_price,
            manufacturing_date, expiry_date, status, created_by)
         VALUES ${bVals.join(",")} RETURNING id`, bParams);
      const batchIds = batchRes.rows.map(r => r.id);

      // 3. Bulk INSERT inventory_movements (only rows with stock > 0)
      const mVals = [], mParams = [];
      let mi = 1;
      for (let j = 0; j < chunk.length; j++) {
        if (chunk[j].currentStock > 0) {
          mVals.push(`($${mi},$${mi+1},$${mi+2},$${mi+3},'IN','bulk_import',$${mi+4}, NOW())`);
          mParams.push(batchIds[j], productIds[j], storeId, chunk[j].currentStock, userId);
          mi += 5;
        }
      }
      if (mVals.length > 0) {
        await client.query(
          `INSERT INTO inventory_movements
             (batch_id, product_id, store_id, quantity, type, note, created_by, transaction_date)
           VALUES ${mVals.join(",")}`, mParams);
      }

      // 4. Bulk INSERT selling_prices
      const sVals = [], sParams = [];
      let si = 1;
      for (let j = 0; j < chunk.length; j++) {
        for (const { catId, price } of chunk[j].priceCatData) {
          sVals.push(`($${si},$${si+1},$${si+2})`);
          sParams.push(batchIds[j], catId, price);
          si += 3;
        }
      }
      if (sVals.length > 0) {
        await client.query(
          `INSERT INTO selling_prices (batch_id, price_category_id, price)
           VALUES ${sVals.join(",")} ON CONFLICT DO NOTHING`, sParams);
      }

      results.success += chunk.length;
    } catch (chunkErr) {
      await client.query("ROLLBACK TO SAVEPOINT chunk_sp").catch(() => {});
      // Chunk failed — fall back to row-by-row so valid rows in this chunk still import
      for (const r of chunk) {
        try {
          await client.query("SAVEPOINT row_sp");
          const catId = r.catName ? (categoryCache.get(r.catName.toLowerCase()) ?? null) : null;
          const prodRes = await client.query(
            `INSERT INTO products
               (store_id, category_id, name, price, cost_price, barcode, unit,
                minimum_stock, description, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
            [storeId, catId, r.productName, r.basePrice, r.costPrice,
             r.barcode, r.unit, r.alertQty, r.description, r.status]);
          const productId = prodRes.rows[0].id;

          const batchRes = await client.query(
            `INSERT INTO inventory_batches
               (store_id, product_id, batch_number, cost_price, selling_price,
                manufacturing_date, expiry_date, status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8) RETURNING id`,
            [storeId, productId, r.batchNumber || `BT-${today}-${r.rowNum}`,
             r.costPrice, r.basePrice, r.mfgDate, r.expDate, userId]);
          const batchId = batchRes.rows[0].id;

          if (r.currentStock > 0) {
            await client.query(
              `INSERT INTO inventory_movements
                 (batch_id, product_id, store_id, quantity, type, note, created_by, transaction_date)
               VALUES ($1,$2,$3,$4,'IN','bulk_import',$5, NOW())`,
              [batchId, productId, storeId, r.currentStock, userId]);
          }
          for (const { catId: pcId, price } of r.priceCatData) {
            await client.query(
              "INSERT INTO selling_prices (batch_id, price_category_id, price) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
              [batchId, pcId, price]);
          }
          results.success++;
        } catch (rowErr) {
          await client.query("ROLLBACK TO SAVEPOINT row_sp").catch(() => {});
          results.failed++;
          results.errors.push({ row: r.rowNum, name: r.productName, errorKey: "import_row_error",
            params: { name: r.productName, detail: rowErr.message }, error: rowErr.message });
        }
      }
    }
  }
  return results;
}

async function processProductsRows(client, rows, storeId, lang) {
  const results = { success: 0, failed: 0, errors: [] };
  const dupBarcodes = findDuplicateBarcodes(rows);

  for (let i = 0; i < rows.length; i++) {
    const row    = normalizeRow(rows[i]);
    const rowNum = i + 2;

    if (String(row.product_name || "").trimStart().startsWith("#")) continue;

    const productName = String(row.product_name || "").trim();
    if (!productName) {
      results.failed++;
      results.errors.push({ row: rowNum, errorKey: "product_name_required", error: "Product name is required" });
      continue;
    }
    const unit = String(row.unit || "").trim();
    if (!unit) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "unit_required", params: { name: productName }, error: "Unit is required" });
      continue;
    }

    const barcode = row.barcode ? String(row.barcode).trim() : null;
    if (barcode && dupBarcodes.has(barcode)) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "duplicate_barcode_in_file", params: { barcode }, error: `Barcode '${barcode}' appears more than once in this file` });
      continue;
    }

    try {
      await client.query("SAVEPOINT row_sp");
      const categoryId  = await resolveCategoryId(client, storeId, row.product_category);
      const alertQty    = parseNum(row.alert_quantity);
      const description = row.description ? String(row.description).trim() || null : null;

      if (barcode) {
        const dup = await client.query(
          "SELECT id FROM products WHERE store_id=$1 AND barcode=$2 LIMIT 1", [storeId, barcode]);
        if (dup.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: rowNum, name: productName, errorKey: "product_barcode_exists", params: { barcode }, error: `Product with barcode '${barcode}' already exists` });
          continue;
        }
        await client.query(
          `INSERT INTO products (store_id, category_id, name, unit, minimum_stock, description, barcode, price, cost_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,0,0)`,
          [storeId, categoryId, productName, unit, isNaN(alertQty) ? null : alertQty, description, barcode]);
      } else {
        const dup = await client.query(
          "SELECT id FROM products WHERE store_id=$1 AND name ILIKE $2 LIMIT 1", [storeId, productName]);
        if (dup.rows.length > 0) {
          results.failed++;
          results.errors.push({ row: rowNum, name: productName, errorKey: "product_name_exists", params: { name: productName }, error: `Product '${productName}' already exists` });
          continue;
        }
        await client.query(
          `INSERT INTO products (store_id, category_id, name, unit, minimum_stock, description, price, cost_price)
           VALUES ($1,$2,$3,$4,$5,$6,0,0)`,
          [storeId, categoryId, productName, unit, isNaN(alertQty) ? null : alertQty, description]);
      }
      results.success++;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT row_sp").catch(() => {});
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "import_row_error", params: { name: productName, detail: err.message }, error: err.message });
    }
  }
  return results;
}

async function processStockRows(client, rows, storeId, userId, lang, allowExpireDate) {
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row    = normalizeRow(rows[i]);
    const rowNum = i + 2;

    if (String(row.product_name || "").trimStart().startsWith("#")) continue;

    const productName = String(row.product_name || "").trim();
    if (!productName) {
      results.failed++;
      results.errors.push({ row: rowNum, errorKey: "product_name_required", error: "Product name is required" });
      continue;
    }
    const barcode = row.barcode ? String(row.barcode).trim() : "";
    if (!barcode) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "barcode_required", params: { name: productName }, error: "Barcode is required for stock import" });
      continue;
    }
    const quantity = parseNum(row.quantity);
    if (quantity === null || isNaN(quantity) || quantity <= 0) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "quantity_invalid", params: { name: productName }, error: "Quantity must be a positive number" });
      continue;
    }

    const mfgDate = row.manufactured_date ? String(row.manufactured_date).trim() || null : null;
    const expDate  = row.expiry_date       ? String(row.expiry_date).trim()       || null : null;
    if (mfgDate && isNaN(Date.parse(mfgDate))) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "invalid_manufactured_date", params: { date: mfgDate }, error: `Invalid manufactured date '${mfgDate}'` });
      continue;
    }
    if (expDate && isNaN(Date.parse(expDate))) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "invalid_expiry_date", params: { date: expDate }, error: `Invalid expiry date '${expDate}'` });
      continue;
    }
    if (mfgDate && expDate && new Date(expDate) <= new Date(mfgDate)) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "expiry_before_mfg", params: { mfgDate, expDate }, error: "Expiry date must be after manufactured date" });
      continue;
    }
    if (allowExpireDate && expDate) {
      const tomorrow = new Date();
      tomorrow.setHours(0, 0, 0, 0);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (new Date(expDate) < tomorrow) {
        results.failed++;
        results.errors.push({ row: rowNum, name: productName, errorKey: "expiry_date_too_soon", params: { date: expDate }, error: `Expiry date '${expDate}' is today or already expired — cannot import` });
        continue;
      }
    }

    const productId = await findProductId(client, storeId, barcode, productName);
    if (!productId) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, identifier: barcode, errorKey: "product_not_found", params: { name: productName, identifier: barcode }, error: "Product not found — make sure the product exists before importing stock" });
      continue;
    }

    const batchNumber = row.batch_number ? String(row.batch_number).trim() : null;
    if (batchNumber) {
      const batchExists = await client.query(
        "SELECT id FROM inventory_batches WHERE store_id=$1 AND product_id=$2 AND batch_number=$3 LIMIT 1",
        [storeId, productId, batchNumber]);
      if (batchExists.rows.length > 0) {
        results.failed++;
        results.errors.push({ row: rowNum, name: productName, errorKey: "batch_exists", params: { name: productName, batchNumber }, error: `Batch '${batchNumber}' already exists for this product` });
        continue;
      }
    }

    try {
      await client.query("SAVEPOINT row_sp");
      const costPrice        = parseNum(row.cost_price);
      const finalBatchNumber = batchNumber || `IMPORT-${Date.now()}-${i}`;

      const batchRes = await client.query(
        `INSERT INTO inventory_batches
           (store_id, product_id, batch_number, cost_price, manufacturing_date, expiry_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7) RETURNING id`,
        [storeId, productId, finalBatchNumber,
         (costPrice !== null && !isNaN(costPrice)) ? costPrice : null,
         mfgDate, expDate, userId]);
      const batchId = batchRes.rows[0].id;

      await client.query(
        `INSERT INTO inventory_movements (batch_id, product_id, store_id, quantity, type, note, created_by, transaction_date)
         VALUES ($1,$2,$3,$4,'IN','bulk_import',$5, NOW())`,
        [batchId, productId, storeId, quantity, userId]);
      results.success++;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT row_sp").catch(() => {});
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "import_row_error", params: { name: productName, detail: err.message }, error: err.message });
    }
  }
  return results;
}

async function processPricesRows(client, rows, storeId, priceCategories, lang) {
  const results = { success: 0, failed: 0, errors: [] };

  const catById = {};
  for (const c of priceCategories) {
    catById[c.name.toLowerCase().replace(/\s+/g, "_")] = c.id;
    catById[c.name.toLowerCase()] = c.id;
  }
  const FIXED_KEYS = new Set(["product_name", "barcode", "batch_number", "cost_price", "manufactured_date", "expiry_date"]);

  for (let i = 0; i < rows.length; i++) {
    const row    = normalizeRow(rows[i]);
    const rowNum = i + 2;

    if (String(row.product_name || "").trimStart().startsWith("#")) continue;

    const productName = String(row.product_name || "").trim();
    if (!productName) {
      results.failed++;
      results.errors.push({ row: rowNum, errorKey: "product_name_required", error: "Product name is required" });
      continue;
    }
    const barcode = row.barcode ? String(row.barcode).trim() : "";
    if (!barcode) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "barcode_required", params: { name: productName }, error: "Barcode is required for price import" });
      continue;
    }

    const priceEntries = [];
    for (const [key, val] of Object.entries(row)) {
      if (FIXED_KEYS.has(key)) continue;
      const price = parseNum(val);
      if (price === null || isNaN(price) || price < 0) continue;
      const catId = catById[key] || catById[key.replace(/_/g, " ")];
      if (catId) priceEntries.push({ catId, price });
    }

    const fallbackPrice = parseNum(row.selling_price);
    const hasFallback   = fallbackPrice !== null && !isNaN(fallbackPrice) && fallbackPrice >= 0;

    if (priceEntries.length === 0 && !hasFallback) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "selling_price_required", params: { name: productName }, error: "At least one selling price must be provided" });
      continue;
    }

    // Validate: no selling price may be below cost price when cost price is provided in this row
    const rowCostPrice = parseNum(row.cost_price);
    if (rowCostPrice !== null && !isNaN(rowCostPrice) && rowCostPrice > 0) {
      let priceBelowCost = false;
      for (const { catId, price } of priceEntries) {
        if (price > 0 && price < rowCostPrice) {
          const catLabel = priceCategories.find(c => c.id === catId)?.name || catId;
          results.failed++;
          results.errors.push({ row: rowNum, name: productName, errorKey: "selling_price_below_cost", params: { category: catLabel, price, costPrice: rowCostPrice }, error: `Selling price for '${catLabel}' (${price}) is below cost price (${rowCostPrice})` });
          priceBelowCost = true;
          break;
        }
      }
      if (!priceBelowCost && hasFallback && fallbackPrice > 0 && fallbackPrice < rowCostPrice) {
        results.failed++;
        results.errors.push({ row: rowNum, name: productName, errorKey: "selling_price_below_cost", params: { price: fallbackPrice, costPrice: rowCostPrice }, error: `Selling price (${fallbackPrice}) is below cost price (${rowCostPrice})` });
        priceBelowCost = true;
      }
      if (priceBelowCost) continue;
    }

    const productId = await findProductId(client, storeId, barcode, productName);
    if (!productId) {
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, identifier: barcode, errorKey: "product_not_found", params: { name: productName, identifier: barcode }, error: "Product not found" });
      continue;
    }

    try {
      await client.query("SAVEPOINT row_sp");
      const batchNumber = row.batch_number ? String(row.batch_number).trim() : null;
      let batchId = null;
      if (batchNumber) {
        const res = await client.query(
          `SELECT id FROM inventory_batches WHERE product_id=$1 AND store_id=$2 AND batch_number=$3 AND status='active' LIMIT 1`,
          [productId, storeId, batchNumber]);
        if (res.rows.length > 0) batchId = res.rows[0].id;
      }
      if (!batchId) {
        const res = await client.query(
          `SELECT id FROM inventory_batches WHERE product_id=$1 AND store_id=$2 AND status='active' ORDER BY created_at DESC LIMIT 1`,
          [productId, storeId]);
        if (res.rows.length > 0) batchId = res.rows[0].id;
      }

      const costPrice = parseNum(row.cost_price);
      if (costPrice !== null && !isNaN(costPrice) && costPrice >= 0 && batchId) {
        await client.query(
          "UPDATE inventory_batches SET cost_price=$1, updated_at=NOW() WHERE id=$2",
          [costPrice, batchId]);
      }

      if (priceEntries.length > 0 && batchId) {
        for (const { catId, price } of priceEntries) {
          const upd = await client.query(
            "UPDATE selling_prices SET price=$1, updated_at=NOW() WHERE batch_id=$2 AND price_category_id=$3",
            [price, batchId, catId]);
          if (upd.rowCount === 0) {
            await client.query(
              "INSERT INTO selling_prices (batch_id, price_category_id, price) VALUES ($1,$2,$3)",
              [batchId, catId, price]);
          }
        }
      } else if (hasFallback) {
        await client.query(
          "UPDATE products SET price=$1, updated_at=NOW() WHERE id=$2 AND store_id=$3",
          [fallbackPrice, productId, storeId]);
      }
      results.success++;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT row_sp").catch(() => {});
      results.failed++;
      results.errors.push({ row: rowNum, name: productName, errorKey: "import_row_error", params: { name: productName, detail: err.message }, error: err.message });
    }
  }
  return results;
}

// ─── Template download ────────────────────────────────────────────────────────
export const downloadTemplate = async (req, res) => {
  const { type }   = req.params;
  const storeId    = req.user.current_store_id;
  const lang       = getLang(req);
  const primary    = themeColor(req);
  const validTypes = ["full", "products", "stock", "prices", "contacts"];
  if (!validTypes.includes(type)) return respondWithError(req, res, 400, "invalid_template_type");

  try {
    const ops             = await getStoreOps(storeId);
    const allowExpireDate = !!ops.allowExpireDate;
    const dateColDefs     = allowExpireDate
      ? [{ name: "Manufactured Date", required: false }, { name: "Expiry Date", required: false }]
      : [];
    const dateSample = allowExpireDate ? ["", ""] : [];

    const wb = new ExcelJS.Workbook();
    wb.creator = "BizTrack";
    wb.created = new Date();

    if (type === "full") {
      const priceCategories = await getPriceCategories(storeId);
      const catColDefs = priceCategories.length > 0
        ? priceCategories.map((c) => ({ name: c.name, required: true }))
        : [];

      const colDefs = [
        { name: "Product Name",     required: true  },
        { name: "Product Category", required: false },
        { name: "Barcode",          required: false },
        { name: "Unit",             required: false },
        { name: "Alert Quantity",   required: false },
        { name: "Current Stock",    required: true  },
        { name: "Batch Number",    required: false  },
        { name: "Cost Price",       required: true  },
        // { name: "Selling Price",    required: true  },
        ...catColDefs,
        ...dateColDefs,
        { name: "Description",      required: false },
        { name: "Status",           required: false },
      ];
      const catSamples = catColDefs.map(() => "");
      const ws = wb.addWorksheet("Products");
      applyHeaderRow(ws, colDefs, primary);
      applyDataRow(ws, 2,
        ["Sample Product", "Electronics", "1234567890", "pc", 5, 100, "BATCH-001", 750,
         ...catSamples, ...dateSample, "A sample product", "active"], true);
      addInstructionsSheet(wb, "full", colDefs, [
        t("tip_status_values", lang),
        ...(allowExpireDate ? [t("tip_date_format", lang)] : []),
        t("tip_barcode_dup_detect", lang),
        ...(priceCategories.length > 0
          ? [t("tip_price_cats_required", lang) + ": " + priceCategories.map((c) => c.name).join(", ")]
          : []),
      ], lang, primary);

    } else if (type === "products") {
      const colDefs = [
        { name: "Product Name",     required: true  },
        { name: "Product Category", required: false },
        { name: "Barcode",          required: false },
        { name: "Unit",             required: true  },
        { name: "Alert Quantity",   required: false },
        { name: "Description",      required: false },
      ];
      const ws = wb.addWorksheet("Products");
      applyHeaderRow(ws, colDefs, primary);
      applyDataRow(ws, 2, ["Sample Product", "Electronics", "1234567890", "pc", 5, "A sample product"], true);
      addInstructionsSheet(wb, "products", colDefs, [
        t("tip_unit_examples", lang),
        t("tip_barcode_unique", lang),
        t("tip_use_stock_import", lang),
      ], lang, primary);

    } else if (type === "stock") {
      const colDefs = [
        { name: "Product Name", required: true  },
        { name: "Barcode",      required: true  },
        { name: "Quantity",     required: true  },
        { name: "Batch Number", required: false },
        ...dateColDefs,
      ];
      const ws = wb.addWorksheet("Stock");
      applyHeaderRow(ws, colDefs, primary);

      const pRes = await pool.query(
        `SELECT CASE WHEN name LIKE '{%' THEN (name::jsonb)->>'en' ELSE name END AS product_name, barcode
         FROM products WHERE store_id = $1 AND status = 'active' ORDER BY product_name`,
        [storeId]);

      if (pRes.rows.length > 0) {
        pRes.rows.forEach((p, idx) => {
          applyDataRow(ws, idx + 2, [p.product_name, p.barcode ?? "", "", "", ...dateSample]);
        });
      } else {
        applyDataRow(ws, 2, ["Sample Product", "1234567890", 100, "BATCH-001", ...dateSample], true);
      }
      addInstructionsSheet(wb, "stock", colDefs, [
        t("tip_prefilled_product_name_barcode", lang),
        t("tip_fill_quantity", lang),
        t("tip_batch_optional", lang),
        ...(allowExpireDate ? [t("tip_date_format", lang)] : []),
        t("tip_batch_exists_skip", lang),
      ], lang, primary);

    } else if (type === "prices") {
      const priceCategories = await getPriceCategories(storeId);
      const catColDefs = priceCategories.length > 0
        ? priceCategories.map((c) => ({ name: c.name, required: true }))
        : [{ name: "Selling Price", required: true }];

      const colDefs = [
        { name: "Product Name", required: true  },
        { name: "Barcode",      required: true  },
        { name: "Batch Number", required: false },
        { name: "Cost Price",   required: false },
        ...catColDefs,
        ...dateColDefs,
      ];
      const ws = wb.addWorksheet("Prices");
      applyHeaderRow(ws, colDefs, primary);

      const prRes = await pool.query(
        `SELECT CASE WHEN p.name LIKE '{%' THEN (p.name::jsonb)->>'en' ELSE p.name END AS product_name,
                p.barcode, ib.batch_number, ib.cost_price
         FROM inventory_batches ib
         JOIN products p ON p.id = ib.product_id
         WHERE ib.store_id = $1 AND ib.status = 'active' AND p.status = 'active'
         ORDER BY product_name, ib.batch_number`,
        [storeId]);

      if (prRes.rows.length > 0) {
        prRes.rows.forEach((p, idx) => {
          const catBlanks = catColDefs.map(() => "");
          applyDataRow(ws, idx + 2, [p.product_name, p.barcode ?? "", p.batch_number, p.cost_price, ...catBlanks, ...dateSample]);
        });
      } else {
        const catSamples = catColDefs.map(() => 1000);
        applyDataRow(ws, 2, ["Sample Product", "1234567890", "BATCH-001", 750, ...catSamples, ...dateSample], true);
      }
      addInstructionsSheet(wb, "prices", colDefs, [
        t("tip_prefilled_product_batch", lang),
        t("tip_fill_prices", lang),
        ...(priceCategories.length > 0
          ? [t("tip_price_categories", lang) + ": " + priceCategories.map((c) => c.name).join(", ")]
          : [t("tip_no_price_categories", lang)]),
        t("tip_existing_prices_updated", lang),
      ], lang, primary);

    } else { // contacts
      const colDefs = [
        { name: "Name",  required: false },
        { name: "Phone", required: true  },
        { name: "Group", required: false },
      ];
      const ws = wb.addWorksheet("Contacts");
      applyHeaderRow(ws, colDefs, primary);
      applyDataRow(ws, 2, ["John Mwakalinga", "255712345678", "Wholesale Customers"], true);
      addInstructionsSheet(wb, "contacts", colDefs, [
        t("tip_contact_phone_format", lang) || "Use international format without '+', e.g. 255712345678.",
        t("tip_contact_group_auto_create", lang) || "If 'Group' doesn't exist yet, it will be created automatically. Leave it blank to add the contact without a group.",
        t("tip_contact_group_is_subgroup", lang) || "To target a subgroup, write it as 'Parent Group / Subgroup' — the contact will be added to both.",
        t("tip_contact_phone_dedup", lang) || "A phone number that already exists for your store is reused, not duplicated.",
      ], lang, primary);
    }

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${type}_import_template.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error("Download template error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── Export SQL ───────────────────────────────────────────────────────────────
const EXPORT_SQL = {
  full: `
    SELECT
      CASE WHEN p.name LIKE '{%' THEN (p.name::jsonb)->>'en' ELSE p.name END AS product_name,
      pc.name AS product_category,
      p.barcode, p.unit,
      COALESCE((
        SELECT SUM(CASE WHEN im2.type='IN' THEN im2.quantity WHEN im2.type IN ('OUT','ADJUSTMENT') THEN -im2.quantity ELSE 0 END)
        FROM inventory_batches ib2 JOIN inventory_movements im2 ON im2.batch_id=ib2.id
        WHERE ib2.product_id=p.id AND ib2.store_id=p.store_id AND ib2.status='active'
      ),0) AS current_stock,
      p.minimum_stock AS alert_quantity, lb.cost_price, p.price AS selling_price,
      lb.manufacturing_date AS manufactured_date, lb.expiry_date,
      p.description, p.status
    FROM products p
    LEFT JOIN product_categories pc ON pc.id=p.category_id
    LEFT JOIN LATERAL (
      SELECT cost_price, manufacturing_date, expiry_date FROM inventory_batches
      WHERE product_id=p.id AND store_id=p.store_id AND status='active' ORDER BY created_at DESC LIMIT 1
    ) lb ON true
    WHERE p.store_id=$1 ORDER BY product_name`,

  products: `
    SELECT CASE WHEN p.name LIKE '{%' THEN (p.name::jsonb)->>'en' ELSE p.name END AS product_name,
      pc.name AS product_category, p.barcode, p.unit, p.minimum_stock AS alert_quantity, p.description
    FROM products p LEFT JOIN product_categories pc ON pc.id=p.category_id
    WHERE p.store_id=$1 ORDER BY product_name`,

  stock: `
    SELECT CASE WHEN p.name LIKE '{%' THEN (p.name::jsonb)->>'en' ELSE p.name END AS product_name,
      p.barcode, ib.batch_number,
      COALESCE(SUM(CASE WHEN im.type='IN' THEN im.quantity WHEN im.type IN ('OUT','ADJUSTMENT') THEN -im.quantity ELSE 0 END),0) AS quantity,
      ib.cost_price, ib.manufacturing_date, ib.expiry_date
    FROM inventory_batches ib JOIN products p ON p.id=ib.product_id
    LEFT JOIN inventory_movements im ON im.batch_id=ib.id
    WHERE ib.store_id=$1 AND ib.status='active'
    GROUP BY p.name,p.barcode,ib.batch_number,ib.cost_price,ib.manufacturing_date,ib.expiry_date
    ORDER BY product_name, ib.batch_number`,

  prices_pivot: `
    SELECT CASE WHEN p.name LIKE '{%' THEN (p.name::jsonb)->>'en' ELSE p.name END AS product_name,
      p.barcode, ib.batch_number, ib.cost_price, ib.manufacturing_date, ib.expiry_date,
      cat.name AS price_category, COALESCE(sp.price, p.price) AS selling_price
    FROM products p
    JOIN inventory_batches ib ON ib.product_id=p.id AND ib.store_id=p.store_id AND ib.status='active'
    LEFT JOIN selling_prices sp ON sp.batch_id=ib.id
    LEFT JOIN price_categories cat ON cat.id=sp.price_category_id
    WHERE p.store_id=$1 ORDER BY product_name, ib.batch_number`,
};

// ─── Export endpoint ──────────────────────────────────────────────────────────
export const exportData = async (req, res) => {
  const { type }   = req.params;
  const storeId    = req.user.current_store_id;
  const validTypes = ["full", "products", "stock", "prices"];
  if (!validTypes.includes(type)) return respondWithError(req, res, 400, "invalid_export_type");

  try {
    const ops             = await getStoreOps(storeId);
    const allowExpireDate = !!ops.allowExpireDate;
    const wb              = XLSX.utils.book_new();

    if (type === "full") {
      const columns  = ["Product Name","Product Category","Barcode","Unit","Current Stock","Alert Quantity","Cost Price","Selling Price",
                        ...(allowExpireDate ? ["Manufactured Date","Expiry Date"] : []),"Description","Status"];
      const result   = await pool.query(EXPORT_SQL.full, [storeId]);
      const dataRows = result.rows.map((r) => {
        const base  = [r.product_name,r.product_category,r.barcode,r.unit,r.current_stock,r.alert_quantity,r.cost_price,r.selling_price];
        const dates = allowExpireDate ? [r.manufactured_date||"",r.expiry_date||""] : [];
        return [...base,...dates,r.description,r.status];
      });
      const ws = XLSX.utils.aoa_to_sheet([columns,...dataRows]);
      ws["!cols"] = columns.map(()=>({wch:22}));
      XLSX.utils.book_append_sheet(wb,ws,"Products");

    } else if (type === "products") {
      const columns  = ["Product Name","Product Category","Barcode","Unit","Alert Quantity","Description"];
      const result   = await pool.query(EXPORT_SQL.products,[storeId]);
      const dataRows = result.rows.map((r)=>[r.product_name,r.product_category,r.barcode,r.unit,r.alert_quantity,r.description]);
      const ws = XLSX.utils.aoa_to_sheet([columns,...dataRows]);
      ws["!cols"] = columns.map(()=>({wch:22}));
      XLSX.utils.book_append_sheet(wb,ws,"Products");

    } else if (type === "stock") {
      const columns  = ["Product Name","Barcode","Quantity","Batch Number",
                        ...(allowExpireDate ? ["Manufactured Date","Expiry Date"] : [])];
      const result   = await pool.query(EXPORT_SQL.stock,[storeId]);
      const dataRows = result.rows.map((r)=>{
        const base  = [r.product_name,r.barcode,r.quantity,r.batch_number];
        const dates = allowExpireDate ? [r.manufacturing_date||"",r.expiry_date||""] : [];
        return [...base,...dates];
      });
      const ws = XLSX.utils.aoa_to_sheet([columns,...dataRows]);
      ws["!cols"] = columns.map(()=>({wch:22}));
      XLSX.utils.book_append_sheet(wb,ws,"Stock");

    } else { // prices
      const priceCategories = await getPriceCategories(storeId);
      const catNames = priceCategories.map((c)=>c.name);
      const columns  = ["Product Name","Barcode","Batch Number","Cost Price",...catNames,
                        ...(allowExpireDate ? ["Manufactured Date","Expiry Date"] : [])];
      const result   = await pool.query(EXPORT_SQL.prices_pivot,[storeId]);
      const map      = new Map();
      for (const r of result.rows) {
        const key = `${r.barcode}||${r.batch_number}`;
        if (!map.has(key)) map.set(key,{product_name:r.product_name,barcode:r.barcode,batch_number:r.batch_number,cost_price:r.cost_price,manufacturing_date:r.manufacturing_date,expiry_date:r.expiry_date,prices:{}});
        if (r.price_category) map.get(key).prices[r.price_category]=r.selling_price;
      }
      const dataRows = Array.from(map.values()).map((item)=>{
        const base  = [item.product_name,item.barcode,item.batch_number,item.cost_price];
        const cats  = catNames.map((n)=>item.prices[n]??"");
        const dates = allowExpireDate ? [item.manufacturing_date||"",item.expiry_date||""] : [];
        return [...base,...cats,...dates];
      });
      const ws = XLSX.utils.aoa_to_sheet([columns,...dataRows]);
      ws["!cols"] = columns.map(()=>({wch:22}));
      XLSX.utils.book_append_sheet(wb,ws,"Prices");
    }

    const buffer  = XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
    const dateStr = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition",`attachment; filename="${type}_export_${dateStr}.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error("Export data error:",err.message);
    return respondWithError(req,res,500,"server_error");
  }
};

// ─── Import helpers ───────────────────────────────────────────────────────────

function buildImportHandler(type, processor) {
  return async (req, res) => {
    const storeId   = req.user.current_store_id;
    const userId    = req.user.id;
    const lang      = getLang(req);
    const confirmed = req.query.confirmed === "true";

    if (!req.file) return res.status(400).json({ message: t("no_file_uploaded", lang) || "No file uploaded" });

    try {
      const wb   = XLSX.read(req.file.buffer, { type: "buffer" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (rows.length === 0) return res.status(400).json({ message: t("file_is_empty", lang) || "File is empty" });

      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = 0");
        await client.query("BEGIN");
        const results = await processor(client, rows, storeId, userId, lang);
        
        // If partial and user hasn't confirmed yet — rollback and ask
        if (results.failed > 0 && results.success > 0 && !confirmed) {
          await client.query("ROLLBACK");
          return res.status(200).json({
            requiresConfirmation: true,
            results,
            message: t("import_requires_confirmation", lang) || `${results.failed} rows have errors. ${results.success} rows are valid.`,
          });
        }

        await client.query("COMMIT");
        await pool.query(
          "INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1,$2,$3,$4)",
          [userId, `import_${type}`, `Import ${type}: ${results.success} succeeded, ${results.failed} failed`, storeId]);
        return res.status(200).json({ message: t("import_complete", lang), results });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally { client.release(); }
    } catch (err) {
      console.error(`Import ${type} error:`, err.message);
      return respondWithError(req, res, 500, "server_error");
    }
  };
}

export const importFull = async (req, res) => {
  const storeId   = req.user.current_store_id;
  const userId    = req.user.id;
  const lang      = getLang(req);
  const confirmed = req.query.confirmed === "true";

  if (!req.file) return res.status(400).json({ message: t("no_file_uploaded", lang) || "No file uploaded" });

  try {
    const [wb, priceCategories, ops] = await Promise.all([
      Promise.resolve(XLSX.read(req.file.buffer, { type: "buffer" })),
      getPriceCategories(storeId),
      getStoreOps(storeId),
    ]);
    const allowExpireDate = !!ops.allowExpireDate;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (rows.length === 0) return res.status(400).json({ message: t("file_is_empty", lang) || "File is empty" });

    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 0");
      await client.query("BEGIN");
      const results = await processFullRows(client, rows, storeId, userId, lang, priceCategories, allowExpireDate);

      if (results.failed > 0 && results.success > 0 && !confirmed) {
        await client.query("ROLLBACK");
        return res.status(200).json({
          requiresConfirmation: true,
          results,
          message: t("import_requires_confirmation", lang) || `${results.failed} rows have errors. ${results.success} rows are valid.`,
        });
      }

      await client.query("COMMIT");
      await pool.query(
        "INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1,$2,$3,$4)",
        [userId, "import_full", `Full import: ${results.success} succeeded, ${results.failed} failed`, storeId]);
      return res.status(200).json({ message: t("import_complete", lang), results });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("Import full error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

export const importProducts = async (req, res) => {
  const storeId   = req.user.current_store_id;
  const lang      = getLang(req);
  const userId    = req.user.id;
  const confirmed = req.query.confirmed === "true";

  if (!req.file) return res.status(400).json({ message: t("no_file_uploaded", lang) || "No file uploaded" });

  try {
    const wb   = XLSX.read(req.file.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (rows.length === 0) return res.status(400).json({ message: t("file_is_empty", lang) || "File is empty" });

    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 0");
      await client.query("BEGIN");
      const results = await processProductsRows(client, rows, storeId, lang);

      if (results.failed > 0 && results.success > 0 && !confirmed) {
        await client.query("ROLLBACK");
        return res.status(200).json({
          requiresConfirmation: true,
          results,
          message: t("import_requires_confirmation", lang) || `${results.failed} rows have errors. ${results.success} rows are valid.`,
        });
      }

      await client.query("COMMIT");
      await pool.query(
        "INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1,$2,$3,$4)",
        [userId, "import_products", `Imported ${results.success} products (${results.failed} failed)`, storeId]);
      return res.status(200).json({ message: t("import_complete", lang), results });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("Import products error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

export const importStock = async (req, res) => {
  const storeId   = req.user.current_store_id;
  const userId    = req.user.id;
  const lang      = getLang(req);
  const confirmed = req.query.confirmed === "true";

  if (!req.file) return res.status(400).json({ message: t("no_file_uploaded", lang) || "No file uploaded" });

  try {
    const ops = await getStoreOps(storeId);
    const allowExpireDate = !!ops.allowExpireDate;
    const wb   = XLSX.read(req.file.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (rows.length === 0) return res.status(400).json({ message: t("file_is_empty", lang) || "File is empty" });

    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 0");
      await client.query("BEGIN");
      const results = await processStockRows(client, rows, storeId, userId, lang, allowExpireDate);

      if (results.failed > 0 && results.success > 0 && !confirmed) {
        await client.query("ROLLBACK");
        return res.status(200).json({
          requiresConfirmation: true,
          results,
          message: t("import_requires_confirmation", lang) || `${results.failed} rows have errors. ${results.success} rows are valid.`,
        });
      }

      await client.query("COMMIT");
      await pool.query(
        "INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1,$2,$3,$4)",
        [userId, "import_stock", `Imported stock: ${results.success} batches (${results.failed} failed)`, storeId]);
      return res.status(200).json({ message: t("import_complete", lang), results });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("Import stock error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

export const importPrices = async (req, res) => {
  const storeId   = req.user.current_store_id;
  const userId    = req.user.id;
  const lang      = getLang(req);
  const confirmed = req.query.confirmed === "true";

  if (!req.file) return res.status(400).json({ message: t("no_file_uploaded", lang) || "No file uploaded" });

  try {
    const [wb, priceCategories] = await Promise.all([
      Promise.resolve(XLSX.read(req.file.buffer, { type: "buffer" })),
      getPriceCategories(storeId),
    ]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (rows.length === 0) return res.status(400).json({ message: t("file_is_empty", lang) || "File is empty" });

    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 0");
      await client.query("BEGIN");
      const results = await processPricesRows(client, rows, storeId, priceCategories, lang);

      if (results.failed > 0 && results.success > 0 && !confirmed) {
        await client.query("ROLLBACK");
        return res.status(200).json({
          requiresConfirmation: true,
          results,
          message: t("import_requires_confirmation", lang) || `${results.failed} rows have errors. ${results.success} rows are valid.`,
        });
      }

      await client.query("COMMIT");
      await pool.query(
        "INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1,$2,$3,$4)",
        [userId, "import_prices", `Updated prices: ${results.success} rows (${results.failed} failed)`, storeId]);
      return res.status(200).json({ message: t("import_complete", lang), results });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("Import prices error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

// ─── Contacts import ────────────────────────────────────────────────────────
// "Group" column supports "Parent / Subgroup" syntax. Missing groups are
// created automatically. Adding to a subgroup also adds to its parent,
// via the same addContactToGroup() rule the Messaging UI uses.
async function resolveGroupPath(client, storeId, groupPath) {
  const parts = String(groupPath).split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const findOrCreate = async (name, parentGroupId) => {
    const existing = await client.query(
      `SELECT id FROM messaging_groups
       WHERE store_id = $1 AND lower(name) = lower($2)
         AND parent_group_id ${parentGroupId ? "= $3" : "IS NULL"}
       LIMIT 1`,
      parentGroupId ? [storeId, name, parentGroupId] : [storeId, name]
    );
    if (existing.rows.length > 0) return existing.rows[0].id;

    const created = await client.query(
      `INSERT INTO messaging_groups (store_id, parent_group_id, name) VALUES ($1, $2, $3) RETURNING id`,
      [storeId, parentGroupId || null, name]
    );
    return created.rows[0].id;
  };

  const topLevelId = await findOrCreate(parts[0], null);
  if (parts.length === 1) return topLevelId;
  return findOrCreate(parts[1], topLevelId); // "Parent / Sub" -- only one level deep
}

async function processContactsRows(client, rows, storeId, lang) {
  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = normalizeRow(rows[i]);
    const rowNum = i + 2;

    if (String(row.name || row.phone || "").trimStart().startsWith("#")) continue;

    const rawPhone = String(row.phone || "").trim();
    const phone = normalizeContactPhone(rawPhone);
    if (rawPhone && !phone) {
      results.failed++;
      results.errors.push({ row: rowNum, errorKey: "invalid_phone", error: `Invalid phone number: ${rawPhone}` });
      continue;
    }
    if (!phone) {
      results.failed++;
      results.errors.push({ row: rowNum, errorKey: "phone_required", error: "Phone number is required" });
      continue;
    }

    const name = row.name ? String(row.name).trim() || null : null;
    const groupPath = row.group ? String(row.group).trim() : null;

    try {
      await client.query("SAVEPOINT row_sp");

      const existing = await client.query(
        "SELECT id FROM messaging_contacts WHERE store_id = $1 AND phone = $2 LIMIT 1",
        [storeId, phone]
      );

      let contactId;
      if (existing.rows.length > 0) {
        contactId = existing.rows[0].id;
      } else {
        const created = await client.query(
          "INSERT INTO messaging_contacts (store_id, name, phone) VALUES ($1, $2, $3) RETURNING id",
          [storeId, name, phone]
        );
        contactId = created.rows[0].id;
      }

      if (groupPath) {
        const groupId = await resolveGroupPath(client, storeId, groupPath);
        if (groupId) await addContactToGroup(client, contactId, groupId);
      }

      results.success++;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT row_sp");
      results.failed++;
      results.errors.push({ row: rowNum, name, errorKey: "row_import_failed", error: err.message });
    }
  }

  return results;
}

export const importContacts = async (req, res) => {
  const storeId   = req.user.current_store_id;
  const userId    = req.user.id;
  const lang      = getLang(req);
  const confirmed = req.query.confirmed === "true";

  if (!req.file) return res.status(400).json({ message: t("no_file_uploaded", lang) || "No file uploaded" });

  try {
    const wb   = XLSX.read(req.file.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    if (rows.length === 0) return res.status(400).json({ message: t("file_is_empty", lang) || "File is empty" });

    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 0");
      await client.query("BEGIN");
      const results = await processContactsRows(client, rows, storeId, lang);

      if (results.failed > 0 && results.success > 0 && !confirmed) {
        await client.query("ROLLBACK");
        return res.status(200).json({
          requiresConfirmation: true,
          results,
          message: t("import_requires_confirmation", lang) || `${results.failed} rows have errors. ${results.success} rows are valid.`,
        });
      }

      await client.query("COMMIT");
      await pool.query(
        "INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1,$2,$3,$4)",
        [userId, "import_contacts", `Imported ${results.success} contacts (${results.failed} failed)`, storeId]);
      return res.status(200).json({ message: t("import_complete", lang), results });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally { client.release(); }
  } catch (err) {
    console.error("Import contacts error:", err.message);
    return respondWithError(req, res, 500, "server_error");
  }
};

