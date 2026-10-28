import pool from '../../../config/db.js';

async function loadStoreFormat(storeId) {
  const { rows } = await pool.query('SELECT settings FROM store_settings WHERE store_id = $1', [storeId]);
  const ops = rows[0]?.settings?.operations || {};
  const decimals = Number.parseInt(ops.defaultDecimalPlaces, 10);
  return {
    currency: ops.defaultCurrency || 'TZS',
    decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 4 ? decimals : 0,
  };
}

export { loadStoreFormat };
