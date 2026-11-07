// Stock side of the shop: adjustments, batches, stock value + snapshots, price list, stock count, expenses.
// Uses a new product per run; leaves rows behind in the TEST database.
import { ok, svc, signIn, finish } from './harness.mjs';
const { inventoryService: I, stockCountService: C, expenseService: E, productService, categoryService, priceCategoryService } = svc;
const { store } = await signIn();
const tag = Date.now();
const cat = (await categoryService.getAll({ limit: 5 })).data[0];
await productService.create({ product_name: `ZZ Stock ${tag}`, unit: 'unit_pc', product_category: cat.id, alert_qty: 5, storeId: store.id, cost_price: 800, selling_price: 1500, current_stock: 10 });
const prod = (await productService.getAll({ search: `ZZ Stock ${tag}` })).data[0];
const stock = async () => Number((await productService.getAll({ search: `ZZ Stock ${tag}` })).data[0].current_stock);
const keys = (o) => Object.keys(o || {}).join(',');

// current stock
const ss = await I.storeStock({ search: `ZZ Stock ${tag}`, limit: 5 });
console.log('INFO storeStock top:', keys(ss), '| row:', keys((ss.stock || [])[0]));
// adjustments
const adj = await I.createAdjustment({ product_id: prod.id, adjustment_type: 'add', quantity: 5, reason: 'found', notes: 'test' });
ok('adjustment +5 → stock 10 → 15', adj.success && (await stock()) === 15, `stock ${await stock()}`);
const adj2 = await I.createAdjustment({ product_id: prod.id, adjustment_type: 'subtract', quantity: 3, reason: 'damaged', notes: '' });
ok('adjustment −3 → stock 12', adj2.success && (await stock()) === 12, `stock ${await stock()}`);
try { await I.createAdjustment({ product_id: prod.id, adjustment_type: 'subtract', quantity: 9999, reason: 'lost', notes: '' }); ok('removing more than the stock is refused', false); } catch (e) { ok('removing more than the stock is refused', !!e.message, e.message); }
try { await I.createAdjustment({ product_id: prod.id, adjustment_type: 'add', quantity: 1, reason: 'because', notes: '' }); ok('an unknown reason is refused', false); } catch (e) { ok('an unknown reason is refused', !!e.message, e.message); }
const al = await I.adjustments({ product_id: prod.id, limit: 10 });
ok('adjustment history lists both', (al.adjustments || []).length === 2, `pagination ${JSON.stringify(al.pagination)}`);
const ad = await I.adjustmentDetail(adj.adjustment.id); console.log('INFO adjustment detail keys:', keys(ad.adjustment));
// batches
const bd = await I.batchDetails(prod.id); console.log('INFO batchDetails batch keys:', keys(bd.batches?.[0]));
const batch = bd.batches[0];
ok('product has at least one batch', !!batch?.id);
const bw = await I.batchwiseStock({ search: `ZZ Stock ${tag}` }); console.log('INFO batchwise row keys:', keys(bw.batches?.[0]));
const upd = await I.updateBatch({ batch_id: batch.id, batch_number: `BN-${tag}`, cost_price: 850, expiry_date: '2029-01-01' });
ok('edit batch (number, cost, expiry)', upd.success, upd.message);
const bd2 = await I.batchDetails(prod.id); ok('batch edit visible', bd2.batches.some((b) => b.batch_number === `BN-${tag}`), JSON.stringify(bd2.batches.map((b) => [b.batch_number, b.cost_price])));
const bwa = await I.batchwiseAdjustment({ product_id: prod.id, batch_id: batch.id, adjustment_type: 'add', quantity: 2, reason: 'correction', notes: '' });
ok('batch-wise adjustment +2 → stock 14', bwa.success && (await stock()) === 14, `stock ${await stock()}`);
const ex = await I.expiryRisk(4000); ok('expiry-risk report answers', ex.success);
const ls = await I.lowStock(); ok('low-stock list answers', ls.success);
const mv = await I.movements({ product_id: prod.id, limit: 20 }); console.log('INFO movements top:', keys(mv));

// stock value + snapshots
const pcs = (await priceCategoryService.getAll()).data;
const sv = await I.stockValue(pcs[0].id); console.log('INFO stockValue top:', keys(sv), '| row:', keys((sv.data || sv.items || sv.products || [])[0]), '| summary:', keys(sv.summary || sv.totals));
const snap = await I.saveValueSnapshot({ priceCategoryId: pcs[0].id, notes: `snapshot ${tag}` });
ok('save stock value snapshot', snap.success && snap.data?.id, JSON.stringify(Object.keys(snap.data || {})));
const vh = await I.valueHistory({ limit: 5 }); ok('snapshot appears in history', (vh.data || []).some((h) => h.id === snap.data.id));
const vd = await I.valueHistoryDetail(snap.data.id); console.log('INFO history detail keys:', keys(vd.data));
await I.deleteValueHistory(snap.data.id);
ok('snapshot deleted', !((await I.valueHistory({ limit: 50 })).data || []).some((h) => h.id === snap.data.id));

// price list
const pl = await I.priceList({ priceCategoryId: pcs[0].id, search: `ZZ Stock ${tag}`, expandBatches: true, limit: 10 });
console.log('INFO pricelist row keys:', keys(pl.products?.[0]), '| batches[0]:', keys(pl.products?.[0]?.batches?.[0]));
const row = pl.products[0];
const up = await I.updatePrices({ productId: prod.id, batchId: row.batchId || batch.id, priceCategoryId: pcs[0].id, sellingPrice: 1700, buyingPrice: 850 });
ok('update selling price to 1700', up.success !== false, up.message);
const pl2 = await I.priceList({ priceCategoryId: pcs[0].id, search: `ZZ Stock ${tag}`, expandBatches: true, limit: 10 });
ok('new price is in the price list', Number(pl2.products[0].sellingPrice) === 1700, `price ${pl2.products[0].sellingPrice}`);

// stock count
const cp = await C.products({ search: `ZZ Stock ${tag}`, limit: 5 }); console.log('INFO count product keys:', keys(cp.products?.[0]));
const sc = await C.save({ items: [{ product_id: prod.id, counted_qty: 10 }], notes: `count ${tag}` });
ok('stock count saved (counted 10, system 14 → −4)', sc.success && (await stock()) === 10, `stock ${await stock()}`);
console.log('INFO save keys:', keys(sc.stockCount));
const ch = await C.history({ limit: 5 }); ok('count history lists it', (ch.stockCounts || []).some((x) => x.id === sc.stockCount.id));
const cd = await C.detail(sc.stockCount.id); ok('count detail has the item with its difference', (cd.stockCount.items || []).length === 1, keys(cd.stockCount.items?.[0]));
const sc2 = await C.save({ items: [{ product_id: prod.id, counted_qty: 10 }], notes: 'same' }); ok('counting the same quantity changes nothing', (await stock()) === 10);
const abp = await C.adjustmentsByProduct({ limit: 500 }); const mine = (abp.products || []).find((x) => x.product_id === prod.id);
ok('adjustments by product lists our product with totals added 7 / subtracted 3', !!mine && Number(mine.total_added) >= 7 && Number(mine.total_subtracted) >= 3, JSON.stringify(mine));
const pa = await C.productAdjustments(prod.id, { limit: 50 }); ok('adjustment history of one product', pa.product?.id === prod.id && pa.adjustments.length >= 2, `${pa.adjustments.length} rows`);
const inMv = await C.movements({ movement_type: 'IN', search: `ZZ Stock ${tag}`, limit: 20 }); const outMv = await C.movements({ movement_type: 'OUT', search: `ZZ Stock ${tag}`, limit: 20 });
try { await C.movements({ movement_type: "IN' OR '1'='1", limit: 5 }); ok('a movement_type holding SQL is refused', false); } catch (e) { ok('a movement_type holding SQL is refused by the validator', !!e.message, e.message); }
ok('stock movements: incoming and outgoing for the product', inMv.movements.length >= 1 && outMv.movements.length >= 1 && inMv.summary.total_movements >= 1, `in ${inMv.movements.length}, out ${outMv.movements.length}`);

// expenses
const cats = await E.categories(); ok('expense categories', cats.data.length > 0, JSON.stringify(cats.data.slice(0, 3)));
const ec = cats.data[0]; const catName = typeof ec === 'string' ? ec : (ec.name || ec.category);
const ne = await E.create({ category: catName, amount: 12500, description: `ZZ expense ${tag}`, payment_method: 'cash', reference_number: 'R1', expense_date: '2026-11-07' });
ok('expense create', !!ne.data?.id);
const el = await E.list({ category: catName, startDate: '2026-11-01', endDate: '2026-11-30', limit: 50 }); console.log('INFO expenses keys:', keys(el.raw), '| summary:', JSON.stringify(el.summary));
ok('expense listed with a summary', el.data.some((x) => x.id === ne.data.id) && !!el.summary);
const eu = await E.update(ne.data.id, { category: catName, amount: 15000, description: `ZZ expense ${tag} edited`, payment_method: 'mobile_money', reference_number: 'R2', expense_date: '2026-11-07' });
ok('expense update', Number(eu.data.amount) === 15000);
try { await E.create({ category: catName, amount: -5, description: 'bad', payment_method: 'cash', expense_date: '2026-11-07' }); ok('negative expense refused', false); } catch (e) { ok('negative expense refused', !!e.message, e.message); }
await E.remove(ne.data.id); ok('expense delete', !(await E.list({ category: catName, startDate: '2026-11-01', endDate: '2026-11-30', limit: 50 })).data.some((x) => x.id === ne.data.id));
localStorage.removeItem('accessToken');
try { await I.storeStock({}); ok('inventory without token refused', false); } catch (e) { ok('inventory without token refused', e.status === 401); }
finish();
