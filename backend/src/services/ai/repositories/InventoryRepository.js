import pool from '../../../config/db.js';
function stockCte() {
  return `WITH stock AS (
    SELECT p.id, p.name, p.unit, p.minimum_stock, p.cost_price,
      COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE im.quantity END), 0) AS quantity,
      COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity * COALESCE(ib.cost_price, p.cost_price, 0)
                        WHEN im.type = 'OUT' THEN -im.quantity * COALESCE(ib.cost_price, p.cost_price, 0)
                        ELSE im.quantity * COALESCE(ib.cost_price, p.cost_price, 0) END), 0) AS value
    FROM products p
    LEFT JOIN inventory_movements im ON im.product_id = p.id AND im.store_id = $1
    LEFT JOIN inventory_batches ib ON ib.id = im.batch_id
    WHERE p.store_id = $1 AND p.status = 'active'
    GROUP BY p.id, p.name, p.unit, p.minimum_stock, p.cost_price
  )`;
}
const nameExpr = `COALESCE(name->>'en', name->>'sw', name::text)`;

async function getLevels(storeId, { limit = 20, status = 'all' } = {}) {
  let condition = 'TRUE';
  if (status === 'out_of_stock') condition = 'quantity <= 0';
  if (status === 'low_stock') condition = 'quantity > 0 AND quantity <= COALESCE(minimum_stock, 0)';
  if (status === 'in_stock') condition = 'quantity > COALESCE(minimum_stock, 0)';
  const { rows } = await pool.query(
    `${stockCte()} SELECT id, ${nameExpr} AS name, unit, quantity::numeric,
      COALESCE(minimum_stock, 0)::numeric AS minimum_stock, value::numeric
     FROM stock WHERE ${condition}
     ORDER BY quantity ASC LIMIT $2`, [storeId, limit]);
  return rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, quantity: Number(r.quantity)||0, minimumStock: Number(r.minimum_stock)||0, stockValue: Number(r.value)||0 }));
}

async function getReorder(storeId, { limit = 20, safetyFactor = 1 } = {}) {
  const { rows } = await pool.query(
    `${stockCte()} SELECT id, ${nameExpr} AS name, unit, quantity::numeric,
      COALESCE(minimum_stock, 0)::numeric AS minimum_stock,
      GREATEST(CEIL(COALESCE(minimum_stock, 0) * $2 - quantity), 0)::numeric AS suggested_order
     FROM stock WHERE quantity <= COALESCE(minimum_stock, 0) * $2
     ORDER BY suggested_order DESC, quantity ASC LIMIT $3`, [storeId, safetyFactor, limit]);
  return rows.map((r) => ({ id:r.id, name:r.name, unit:r.unit, quantity:Number(r.quantity)||0, minimumStock:Number(r.minimum_stock)||0, suggestedOrder:Number(r.suggested_order)||0 }));
}

async function getDeadStock(storeId, { days = 90, limit = 20 } = {}) {
  const { rows } = await pool.query(
    `${stockCte()}, last_sales AS (
      SELECT c.product_id, MAX(COALESCE(pay.sales_date, c.updated_at, c.created_at)) AS last_sold_at
      FROM cart c LEFT JOIN payments pay ON pay.store_id=c.store_id AND (pay.invoice_number=c.invoice_number OR pay.cart_code=c.cart_code)
      WHERE c.store_id=$1 AND c.status='Sold' GROUP BY c.product_id
    ) SELECT s.id, ${nameExpr.replaceAll('name','s.name')} AS name, s.unit, s.quantity::numeric, s.value::numeric, ls.last_sold_at
      FROM stock s LEFT JOIN last_sales ls ON ls.product_id=s.id
      WHERE s.quantity > 0 AND (ls.last_sold_at IS NULL OR ls.last_sold_at < CURRENT_DATE - ($2::int * INTERVAL '1 day'))
      ORDER BY s.value DESC LIMIT $3`, [storeId, days, limit]);
  return rows.map((r)=>({id:r.id,name:r.name,unit:r.unit,quantity:Number(r.quantity)||0,stockValue:Number(r.value)||0,lastSoldAt:r.last_sold_at,daysWithoutSale:days}));
}

async function getExpiry(storeId, { days = 30, limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT ib.id AS batch_id, ib.batch_number, ib.expiry_date, p.id AS product_id,
      COALESCE(p.name->>'en', p.name->>'sw', p.name::text) AS name, p.unit,
      COALESCE(SUM(CASE WHEN im.type='IN' THEN im.quantity WHEN im.type='OUT' THEN -im.quantity ELSE im.quantity END),0)::numeric AS quantity,
      COALESCE(ib.cost_price, p.cost_price, 0)::numeric AS cost_price
     FROM inventory_batches ib JOIN products p ON p.id=ib.product_id
     LEFT JOIN inventory_movements im ON im.batch_id=ib.id AND im.store_id=$1
     WHERE ib.store_id=$1 AND ib.status='active' AND ib.expiry_date IS NOT NULL
       AND ib.expiry_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
     GROUP BY ib.id, ib.batch_number, ib.expiry_date, ib.cost_price, p.id, p.name, p.unit, p.cost_price
     HAVING COALESCE(SUM(CASE WHEN im.type='IN' THEN im.quantity WHEN im.type='OUT' THEN -im.quantity ELSE im.quantity END),0) > 0
     ORDER BY ib.expiry_date ASC LIMIT $3`, [storeId, days, limit]);
  return rows.map((r)=>({batchId:r.batch_id,batchNumber:r.batch_number,productId:r.product_id,name:r.name,unit:r.unit,quantity:Number(r.quantity)||0,costPrice:Number(r.cost_price)||0,expiryDate:r.expiry_date,status:new Date(r.expiry_date)<new Date()?'expired':'expiring_soon'}));
}

async function getValuation(storeId, { limit = 10 } = {}) {
 const { rows } = await pool.query(`${stockCte()} SELECT COUNT(*)::int AS products, COALESCE(SUM(quantity),0)::numeric AS units, COALESCE(SUM(value),0)::numeric AS total_value FROM stock`,[storeId]);
 const top = await pool.query(`${stockCte()} SELECT id, ${nameExpr} AS name, quantity::numeric, value::numeric FROM stock WHERE quantity > 0 ORDER BY value DESC LIMIT $2`,[storeId,limit]);
 return {products:Number(rows[0].products)||0,totalUnits:Number(rows[0].units)||0,totalStockValue:Number(rows[0].total_value)||0,topValueProducts:top.rows.map(r=>({id:r.id,name:r.name,quantity:Number(r.quantity)||0,stockValue:Number(r.value)||0}))};
}
export { getLevels, getReorder, getDeadStock, getExpiry, getValuation };

