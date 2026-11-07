// path: backend/services/stockValueSnapshot.service.js
//
// Core "take a stock value snapshot" logic, extracted out of
// inventory.controller.js's saveStockValueHistory so it can be called from
// TWO places without duplicating the SQL:
//   1. The existing manual "Save Snapshot" button (HTTP request, one store,
//      one user clicking it).
//   2. The new daily scheduler (services/stockValueHistoryScheduler.js),
//      which has no req/res and needs to run this for every store.
//
// Nothing about the manual save button's behavior changes — this is the
// exact same query/logic that was already in the controller.

import pool from '../config/db.js';
import { logActivity } from '../utils/activityLog.js';
/**
 * Take a stock value snapshot for one store and persist it.
 *
 * @param {object} params
 * @param {string} params.storeId
 * @param {string} params.priceCategoryId
 * @param {string|null} [params.createdBy] - user id, or null for scheduled runs
 * @param {string|null} [params.notes]
 * @param {import('pg').PoolClient} [params.client] - reuse an existing
 *   transaction client (rare); otherwise one is checked out internally.
 * @returns {Promise<{ skipped: boolean, reason?: string, data?: object }>}
 */
async function createStockValueSnapshot({
  storeId,
  priceCategoryId,
  createdBy = null,
  notes = null,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const stockValueResult = await client.query(
      `
            WITH product_stock AS (
                SELECT 
                    p.id AS product_id,
                    p.name AS product_name,
                    p.unit,
                    p.category_id,
                    c.name AS category_name,
                    SUM(
                        CASE 
                            WHEN im.type = 'IN' THEN im.quantity 
                            WHEN im.type = 'OUT' THEN -im.quantity
                            ELSE 0 
                        END
                    ) AS current_stock,
                    
                    COALESCE(
                        (
                            SELECT ib.cost_price
                            FROM inventory_batches ib
                            WHERE ib.product_id = p.id
                              AND ib.store_id = p.store_id
                            ORDER BY ib.created_at DESC
                            LIMIT 1
                        ),
                        0
                    ) AS cost_price,
                    
                    COALESCE(
                        (
                            SELECT sp.price
                            FROM selling_prices sp
                            WHERE sp.batch_id = (
                                SELECT ib2.id
                                FROM inventory_batches ib2
                                WHERE ib2.product_id = p.id
                                  AND ib2.store_id = p.store_id
                                ORDER BY ib2.created_at DESC
                                LIMIT 1
                            )
                            AND sp.price_category_id = $2
                            LIMIT 1
                        ),
                        0
                    ) AS selling_price
                    
                FROM products p
                LEFT JOIN product_categories c ON p.category_id = c.id
                LEFT JOIN inventory_batches ib ON ib.product_id = p.id AND ib.store_id = p.store_id
                LEFT JOIN inventory_movements im ON im.batch_id = ib.id
                WHERE p.store_id = $1
                GROUP BY p.id, p.name, p.unit, p.category_id, c.name
                HAVING SUM(
                    CASE 
                        WHEN im.type = 'IN' THEN im.quantity 
                        WHEN im.type = 'OUT' THEN -im.quantity
                        ELSE 0 
                    END
                ) > 0
            )
            SELECT 
                product_id,
                product_name,
                unit,
                category_name,
                current_stock,
                cost_price,
                selling_price,
                (current_stock * cost_price) AS stock_worth,
                (current_stock * selling_price) AS potential_revenue,
                ((selling_price - cost_price) * current_stock) AS potential_profit
            FROM product_stock
            ORDER BY product_name
        `,
      [storeId, priceCategoryId],
    );

    const stockData = stockValueResult.rows;

    if (stockData.length === 0) {
      await client.query("ROLLBACK");
      return { skipped: true, reason: "no_stock_data_available" };
    }

    const totals = stockData.reduce(
      (acc, item) => {
        acc.totalWorth += parseFloat(item.stock_worth || 0);
        acc.totalRevenue += parseFloat(item.potential_revenue || 0);
        acc.totalProfit += parseFloat(item.potential_profit || 0);
        acc.totalQuantity += parseFloat(item.current_stock || 0);
        return acc;
      },
      { totalWorth: 0, totalRevenue: 0, totalProfit: 0, totalQuantity: 0 },
    );

    const profitMargin =
      totals.totalRevenue > 0
        ? (totals.totalProfit / totals.totalRevenue) * 100
        : 0;

    const historyResult = await client.query(
      `
            INSERT INTO stock_value_history (
                store_id, price_category_id, total_stock_worth,
                total_potential_revenue, total_potential_profit, profit_margin,
                total_products, total_quantity, created_by, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id, snapshot_date
        `,
      [
        storeId,
        priceCategoryId,
        totals.totalWorth,
        totals.totalRevenue,
        totals.totalProfit,
        profitMargin,
        stockData.length,
        totals.totalQuantity,
        createdBy,
        notes,
      ],
    );

    const historyId = historyResult.rows[0].id;
    const snapshotDate = historyResult.rows[0].snapshot_date;

    for (const item of stockData) {
      await client.query(
        `
                INSERT INTO stock_value_history_items (
                    history_id, product_id, product_name, category_name, unit,
                    current_stock, cost_price, selling_price, stock_worth,
                    potential_revenue, potential_profit
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `,
        [
          historyId,
          item.product_id,
          item.product_name,
          item.category_name,
          item.unit,
          item.current_stock,
          item.cost_price,
          item.selling_price,
          item.stock_worth,
          item.potential_revenue,
          item.potential_profit,
        ],
      );
    }

    await logActivity(client, {
      userId: createdBy,
      storeId: storeId,
      action: "save_stock_value_history",
      description: {
        price_category_id: priceCategoryId || undefined,
        notes: notes || undefined,
        triggeredBy: createdBy ? "manual" : "scheduled",
      },
      ip: null,
    });

    await client.query("COMMIT");

    return {
      skipped: false,
      data: {
        id: historyId,
        snapshot_date: snapshotDate,
        total_products: stockData.length,
        total_stock_worth: totals.totalWorth,
        total_potential_revenue: totals.totalRevenue,
        total_potential_profit: totals.totalProfit,
        profit_margin: profitMargin,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export { createStockValueSnapshot };

