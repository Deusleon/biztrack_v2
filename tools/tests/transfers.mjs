// Stock transfer between two stores of the same person: create → approve (stock leaves) → receive in the other store →
// cancel / delete paths. Needs a second store the test user belongs to (default "SALES SHOP").
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const pgPool = new (createRequire(import.meta.url)('../../backend/node_modules/pg').Pool)({ connectionString: process.env.DATABASE_URL });
const { stockTransferService: T, productService, categoryService, storeService, authService, inventoryService: I } = svc;
const { store } = await signIn();
const keys = (o) => Object.keys(o || {}).join(',');
const stores = (await storeService.getMine()).data;
const dest = stores.find((s) => s.name === (process.env.TEST_DEST_STORE || 'SALES SHOP'));
const goTo = async (s) => { const sw = await authService.switchStore(s.id); localStorage.setItem('accessToken', sw.token); localStorage.setItem('currentStoreId', s.id); return sw; };
const tag = Date.now();
const cat = (await categoryService.getAll({ limit: 5 })).data[0];
await productService.create({ product_name: `ZZ Move ${tag}`, unit: 'unit_pc', product_category: cat.id, alert_qty: 1, storeId: store.id, cost_price: 800, selling_price: 1500, current_stock: 20 });
const prod = (await productService.getAll({ search: `ZZ Move ${tag}` })).data[0];
const stock = async () => Number((await productService.getAll({ search: `ZZ Move ${tag}` })).data[0]?.current_stock ?? 0);
ok('second store found for the test', !!dest, stores.map((s) => s.name).join(', '));

const tr = await T.create({ destination_store_id: dest.id, items: [{ product_id: prod.id, quantity: 5 }], notes: 'test transfer' });
ok('transfer created (pending approval)', tr.success && tr.transfer?.id, `${tr.transfer?.transfer_ref || tr.transfer?.reference_number || ''} ${tr.transfer?.status}`);
console.log('INFO transfer keys:', keys(tr.transfer));
const id = tr.transfer.id;
ok('stock is unchanged until approval', (await stock()) === 20);
let d = await T.detail(id); console.log('INFO detail item keys:', keys(d.transfer.items?.[0]));
const out = await T.history({ direction: 'outgoing', limit: 10 }); ok('listed as outgoing', (out.transfers || []).some((x) => x.id === id), keys(out.transfers?.[0]));
await T.approve(id);
ok('approved: stock leaves the source 20 → 15', (await stock()) === 15, `stock ${await stock()}`);
d = await T.detail(id); console.log('INFO status after approval:', d.transfer.status);

// A store needs a default price category in its settings before its product list works (the original behaves the same):
// make sure the destination has one.
await goTo(dest);
{ const has = (await pgPool.query(`SELECT settings->'operations'->>'defaultPriceCategory' AS d FROM store_settings WHERE store_id = $1`, [dest.id])).rows[0]?.d;
  if (!has) { let pc = (await pgPool.query(`SELECT id FROM price_categories WHERE store_id = $1 ORDER BY created_at LIMIT 1`, [dest.id])).rows[0]; if (!pc) pc = (await pgPool.query(`INSERT INTO price_categories (store_id, name, description, is_active) VALUES ($1, 'Retail', 'test', true) RETURNING id`, [dest.id])).rows[0];
    await pgPool.query(`UPDATE store_settings SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{operations}', COALESCE(settings->'operations','{}'::jsonb) || $2::jsonb, true) WHERE store_id = $1`, [dest.id, JSON.stringify({ defaultPriceCategory: pc.id })]); } }
// receive in the destination store
const inc = await T.history({ direction: 'incoming', limit: 10 }); ok('destination sees it as incoming', (inc.transfers || []).some((x) => x.id === id));
const di = (await T.detail(id)).transfer; const it = di.items[0];
try {
  await T.receive(id, [{ id: it.id, product_id: it.product_id, quantity: 5, batch_number: `TR-${tag}`, cost_price: 800, selling_price: 1500, expiry_date: '2029-01-01' }]);
  ok('received in the destination store', true);
} catch (e) { ok('received in the destination store', false, e.message); }
const there = (await productService.getAll({ search: `ZZ Move ${tag}` })).data[0];
ok('destination now holds 5 of the product', !!there && Number(there.current_stock) === 5, `${there ? there.current_stock : 'product missing'}`);
const done = (await T.detail(id)).transfer; ok('transfer completed', /complet|receiv/i.test(done.status), `status ${done.status}`);
await goTo(store);

// cancel path: approve then cancel puts the stock back
const t2 = (await T.create({ destination_store_id: dest.id, items: [{ product_id: prod.id, quantity: 3 }], notes: 'to cancel' })).transfer;
await T.approve(t2.id); ok('second transfer approved: stock 15 → 12', (await stock()) === 12, `stock ${await stock()}`);
await T.cancel(t2.id); ok('cancelled: stock back to 15', (await stock()) === 15, `stock ${await stock()}`);
// delete path
const t3 = (await T.create({ destination_store_id: dest.id, items: [{ product_id: prod.id, quantity: 1 }], notes: 'to delete' })).transfer;
try { await T.remove(t3.id); ok('pending transfer can be deleted', !(await T.history({ direction: 'outgoing', limit: 50 })).transfers.some((x) => x.id === t3.id)); } catch (e) { ok('pending transfer can be deleted', false, e.message); }
try { await T.create({ destination_store_id: dest.id, items: [{ product_id: prod.id, quantity: 9999 }] }).then((r) => T.approve(r.transfer.id)); ok('transferring more than the stock is refused', false); } catch (e) { ok('transferring more than the stock is refused', !!e.message, e.message); }
try { await T.create({ destination_store_id: store.id, items: [{ product_id: prod.id, quantity: 1 }] }); ok('transfer to the same store is refused', false); } catch (e) { ok('transfer to the same store is refused', !!e.message, e.message); }
ok('source stock still 15 at the end', (await stock()) === 15, `stock ${await stock()}`);
localStorage.removeItem('accessToken');
try { await T.history({}); ok('transfers without token refused', false); } catch (e) { ok('transfers without token refused', e.status === 401); }
await pgPool.end();
finish();
