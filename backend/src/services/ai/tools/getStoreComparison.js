import pool from '../../../config/db.js';
import { addDays, businessToday } from '../assistant/periods.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default {
  id: 'getStoreComparison',
  name: 'Store comparison',
  category: 'sales',
  requiredPermissions: ['ai_sales_insights'],
  description: 'Compares verified net sales for yesterday and today across the stores this user belongs to. Never includes a store the user is not a member of.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute({ storeId, userId }) {
    const today = businessToday();
    const yesterday = addDays(today, -1);
    const { rows } = await pool.query(
      `SELECT s.id, s.name,
              COALESCE(SUM(p.subtotal - p.total_discount) FILTER (WHERE p.sales_date::date = $1::date), 0)::numeric AS yesterday_net,
              COALESCE(SUM(p.subtotal - p.total_discount) FILTER (WHERE p.sales_date::date = $2::date), 0)::numeric AS today_net
       FROM store_users su
       JOIN stores s ON s.id = su.store_id
       LEFT JOIN payments p ON p.store_id = s.id
         AND p.sales_date::date IN ($1::date, $2::date)
       WHERE su.user_id = $3 AND su.status = true
       GROUP BY s.id, s.name
       ORDER BY yesterday_net DESC, s.name`,
      [yesterday, today, userId],
    );
    return {
      period: { from: yesterday, to: today },
      stores: rows.map((row) => ({
        id: row.id,
        name: row.name,
        isCurrent: row.id === storeId,
        yesterdayNetSales: toNumber(row.yesterday_net),
        todayNetSales: toNumber(row.today_net),
      })),
    };
  },
};
