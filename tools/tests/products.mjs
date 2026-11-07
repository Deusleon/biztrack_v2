import { ok, svc, signIn, finish } from './harness.mjs';
const { productService, categoryService } = svc;
const { store } = await signIn();
const cat = (await categoryService.getAll({ limit: 500 })).data[0];
const before = (await productService.getAll({ limit: 5 })).pagination.totalItems;
// the exact payload pages/inventory/Products.jsx sends when ADDING
const created = await productService.create({ product_name: 'ZZ Test Product', unit: 'unit_pc', product_category: cat.id, product_description: 'made by test', alert_qty: 3, barcode: 'ZZ9999000111', storeId: store.id, cost_price: 1000, selling_price: 1500, current_stock: 20, mfg_date: '2026-01-01', exp_date: '2027-01-01' });
ok('product create (cost 1000, price 1500, stock 20)', created.success && created.data?.id, created.message);
let p = (await productService.getAll({ search: 'ZZ Test Product' })).data[0];
ok('listed with category, stock, price, one batch', p && p.category_name === cat.name && Number(p.current_stock) === 20 && Number(p.selling_price) === 1500 && Number(p.cost_price) === 1000 && p.batches?.length === 1);
ok('barcode lookup', (await productService.getByBarcode('ZZ9999000111')).data?.id === p.id);
// the exact payload when EDITING (no cost/stock; selling_price is sent only because the server validator demands it; status_)
const upd = await productService.update(p.id, { product_name: 'ZZ Test Product 2', unit: 'unit_box', product_category: cat.id, product_description: 'edited', alert_qty: 5, barcode: 'ZZ9999000111', status_: 'inactive', selling_price: Number(p.selling_price), storeId: store.id });
ok('product update', upd.success);
p = (await productService.getAll({ search: 'ZZ Test Product 2' })).data[0];
ok('update visible; stock and price untouched', p.status === 'inactive' && p.unit === 'unit_box' && Number(p.current_stock) === 20 && Number(p.selling_price) === 1500);
try { await productService.update(p.id, { product_name: '', unit: 'unit_pc', product_category: cat.id, selling_price: 1, storeId: store.id }); ok('empty name refused', false); } catch (e) { ok('empty name refused', !!e.message, e.message); }
const a = await productService.create({ product_name: 'ZZ Bulk A', unit: 'unit_pc', product_category: cat.id, alert_qty: 0, storeId: store.id, cost_price: 1, selling_price: 2, current_stock: 0 });
const b = await productService.create({ product_name: 'ZZ Bulk B', unit: 'unit_pc', product_category: cat.id, alert_qty: 0, storeId: store.id, cost_price: 1, selling_price: 2, current_stock: 0 });
ok('three test products exist', (await productService.getAll({ limit: 5 })).pagination.totalItems === before + 3);
await productService.removeMany([p.id, a.data.id, b.data.id]);
ok('bulk delete removes exactly those three', (await productService.getAll({ limit: 5 })).pagination.totalItems === before);
const all = []; let page = 1, tp = 1;
do { const r = await productService.getAll({ page, limit: 2 }); all.push(...r.data); tp = r.pagination.totalPages; page++; } while (page <= tp);
ok('paging collects every product once', all.length === before && new Set(all.map((x) => x.id)).size === before);
finish();
