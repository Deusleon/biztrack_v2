import pool from '../../../../config/db.js';
export default {
  id: 'inventory',
  requiredPermission: 'ai_inventory_insights',
  async build({ storeId, reportType, filters = {} }) {
    const { rows } = await pool.query(`
      WITH stock AS (
        SELECT p.id,p.name,COALESCE(p.minimum_stock,0)::numeric minimum_stock,
          COALESCE(SUM(CASE WHEN im.type='IN' THEN im.quantity WHEN im.type='OUT' THEN -im.quantity ELSE 0 END),0)::numeric quantity,
          COALESCE(SUM(CASE WHEN im.type='IN' THEN im.quantity*COALESCE(ib.cost_price,0) WHEN im.type='OUT' THEN -im.quantity*COALESCE(ib.cost_price,0) ELSE 0 END),0)::numeric value
        FROM products p
        LEFT JOIN inventory_movements im ON im.product_id=p.id AND im.store_id=$1
        LEFT JOIN inventory_batches ib ON ib.id=im.batch_id
        WHERE p.store_id=$1 GROUP BY p.id,p.name,p.minimum_stock
      )
      SELECT COUNT(*)::int total_products,
        COALESCE(SUM(quantity),0)::numeric total_units,
        COALESCE(SUM(value),0)::numeric stock_value,
        COUNT(*) FILTER(WHERE quantity<=0)::int out_of_stock,
        COUNT(*) FILTER(WHERE quantity>0 AND quantity<=minimum_stock)::int low_stock,
        COUNT(*) FILTER(WHERE quantity>minimum_stock)::int healthy_stock
      FROM stock`, [storeId]);
    const risks = await pool.query(`
      WITH stock AS (
        SELECT p.name,COALESCE(p.minimum_stock,0)::numeric minimum_stock,
          COALESCE(SUM(CASE WHEN im.type='IN' THEN im.quantity WHEN im.type='OUT' THEN -im.quantity ELSE 0 END),0)::numeric quantity
        FROM products p LEFT JOIN inventory_movements im ON im.product_id=p.id AND im.store_id=$1
        WHERE p.store_id=$1 GROUP BY p.id,p.name,p.minimum_stock
      ) SELECT name,quantity,minimum_stock FROM stock WHERE quantity<=minimum_stock ORDER BY quantity ASC LIMIT 12`, [storeId]);
    return { category: 'inventory', reportType, filters, summary: rows[0], attentionProducts: risks.rows };
  },
};
