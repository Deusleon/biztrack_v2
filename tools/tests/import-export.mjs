// Excel import / export: builds real .xlsx files with the template's own columns, imports them (full / products / stock / prices),
// checks the products, stock and prices that result, a bad row being reported, and the export containing the new products.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const XLSX = createRequire(import.meta.url)('../../frontend/node_modules/xlsx');
const { importExportService: X, productService, priceCategoryService, categoryService } = svc;
await signIn();
const tag = Date.now();
const keys = (o) => Object.keys(o || {}).join(',');
const cat = (await categoryService.getAll({ limit: 5 })).data[0];
const pcs = (await priceCategoryService.getAll()).data.map((p) => p.name);
const sheet = (name, rows) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name); return new File([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })], `${name}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); };
const find = async (n) => (await productService.getAll({ search: n })).data[0];
const prices = (v) => Object.fromEntries(pcs.map((n) => [n, v]));

for (const type of ['products', 'stock', 'prices', 'full']) { const b = await X.template(type, 'arraybuffer'); ok(`template ${type} downloads as a real workbook`, !!XLSX.read(Buffer.from(b), { type: 'buffer' }).SheetNames.length); }

// full import: two products with stock, cost, prices, batch, dates — and one bad row
const A = `ZZ Imp A ${tag}`; const B = `ZZ Imp B ${tag}`;
const full = sheet('Products', [
  { 'Product Name *': A, 'Product Category': cat.name, Barcode: `ZI${tag}1`, Unit: 'unit_pc', 'Alert Quantity': 3, 'Current Stock *': 7, 'Batch Number': `IB-${tag}`, 'Cost Price *': 700, ...prices(1200), 'Manufactured Date': '2026-01-01', 'Expiry Date': '2029-01-01', Description: 'imported', Status: 'active' },
  { 'Product Name *': B, 'Product Category': cat.name, Barcode: `ZI${tag}2`, Unit: 'unit_box', 'Alert Quantity': 1, 'Current Stock *': 9, 'Batch Number': `IB2-${tag}`, 'Cost Price *': 900, ...prices(1800), Description: '', Status: 'active' },
  { 'Product Name *': '', 'Product Category': cat.name, Barcode: `ZI${tag}3`, Unit: 'unit_pc', 'Current Stock *': 1, 'Cost Price *': 1, ...prices(2) },
].map((r) => { const o = {}; for (const [k, v] of Object.entries(r)) o[k.replace(/^(Jumla|Rejareja|WholeSale)$/, '$1 *')] = v; return o; }));
const first = await X.importFile('full', full);
ok('rows with errors → the server asks for confirmation and imports NOTHING yet', first.requiresConfirmation === true && !(await find(A)), JSON.stringify(first.results));
const res = await X.importFile('full', full, { confirmed: true });
console.log('INFO import result keys:', keys(res), '|', JSON.stringify(res).slice(0, 260));
const a = await find(A); const b = await find(B);
ok('imported product A with stock 7 and category', !!a && Number(a.current_stock) === 7 && a.category_name === cat.name, a ? `${a.current_stock}, price ${a.selling_price}` : 'missing');
ok('imported product B with stock 9', !!b && Number(b.current_stock) === 9);
ok('a bad row (no name) did not create anything and did not stop the others', !(await productService.getAll({ search: `ZI${tag}3` })).data.length);
ok('the confirmed import reports 2 imported and the bad row', res.results?.success === 2 && res.results?.failed === 1 && res.results.errors[0].errorKey === 'product_name_required', JSON.stringify(res.results));

// stock import: +5 on A by barcode
await X.importFile('stock', sheet('Stock', [{ 'Product Name *': A, 'Barcode *': `ZI${tag}1`, 'Quantity *': 5, 'Batch Number': `IB3-${tag}`, 'Expiry Date': '2029-06-01' }]));
ok('stock import adds 5 → 12', Number((await find(A)).current_stock) === 12, `stock ${(await find(A)).current_stock}`);
// prices import
await X.importFile('prices', sheet('Prices', [{ 'Product Name *': A, 'Barcode *': `ZI${tag}1`, 'Batch Number': `IB3-${tag}`, 'Cost Price': 750, ...Object.fromEntries(pcs.map((n) => [`${n} *`, 1999])) }]));
const pl = await svc.inventoryService.priceList({ priceCategoryId: (await priceCategoryService.getAll()).data[0].id, search: A, expandBatches: true, limit: 10 });
ok('prices import sets 1999 on the new batch', JSON.stringify(pl.products).includes('1999'), JSON.stringify(pl.products.map((p) => p.sellingPrice)));
// products import (no stock)
const C = `ZZ Imp C ${tag}`;
await X.importFile('products', sheet('Products', [{ 'Product Name *': C, 'Product Category': cat.name, Barcode: `ZI${tag}9`, 'Unit *': 'unit_pc', 'Alert Quantity': 2, Description: 'only the product' }]));
const c = await find(C); ok('products import creates the product with no stock', !!c && Number(c.current_stock) === 0);
// not a spreadsheet
try { await X.importFile('products', new File([Buffer.from('not a spreadsheet')], 'x.xlsx', { type: 'text/plain' })); ok('a file that is not a spreadsheet is refused', false); } catch (e) { ok('a file that is not a spreadsheet is refused', !!e.message, e.message); }
// export
const ex = await X.exportData('full', 'arraybuffer'); const wb = XLSX.read(Buffer.from(ex), { type: 'buffer' });
ok('export contains the imported products', JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])).includes(A));
localStorage.removeItem('accessToken');
try { await X.template('products', 'arraybuffer'); ok('templates without token refused', false); } catch (e) { ok('templates without token refused', e.status === 401); }
finish();
