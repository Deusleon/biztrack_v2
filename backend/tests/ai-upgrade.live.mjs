// Runs the new verified queries and the morning brief against the store database.
// Skips when the database cannot be reached.
import pool from '../src/config/db.js';
import { buildMorningBrief, getDelivery, saveDelivery } from '../src/services/ai/morningBrief.service.js';
import salesPeriod from '../src/services/ai/tools/getSalesForPeriod.js';
import profitPeriod from '../src/services/ai/tools/getProfitForPeriod.js';
import purchases from '../src/services/ai/tools/getPurchaseSummary.js';
import suppliers from '../src/services/ai/tools/getSupplierDebts.js';
import returnsTool from '../src/services/ai/tools/getSalesReturnsSummary.js';
import cashiers from '../src/services/ai/tools/getCashierSales.js';
import stores from '../src/services/ai/tools/getStoreComparison.js';
import { periodFromMessage } from '../src/services/ai/assistant/periods.js';

const tools = [salesPeriod, profitPeriod, purchases, suppliers, returnsTool, cashiers, stores];

try {
  const { rows } = await pool.query(
    `SELECT su.user_id, su.store_id
     FROM store_users su
     JOIN roles r ON r.id = su.role_id
     WHERE su.status = true
     ORDER BY CASE WHEN LOWER(r.name) = 'owner' THEN 0 ELSE 1 END
     LIMIT 1`,
  );
  if (!rows[0]) {
    console.log('skip: no store membership');
    process.exit(0);
  }
  const { user_id: userId, store_id: storeId } = rows[0];
  const period = periodFromMessage('sales yesterday');
  for (const tool of tools) {
    const result = await tool.execute({ storeId, userId, period, args: {} });
    if (!result || typeof result !== 'object') throw new Error(`${tool.id} returned nothing`);
    console.log(tool.id, Object.keys(result).join(','));
  }
  const compared = await stores.execute({ storeId, userId, args: {} });
  if (compared.stores.some((store) => store.id && store.isCurrent === undefined)) {
    throw new Error('store comparison row is missing its current-store flag');
  }
  const brief = await buildMorningBrief({ storeId, userId, lang: 'sw' });
  if (!brief.text.includes('Jana') || !brief.text.includes('Ifanye leo')) {
    throw new Error(`brief did not include yesterday and a next step:\n${brief.text}`);
  }
  if (!brief.sections.sales || brief.sections.profit == null) {
    throw new Error(`owner brief is missing sales or profit: ${JSON.stringify(brief.sections)}`);
  }
  if (brief.sections.lowStock?.length && (brief.action?.id !== 'prepare_purchase' || !brief.action.draft?.products?.[0]?.id)) {
    throw new Error(`low stock did not produce a purchase draft: ${JSON.stringify(brief.action)}`);
  }
  console.log('next step', brief.action?.label, brief.action?.draft?.products?.length || 0, 'products');
  console.log(brief.text);
  const saved = await saveDelivery({ userId, storeId, delivery: { bell: true, email: false, sms: 'no' } });
  if (!saved.bell || saved.email || saved.sms) throw new Error('a non-true choice was stored as on');
  const read = await getDelivery({ userId, storeId });
  if (!read.bell || read.email || read.sms) throw new Error('delivery was not read back');
  await saveDelivery({ userId, storeId, delivery: { bell: false, email: false, sms: false } });
  console.log('live checks passed');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
