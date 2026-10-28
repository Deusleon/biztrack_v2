import pool from '../../../config/db.js';
import { businessToday, rangeOf } from '../assistant/periods.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default {
  id: 'getPurchaseSummary',
  name: 'Purchase summary',
  category: 'purchases',
  requiredPermissions: ['view_purchase_orders'],
  description: 'Returns verified purchase-order counts, totals, suppliers, and the products on each order for the current store and date range. Use for purchase, purchase-order, and what-was-bought questions.',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Start date YYYY-MM-DD' },
      to: { type: 'string', description: 'End date YYYY-MM-DD' },
    },
    additionalProperties: false,
  },
  async execute({ storeId, args = {}, period }) {
    const range = rangeOf(args, period, businessToday());
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS orders,
              COALESCE(SUM(total_amount), 0)::numeric AS total,
              COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'rejected', 'received', 'completed'))::int AS open_orders
       FROM purchase_orders
       WHERE store_id = $1
         AND order_date::date BETWEEN $2::date AND $3::date`,
      [storeId, range.from, range.to],
    );
    const lines = await pool.query(
      `SELECT po.po_number, s.name AS supplier, p.name AS product,
              poi.quantity::numeric AS quantity, poi.unit_price::numeric AS unit_price
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       LEFT JOIN products p ON p.id = poi.product_id
       WHERE po.store_id = $1
         AND po.order_date::date BETWEEN $2::date AND $3::date
         AND po.status NOT IN ('cancelled', 'rejected')
       ORDER BY po.order_date DESC, po.po_number, p.name
       LIMIT 80`,
      [storeId, range.from, range.to],
    );
    const orderDetails = [];
    for (const row of lines.rows) {
      let order = orderDetails.find((item) => item.poNumber === row.po_number);
      if (!order) {
        if (orderDetails.length >= 8) continue;
        order = { poNumber: row.po_number, supplier: row.supplier, items: [] };
        orderDetails.push(order);
      }
      if (order.items.length >= 12) continue;
      order.items.push({
        name: row.product,
        quantity: toNumber(row.quantity),
        unitPrice: toNumber(row.unit_price),
      });
    }
    const suppliers = await pool.query(
      `SELECT s.name, COUNT(*)::int AS orders, COALESCE(SUM(po.total_amount), 0)::numeric AS total
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.store_id = $1
         AND po.order_date::date BETWEEN $2::date AND $3::date
       GROUP BY s.id, s.name
       ORDER BY total DESC
       LIMIT 5`,
      [storeId, range.from, range.to],
    );
    return {
      period: range,
      orders: Number(rows[0]?.orders) || 0,
      openOrders: Number(rows[0]?.open_orders) || 0,
      total: toNumber(rows[0]?.total),
      suppliers: suppliers.rows.map((row) => ({ name: row.name, orders: Number(row.orders) || 0, total: toNumber(row.total) })),
      orderDetails,
    };
  },
};
