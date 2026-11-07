import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { respondWithError } from '../utils/response.js';
import { getLang } from '../utils/getLang.js';
// ─── SQL helpers ─────────────────────────────────────────────────────────────
function sqlLiteral(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

function buildInserts(tableName, rows) {
  if (!rows || rows.length === 0) return `-- (no rows in "${tableName}")\n`;
  const columns = Object.keys(rows[0]);
  const colList  = columns.map((c) => `"${c}"`).join(", ");
  return (
    rows
      .map((row) => {
        const vals = columns.map((c) => sqlLiteral(row[c])).join(", ");
        return `INSERT INTO "${tableName}" (${colList}) VALUES (${vals});`;
      })
      .join("\n") + "\n"
  );
}

// ─── Activity-log description enrichment ─────────────────────────────────────
// Log descriptions store raw IDs (product_id, customer_id, created_by, ...).
// Before returning logs to the frontend we resolve those IDs into names so
// the activity page reads "Product: Azam Juice" instead of a UUID.

// description field -> lookup table + readable key used in the response
const LOG_ID_FIELDS = {
  product_id:           { table: "products",           out: "product" },
  product_ids:          { table: "products",           out: "products" },
  category_id:          { table: "product_categories", out: "category" },
  product_category:     { table: "product_categories", out: "category" },
  customer_id:          { table: "customers",          out: "customer" },
  supplier_id:          { table: "suppliers",          out: "supplier" },
  price_category_id:    { table: "price_categories",   out: "price_category" },
  role_id:              { table: "roles",              out: "role" },
  user_id:              { table: "users",              out: "user" },
  created_by:           { table: "users",              out: "created_by" },
  updated_by:           { table: "users",              out: "updated_by" },
  approved_by:          { table: "users",              out: "approved_by" },
  received_by:          { table: "users",              out: "received_by" },
  requested_by:         { table: "users",              out: "requested_by" },
  deleted_by:           { table: "users",              out: "deleted_by" },
  from_store_id:        { table: "stores",             out: "from_store" },
  to_store_id:          { table: "stores",             out: "to_store" },
  destination_store_id: { table: "stores",             out: "to_store" },
};

function collectLogIds(value, buckets) {
  if (Array.isArray(value)) {
    for (const item of value) collectLogIds(item, buckets);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, val] of Object.entries(value)) {
    const field = LOG_ID_FIELDS[key];
    if (field && val !== null && val !== undefined) {
      const ids = Array.isArray(val) ? val : [val];
      for (const id of ids) {
        if (id !== null && id !== undefined && id !== "") {
          (buckets[field.table] ||= new Set()).add(String(id));
        }
      }
    } else if (val && typeof val === "object") {
      collectLogIds(val, buckets); // nested objects e.g. { old: {...}, new: {...} }
    }
  }
}

function resolveLogValue(value, maps) {
  if (Array.isArray(value)) return value.map((item) => resolveLogValue(item, maps));
  if (!value || typeof value !== "object") return value;

  const output = {};
  for (const [key, val] of Object.entries(value)) {
    const field = LOG_ID_FIELDS[key];
    if (field && val !== null && val !== undefined && typeof val !== "object") {
      const name = maps[field.table]?.get(String(val));
      // Resolved -> readable key with the name; unresolved (e.g. deleted
      // record) -> keep the original key and id so no information is lost.
      if (name !== undefined) {
        output[field.out] = name;
      } else {
        output[key] = val;
      }
    } else if (field && Array.isArray(val)) {
      const names = val.map((id) => maps[field.table]?.get(String(id)) ?? id);
      output[field.out] = names;
    } else if (val && typeof val === "object") {
      output[key] = resolveLogValue(val, maps);
    } else {
      output[key] = val;
    }
  }
  return output;
}

async function enrichLogDescriptions(rows) {
  // Parse descriptions once and gather every referenced id per table
  const parsed = rows.map((row) => {
    if (!row.description || typeof row.description !== "string") return row.description;
    try {
      return JSON.parse(row.description);
    } catch {
      return row.description; // plain-text descriptions stay untouched
    }
  });

  const buckets = {};
  for (const description of parsed) collectLogIds(description, buckets);

  // One lookup per table for the whole page (ids cast to text so the same
  // code covers UUID and integer keys)
  const maps = {};
  await Promise.all(
    Object.entries(buckets).map(async ([table, ids]) => {
      try {
        const result = await pool.query(
          `SELECT id::text AS id, name FROM "${table}" WHERE id::text = ANY($1::text[])`,
          [[...ids]]
        );
        maps[table] = new Map(result.rows.map((r) => [r.id, r.name]));
      } catch (err) {
        console.warn(`Log enrichment: lookup on "${table}" failed: ${err.message}`);
        maps[table] = new Map();
      }
    })
  );

  return rows.map((row, index) => {
    const description = parsed[index];
    if (!description || typeof description !== "object") return row;
    return { ...row, description: JSON.stringify(resolveLogValue(description, maps)) };
  });
}

// ─── Export store data as PostgreSQL SQL ──────────────────────────────────────
export const exportData = async (req, res) => {
  const lang = getLang(req);
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  try {
    // Verify store membership
    const storeUserRes = await pool.query(
      `SELECT su.*, r.name AS role_name FROM store_users su
       JOIN roles r ON r.id = su.role_id
       WHERE su.user_id = $1 AND su.store_id = $2 LIMIT 1`,
      [userId, storeId]
    );
    if (storeUserRes.rows.length === 0) {
      return respondWithError(req, res, 403, "forbidden");
    }

    const allowedRoles = ["Owner", "Manager"];
    if (!allowedRoles.includes(storeUserRes.rows[0].role_name)) {
      return respondWithError(req, res, 403, "forbidden");
    }

    // Gather store data in parallel
    const [
      productsRes,
      categoriesRes,
      customersRes,
      suppliersRes,
      inventoryRes,
      storeRes,
    ] = await Promise.all([
      pool.query("SELECT * FROM products WHERE store_id = $1", [storeId]),
      pool.query("SELECT * FROM product_categories WHERE store_id = $1", [storeId]),
      pool.query("SELECT * FROM customers WHERE store_id = $1", [storeId]),
      pool.query("SELECT * FROM suppliers WHERE store_id = $1", [storeId]),
      pool.query("SELECT * FROM inventory_movements WHERE store_id = $1", [storeId]),
      pool.query("SELECT * FROM stores WHERE id = $1", [storeId]),
    ]);

    // Log the action
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, "export_data", "Store data exported as SQL", storeId]
    );

    const storeName = (storeRes.rows[0]?.name || "store")
      .replace(/\s+/g, "_")
      .toLowerCase();
    const dateStr  = new Date().toISOString().split("T")[0];
    const filename = `${storeName}_export_${dateStr}.sql`;

    const sqlLines = [
      `-- BizTrack Data Export`,
      `-- Store: ${storeRes.rows[0]?.name || ""}`,
      `-- Exported at: ${new Date().toISOString()}`,
      `-- PostgreSQL compatible`,
      `-- Import order: product_categories → products → customers → suppliers → inventory`,
      `-- Note: review for ID conflicts before running against an existing database`,
      ``,
      `-- CATEGORIES (${categoriesRes.rows.length} rows)`,
      buildInserts("product_categories", categoriesRes.rows),
      `-- PRODUCTS (${productsRes.rows.length} rows)`,
      buildInserts("products", productsRes.rows),
      `-- CUSTOMERS (${customersRes.rows.length} rows)`,
      buildInserts("customers", customersRes.rows),
      `-- SUPPLIERS (${suppliersRes.rows.length} rows)`,
      buildInserts("suppliers", suppliersRes.rows),
      `-- INVENTORY (${inventoryRes.rows.length} rows)`,
      buildInserts("inventory", inventoryRes.rows),
    ];

    const sql = sqlLines.join("\n");
    res.setHeader("Content-Type", "application/sql");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(sql);
  } catch (err) {
    console.error("Export data error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// ─── Database health check ────────────────────────────────────────────────────
export const dbHealthCheck = async (req, res) => {
  const lang = getLang(req);
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  try {
    const storeUserRes = await pool.query(
      `SELECT su.*, r.name AS role_name FROM store_users su
       JOIN roles r ON r.id = su.role_id
       WHERE su.user_id = $1 AND su.store_id = $2 LIMIT 1`,
      [userId, storeId]
    );
    if (
      storeUserRes.rows.length === 0 ||
      !["Owner", "Manager"].includes(storeUserRes.rows[0].role_name)
    ) {
      return respondWithError(req, res, 403, "forbidden");
    }

    const healthStartedAt = process.hrtime.bigint();
    const pingStartedAt = process.hrtime.bigint();
    await pool.query("SELECT 1");
    const pingMs = Number(process.hrtime.bigint() - pingStartedAt) / 1e6;

    // Find all public tables that have a store_id column
    const tablesRes = await pool.query(
      `SELECT DISTINCT table_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'store_id'
       ORDER BY table_name`
    );

    const tableNames = tablesRes.rows.map((r) => r.table_name);

    // Count records per table for this store (in parallel)
    const countResults = await Promise.all(
      tableNames.map((tableName) =>
        pool
          .query(`SELECT COUNT(*) FROM ${tableName} WHERE store_id = $1`, [storeId])
          .then((r) => ({ table: tableName, count: parseInt(r.rows[0].count) }))
          .catch(() => ({ table: tableName, count: null, error: true }))
      )
    );

    const tableStats = {};
    countResults.forEach(({ table, count }) => {
      tableStats[table] = count;
    });

    return res.status(200).json({
      status: "healthy",
      pingMs: Number(pingMs.toFixed(2)),
      responseMs: Number((Number(process.hrtime.bigint() - healthStartedAt) / 1e6).toFixed(2)),
      checkedAt: new Date().toISOString(),
      tableCount: tableNames.length,
      tableStats,
    });
  } catch (err) {
    console.error("DB health check error:", err);
    return res.status(200).json({
      status: "unhealthy",
      error: err.message,
      checkedAt: new Date().toISOString(),
    });
  }
};

// ─── Clear application cache (localStorage-side is frontend, backend logs it) ─
export const clearCache = async (req, res) => {
  const lang = getLang(req);
  const userId = req.user.id;
  const storeId = req.user.current_store_id;

  try {
    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, "clear_cache", "Application cache cleared by user", storeId]
    );
    return res.status(200).json({ message: t("cache_cleared", lang) });
  } catch (err) {
    console.error("Clear cache error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// ─── Full store database backup ─────────────────────────────────────────────
export const backupDatabase = async (req, res) => {
  const storeId = req.user.current_store_id;
  const userId  = req.user.id;

  try {
    const storeUserRes = await pool.query(
      `SELECT su.*, r.name AS role_name FROM store_users su
       JOIN roles r ON r.id = su.role_id
       WHERE su.user_id = $1 AND su.store_id = $2 LIMIT 1`,
      [userId, storeId]
    );
    if (
      storeUserRes.rows.length === 0 ||
      !["Owner", "Manager"].includes(storeUserRes.rows[0].role_name)
    ) {
      return respondWithError(req, res, 403, "forbidden");
    }

    // Core tables
    const coreQueries = [
      { table: "product_categories",  sql: "SELECT * FROM product_categories WHERE store_id = $1" },
      { table: "products",            sql: "SELECT * FROM products WHERE store_id = $1" },
      { table: "inventory_movements", sql: "SELECT * FROM inventory_movements WHERE store_id = $1" },
      { table: "customers",           sql: "SELECT * FROM customers WHERE store_id = $1" },
      { table: "suppliers",           sql: "SELECT * FROM suppliers WHERE store_id = $1" },
      { table: "price_categories",    sql: "SELECT * FROM price_categories WHERE store_id = $1" },
      { table: "sales_orders",        sql: "SELECT * FROM sales_orders WHERE store_id = $1" },
      { table: "purchase_orders",     sql: "SELECT * FROM purchase_orders WHERE store_id = $1" },
      { table: "stock_counts",        sql: "SELECT * FROM stock_counts WHERE store_id = $1" },
    ];

    // Join-filtered tables (no direct store_id)
    const joinQueries = [
      {
        table: "purchase_order_items",
        sql: `SELECT poi.* FROM purchase_order_items poi
              JOIN purchase_orders po ON po.id = poi.purchase_order_id
              WHERE po.store_id = $1`,
      },
      {
        table: "stock_count_items",
        sql: `SELECT sci.* FROM stock_count_items sci
              JOIN stock_counts sc ON sc.id = sci.stock_count_id
              WHERE sc.store_id = $1`,
      },
    ];

    const storeRes = await pool.query("SELECT * FROM stores WHERE id = $1", [storeId]);

    // Run all queries, gracefully skipping tables that may not exist
    const tableResults = await Promise.all(
      [...coreQueries, ...joinQueries].map(({ table, sql }) =>
        pool
          .query(sql, [storeId])
          .then((r) => ({ table, rows: r.rows }))
          .catch((err) => {
            console.warn(`Backup: skipping table "${table}": ${err.message}`);
            return { table, rows: [] };
          })
      )
    );

    const storeName = (storeRes.rows[0]?.name || "store")
      .replace(/\s+/g, "_")
      .toLowerCase();
    const dateStr  = new Date().toISOString().split("T")[0];
    const filename = `${storeName}_backup_${dateStr}.sql`;

    const header = [
      `-- BizTrack Database Backup`,
      `-- Store: ${storeRes.rows[0]?.name || ""}`,
      `-- Generated at: ${new Date().toISOString()}`,
      `-- PostgreSQL compatible`,
      `-- This backup contains all operational data for the store`,
      `-- Restore order matters: categories → products → inventory → customers → suppliers`,
      `--   → price_categories → sales_orders → purchase_orders → items → counts`,
      ``,
    ];

    const sections = tableResults.map(
      ({ table, rows }) =>
        `-- ${table.toUpperCase()} (${rows.length} rows)\n` + buildInserts(table, rows)
    );

    const sql = [...header, ...sections].join("\n");

    await pool.query(
      `INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1, $2, $3, $4)`,
      [userId, "database_backup", "Full store database backup downloaded", storeId]
    );

    res.setHeader("Content-Type", "application/sql");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(sql);
  } catch (err) {
    console.error("Backup error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

// ─── Get system logs (Activity Logs) ─────────────────────────────────────────
export const getSystemLogs = async (req, res) => {
  const lang = getLang(req);
  const storeId = req.user.current_store_id;
  const userId = req.user.id;

  // Query params for filtering
  const {
    action,
    userId: filterUserId,
    dateFrom,
    dateTo,
    page = 1,
    limit = 50,
  } = req.query;

  try {
    // Only owners/managers can see logs
    const storeUserRes = await pool.query(
      `SELECT su.*, r.name AS role_name FROM store_users su
       JOIN roles r ON r.id = su.role_id
       WHERE su.user_id = $1 AND su.store_id = $2 LIMIT 1`,
      [userId, storeId]
    );
    if (
      storeUserRes.rows.length === 0 ||
      !["Owner", "Manager"].includes(storeUserRes.rows[0].role_name)
    ) {
      return respondWithError(req, res, 403, "forbidden");
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ["sl.store_id = $1"];
    const params = [storeId];
    let paramIdx = 2;

    if (action) {
      conditions.push(`sl.action = $${paramIdx++}`);
      params.push(action);
    }
    if (filterUserId) {
      conditions.push(`sl.user_id = $${paramIdx++}`);
      params.push(filterUserId);
    }
    if (dateFrom) {
      conditions.push(`sl.created_at >= $${paramIdx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`sl.created_at <= $${paramIdx++}`);
      params.push(dateTo + " 23:59:59");
    }

    const whereClause = conditions.join(" AND ");

    const [logsRes, countRes, actionsRes, usersRes] = await Promise.all([
      pool.query(
        `SELECT sl.id, sl.action, sl.description, sl.ip_address, sl.created_at,
                u.name AS user_name, u.email AS user_email
         FROM system_logs sl
         LEFT JOIN users u ON u.id = sl.user_id
         WHERE ${whereClause}
         ORDER BY sl.created_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, parseInt(limit), offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM system_logs sl WHERE ${whereClause}`,
        params
      ),
      // Distinct actions for filter dropdown
      pool.query(
        `SELECT DISTINCT action FROM system_logs WHERE store_id = $1 ORDER BY action`,
        [storeId]
      ),
      // Store users for filter dropdown
      pool.query(
        `SELECT u.id, u.name, u.email FROM users u
         JOIN store_users su ON su.user_id = u.id
         WHERE su.store_id = $1 ORDER BY u.name`,
        [storeId]
      ),
    ]);

    const enrichedLogs = await enrichLogDescriptions(logsRes.rows);

    return res.status(200).json({
      logs: enrichedLogs,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
      filters: {
        actions: actionsRes.rows.map((r) => r.action),
        users: usersRes.rows,
      },
    });
  } catch (err) {
    console.error("Get system logs error:", err);
    respondWithError(req, res, 500, "server_error");
  }
};

