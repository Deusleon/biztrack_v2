// The price category that receives a batch's selling price (goods received, new product stock).
//
// 1. The default price category chosen in Settings, when it still exists and is active.
// 2. Otherwise the store's first active price category, so a price typed at receiving is never
//    lost just because nobody picked a default yet.
// 3. null when the store has no price category at all (the price then lives on the batch only).
export async function resolveDefaultPriceCategory(db, storeId, settings) {
  const configured = settings?.operations?.defaultPriceCategory || null;
  if (configured) {
    const found = await db.query(
      'SELECT id FROM price_categories WHERE id = $1 AND store_id = $2 AND COALESCE(is_active, true) = true',
      [configured, storeId],
    );
    if (found.rows[0]) return found.rows[0].id;
  }
  const first = await db.query(
    `SELECT id FROM price_categories
     WHERE store_id = $1 AND COALESCE(is_active, true) = true
     ORDER BY created_at ASC, name ASC LIMIT 1`,
    [storeId],
  );
  return first.rows[0]?.id || null;
}

/** Saves one batch's price for one category: updates the row when it exists, adds it when it does not. */
export async function saveBatchPrice(db, { batchId, categoryId, price }) {
  if (!batchId || !categoryId) return;
  const updated = await db.query(
    'UPDATE selling_prices SET price = $3, updated_at = NOW() WHERE batch_id = $1 AND price_category_id = $2',
    [batchId, categoryId, price],
  );
  if (updated.rowCount === 0) {
    await db.query(
      'INSERT INTO selling_prices (batch_id, price_category_id, price) VALUES ($1, $2, $3)',
      [batchId, categoryId, price],
    );
  }
}
