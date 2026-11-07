import pool from '../../../config/db.js';
export default {
  id: 'getLowStockProducts',
  name: 'Low Stock Products',
  description: 'Returns verified products that are out of stock or at or below their configured minimum stock. Use for reorder, low-stock, and stock-out questions.',
  category: 'inventory',
  requiredPermissions: ['ai_inventory_insights'],
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: 'Maximum number of low-stock products to return. Defaults to 20.',
      },
    },
    additionalProperties: false,
  },
  async execute({ storeId, args = {} }) {
    const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
    const { rows } = await pool.query(
      `SELECT p.name, COALESCE(p.minimum_stock, 0)::numeric AS "minimumStock",
              COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE im.quantity END), 0)::numeric AS quantity
       FROM products p
       LEFT JOIN inventory_movements im ON im.product_id = p.id AND im.store_id = $1
       WHERE p.store_id = $1
       GROUP BY p.id, p.name, p.minimum_stock
       HAVING COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE im.quantity END), 0) <= COALESCE(p.minimum_stock, 0)
       ORDER BY quantity ASC
       LIMIT $2`,
      [storeId, limit],
    );
    return {
      products: rows.map((row) => ({
        name: row.name,
        quantity: Number(row.quantity) || 0,
        minimumStock: Number(row.minimumStock) || 0,
        status: Number(row.quantity) <= 0 ? 'out_of_stock' : 'low_stock',
      })),
    };
  },
};
