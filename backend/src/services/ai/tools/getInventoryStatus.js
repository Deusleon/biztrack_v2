import pool from '../../../config/db.js';
export default {
  id: 'getInventoryStatus',
  name: 'Inventory Status',
  description: 'Returns verified current inventory totals: product count, total units, estimated stock value, out-of-stock count, and below-minimum count. Use for overall inventory-health questions.',
  category: 'inventory',
  requiredPermissions: ['ai_inventory_insights'],
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute({ storeId }) {
    const { rows } = await pool.query(
      `WITH stock AS (
         SELECT p.id, p.name, COALESCE(p.minimum_stock, 0) AS minimum_stock,
                COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE im.quantity END), 0) AS quantity,
                COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity * COALESCE(ib.cost_price, 0) WHEN im.type = 'OUT' THEN -im.quantity * COALESCE(ib.cost_price, 0) ELSE im.quantity * COALESCE(ib.cost_price, 0) END), 0) AS value
         FROM products p
         LEFT JOIN inventory_movements im ON im.product_id = p.id AND im.store_id = $1
         LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
         WHERE p.store_id = $1
         GROUP BY p.id, p.name, p.minimum_stock
       )
       SELECT COUNT(*)::int AS products,
              COUNT(*) FILTER(WHERE quantity <= 0)::int AS out_of_stock,
              COUNT(*) FILTER(WHERE quantity > 0 AND quantity <= minimum_stock)::int AS below_minimum,
              COALESCE(SUM(quantity), 0)::numeric AS units,
              COALESCE(SUM(value), 0)::numeric AS stock_value
       FROM stock`,
      [storeId],
    );
    return {
      products: Number(rows[0].products) || 0,
      outOfStock: Number(rows[0].out_of_stock) || 0,
      belowMinimum: Number(rows[0].below_minimum) || 0,
      totalUnits: Number(rows[0].units) || 0,
      estimatedStockValue: Number(rows[0].stock_value) || 0,
    };
  },
};
