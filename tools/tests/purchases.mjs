// Full purchasing cycle against a live backend: supplier → purchase order → approval → goods received → inspection →
// supplier invoice → payments → supplier return. Uses a new supplier/product per run (re-runnable); leaves rows behind.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const pgPool = new (createRequire(import.meta.url)('../../backend/node_modules/pg').Pool)({ connectionString: process.env.DATABASE_URL });
const { supplierService, purchaseService: P, productService, categoryService } = svc;
const { store } = await signIn();
const tag = Date.now();
// store setting purchases.requireGRNInspection decides whether a new GRN waits for inspection or is approved at once
const setInspection = (v) => pgPool.query(`UPDATE store_settings SET settings = jsonb_set(COALESCE(settings,'{}'::jsonb), '{purchases}', COALESCE(settings->'purchases','{}'::jsonb) || $2::jsonb, true) WHERE store_id = $1`, [store.id, JSON.stringify({ requireGRNInspection: v })]);
await setInspection(false);
const cat = (await categoryService.getAll({ limit: 5 })).data[0];
await productService.create({ product_name: `ZZ Buy ${tag}`, unit: 'unit_pc', product_category: cat.id, alert_qty: 1, storeId: store.id, cost_price: 800, selling_price: 1500, current_stock: 10 });
const prod = (await productService.getAll({ search: `ZZ Buy ${tag}` })).data[0];
const stock = async () => Number((await productService.getAll({ search: `ZZ Buy ${tag}` })).data[0].current_stock);

// suppliers
const sup = (await supplierService.create({ name: `ZZ Supplier ${tag}`, contact_person: 'Juma', email: `zz${tag}@test.com`, phone: '255700000500', address: 'Dar', city: 'Dar es Salaam', country: 'Tanzania', tin_number: '123-456-789', vat_number: '', payment_terms: 'Net 30', notes: 'test' })).data;
ok('supplier create', !!sup?.id);
ok('supplier update', (await supplierService.update(sup.id, { name: `ZZ Supplier ${tag} B`, contact_person: 'Juma', email: `zz${tag}@test.com`, phone: '255700000500', address: 'Dar', city: 'Arusha', country: 'Tanzania', tin_number: '123-456-789', vat_number: '', payment_terms: 'Net 30', notes: 'test' })).data.city === 'Arusha');
ok('supplier search', (await supplierService.getAll({ search: `ZZ Supplier ${tag}` })).data.length === 1);

// purchase order
const poRes = await P.orders.create({ supplier_id: sup.id, expected_delivery_date: '2026-12-01', delivery_address: 'Shop', payment_terms: 'Net 30', notes: 'n', internal_notes: 'i', items: [{ product_id: prod.id, quantity: 20, unit_price: 800, discount_percent: 0, tax_rate: 0, notes: '' }] });
const po = poRes.data; ok('PO create', !!po?.id, `${po?.po_number || ''} status ${po?.status}`);
let one = (await P.orders.get(po.id)).data;
console.log('INFO PO keys:', Object.keys(one).join(','), '| item keys:', Object.keys(one.items[0]).join(','));
ok('PO has 1 item, total 16000', one.items.length === 1 && Number(one.total_amount) === 16000, `total ${one.total_amount}`);
const list = await P.orders.list({ search: po.po_number, limit: 5 });
ok('PO list → data + pagination', list.data.some((x) => x.id === po.id) && list.pagination.totalItems >= 1);
ok('PO update (notes + qty 20→25)', (await P.orders.update(po.id, { supplier_id: sup.id, expected_delivery_date: '2026-12-01', delivery_address: 'Shop', payment_terms: 'Net 30', notes: 'edited', internal_notes: 'i', items: [{ product_id: prod.id, quantity: 25, unit_price: 800, discount_percent: 0, tax_rate: 0, notes: '' }] })).success);
one = (await P.orders.get(po.id)).data; ok('PO now 25 × 800 = 20000', Number(one.total_amount) === 20000, `status ${one.status}`);
await P.orders.approve(po.id, 'approved');
one = (await P.orders.get(po.id)).data; ok('PO approved', one.status === 'approved', `status ${one.status}`);
console.log('INFO PO item:', JSON.stringify(one.items[0]).slice(0, 300));

// goods received
const poItem = one.items[0];
const grnRes = await P.grn.create({ supplier_id: sup.id, purchase_order_id: po.id, supplier_delivery_note: `DN-${tag}`, supplier_invoice_number: `INV-${tag}`, notes: 'received', items: [{ po_item_id: poItem.id, purchase_order_item_id: poItem.id, product_id: prod.id, expected_quantity: 25, quantity_received: 25, received_quantity: 25, unit_cost: 800, unit_price: 800, selling_price: 1500, batch_number: `B-${tag}`, manufacturing_date: '2026-10-01', expiry_date: '2028-10-01', notes: '' }] });
const grn = grnRes.data; ok('GRN create', !!grn?.id, `${grn?.grn_number || ''} status ${grn?.status}`);
let g = (await P.grn.get(grn.id)).data; console.log('INFO GRN keys:', Object.keys(g).join(','), '| item keys:', Object.keys(g.items[0]).join(','));
ok('GRN without inspection: approved and stock 10 → 35 at once', g.status === 'approved' && (await stock()) === 35, `status ${g.status}, stock ${await stock()}`);

// supplier invoice + payments
const invRes = await P.invoices.create({ supplier_id: sup.id, purchase_order_id: po.id, grn_id: grn.id, supplier_invoice_number: `INV-${tag}`, invoice_date: '2026-11-07', due_date: '2026-12-07', subtotal: 20000, tax_amount: 0, discount_amount: 0, shipping_cost: 0, other_charges: 0, total_amount: 20000, notes: '', items: [{ grn_item_id: g.items[0].id, product_id: prod.id, product_name: `ZZ Buy ${tag}`, description: '', quantity: 25, unit_price: 800, tax_rate: 0, tax_amount: 0, discount_amount: 0, notes: '' }] });
const inv = invRes.data; ok('supplier invoice create', !!inv?.id, `status ${inv?.status} pay ${inv?.payment_status}`);
let iv = (await P.invoices.get(inv.id)).data; console.log('INFO invoice keys:', Object.keys(iv).join(','));
ok('invoice total 20000 unpaid', Number(iv.total_amount) === 20000 && Number(iv.balance_due ?? iv.amount_due ?? 20000) === 20000);
const pay1 = await P.payments.create({ supplier_id: sup.id, supplier_invoice_id: inv.id, amount: 5000, payment_method: 'cash', payment_date: '2026-11-07', reference_number: 'R1', notes: '' });
ok('payment 5000 recorded', pay1.success && !!pay1.data?.id);
iv = (await P.invoices.get(inv.id)).data; ok('invoice partially paid', Number(iv.amount_paid) === 5000 && String(iv.payment_status).includes('partial'), `paid ${iv.amount_paid} ${iv.payment_status}`);
try { await P.payments.create({ supplier_id: sup.id, supplier_invoice_id: inv.id, amount: 999999, payment_method: 'cash', payment_date: '2026-11-07' }); ok('overpaying an invoice is refused', false); } catch (e) { ok('overpaying an invoice is refused', !!e.message, e.message); }
await P.payments.create({ supplier_id: sup.id, supplier_invoice_id: inv.id, amount: 15000, payment_method: 'bank_transfer', payment_date: '2026-11-07', reference_number: 'R2', bank_name: 'NMB', account_number: '1' });
iv = (await P.invoices.get(inv.id)).data; ok('invoice fully paid', String(iv.payment_status) === 'paid' && Number(iv.amount_paid) === 20000, `${iv.payment_status}`);
const pl = await P.payments.list({ supplier_id: sup.id, limit: 5 }); ok('payments list for supplier = 2', pl.data.length === 2);
await P.payments.remove(pay1.data.id);
iv = (await P.invoices.get(inv.id)).data; ok('cancelling a payment reopens 5000 of the invoice', Number(iv.amount_paid) === 15000, `paid ${iv.amount_paid} ${iv.payment_status}`);

// supplier return
const retRes = await P.returns.create({ supplier_id: sup.id, grn_id: grn.id, supplier_invoice_id: inv.id, return_date: '2026-11-07', return_reason: 'damaged', reason_details: 'broken', refund_method: 'credit_note', refund_reference: '', notes: '', items: [{ grn_item_id: g.items[0].id, product_id: prod.id, quantity: 5, unit_cost: 800, condition: 'damaged', reason: 'damaged' }] });
const rt = retRes.data; ok('supplier return create', !!rt?.id, `status ${rt?.status}`);
ok('stock not changed until approval', (await stock()) === 35);
await P.returns.approve(rt.id);
ok('approved return takes stock out: 35 → 30', (await stock()) === 30, `stock ${await stock()}`);
try { await P.returns.create({ supplier_id: sup.id, grn_id: grn.id, return_date: '2026-11-07', return_reason: 'damaged', items: [{ grn_item_id: g.items[0].id, product_id: prod.id, quantity: 999, unit_cost: 800, condition: 'damaged', reason: 'damaged' }] }).then((r) => P.returns.approve(r.data.id)); ok('returning more than received is refused', false); } catch (e) { ok('returning more than received is refused', !!e.message, e.message); }

// inspection required: GRN waits, stock moves only for ACCEPTED quantity
await setInspection(true);
const po3 = (await P.orders.create({ supplier_id: sup.id, items: [{ product_id: prod.id, quantity: 10, unit_price: 800, discount_percent: 0, tax_rate: 0 }] })).data;
await P.orders.approve(po3.id, 'approved'); const po3i = (await P.orders.get(po3.id)).data.items[0];
const grn2 = (await P.grn.create({ supplier_id: sup.id, purchase_order_id: po3.id, supplier_delivery_note: `DN2-${tag}`, items: [{ po_item_id: po3i.id, purchase_order_item_id: po3i.id, product_id: prod.id, expected_quantity: 10, quantity_received: 10, received_quantity: 10, unit_cost: 800, unit_price: 800, selling_price: 1500, batch_number: `B2-${tag}` }] })).data;
let g2 = (await P.grn.get(grn2.id)).data;
ok('GRN with inspection required waits (pending_inspection) and stock is unchanged (30)', g2.status === 'pending_inspection' && (await stock()) === 30, `status ${g2.status}`);
await P.grn.inspect(grn2.id, { inspection_status: 'partial', inspection_notes: '2 damaged', items: [{ id: g2.items[0].id, grn_item_id: g2.items[0].id, accepted_quantity: 8, rejected_quantity: 2, rejection_reason: 'damaged', unit_cost: 800, selling_price: 1500 }] });
g2 = (await P.grn.get(grn2.id)).data;
ok('inspection accepted 8 of 10: stock 30 → 38', (await stock()) === 38, `status ${g2.status}, stock ${await stock()}`);
await setInspection(false);

// deleting
const po2 = (await P.orders.create({ supplier_id: sup.id, items: [{ product_id: prod.id, quantity: 1, unit_price: 800, discount_percent: 0, tax_rate: 0 }] })).data;
try { await P.orders.remove(po2.id); ok('only DRAFT orders can be deleted', false); } catch (e) { ok('only DRAFT orders can be deleted (a new one is pending_approval)', !!e.message, e.message); }
await P.orders.update(po2.id, { supplier_id: sup.id, status: 'draft', items: [{ product_id: prod.id, quantity: 1, unit_price: 800, discount_percent: 0, tax_rate: 0 }] });
await P.orders.remove(po2.id); ok('draft PO deleted', !(await P.orders.list({ search: po2.po_number })).data.some((x) => x.id === po2.id));
ok('purchase dashboard answers', (await P.dashboard()).success);
localStorage.removeItem('accessToken');
try { await P.orders.list({}); ok('purchases without token refused', false); } catch (e) { ok('purchases without token refused', e.status === 401); }
await pgPool.end();
finish();
