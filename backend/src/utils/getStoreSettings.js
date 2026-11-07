import pool from '../config/db.js';
const getStoreSettings = async (storeId) => {
  try {
    const [storeResult, systemResult] = await Promise.all([
      pool.query(`SELECT settings FROM store_settings WHERE store_id = $1`, [
        storeId,
      ]),
      pool.query(`SELECT settings FROM system_settings LIMIT 1`),
    ]);

    const storeSettings = storeResult.rows[0]?.settings || {};
    const systemSettings = systemResult.rows[0]?.settings || {};

    // merge settings (store overrides system)
    const finalSettings = {
      // ...systemSettings,
      ...storeSettings,
    };

    return finalSettings;
  } catch (err) {
    console.error("Error fetching store settings:", err);
    return {};
  }
}

export default getStoreSettings;