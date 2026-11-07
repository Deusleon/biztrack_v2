// Full sales flow against a live backend: cash sale, stock, pending order (edit / pay / sell / cancel / reopen / delete),
// credit sale + payments, returns (create / approve / reject). Uses a brand-new product per run, so it is re-runnable.
// NOTE: sales cannot be deleted, so every run leaves a few sales in the TEST database (re-run load-test-db.sh to reset).
import { ok, svc, signIn, finish } from './harness.mjs';
const { salesService: S, productService, categoryService, customerService } = svc;
const { store } = await signIn();
const cat = (await categoryService.getAll({ limit: 5 })).data[0];
const name = `ZZ POS ${Date.now()}`;
await productService.create({ product_name: name, unit: 'unit_pc', product_category: cat.id, alert_qty: 1, storeId: store.id, cost_price: 1000, selling_price: 1500, current_stock: 50 });
const find = async () => (await productService.getAll({ search: name })).data[0];
const stock = async () => Number((await find()).current_stock);
const prod = await find();
ok('test product created with stock 50', (await stock()) === 50);
const customer = (await customerService.getAll({ limit: 5 })).data[0];

const sync = (code, qty, price = 1500, discount = 0) => S.syncActiveCart({ cart_code: code, items: [{ product_id: prod.id, quantity: qty, price, discount, discount_mode: 'amount' }] });
const body = (code, qty, extra = {}) => { const sub = qty * 1500; return { cart_code: code, priceCategory: null, salesDate: '2026-11-07 12:00:00', items: [{ product_id: prod.id, quantity: qty, selling_price: 1500, discount: 0 }], customerId: null, customerName: 'Walk-in', customerPhone: null, subTotal: sub, amountTax: 0, totalDiscount: 0, discountMode: 'amount', amountTotal: sub, amountPaid: sub, amountDue: 0, amountChange: 0, paymentMethod: 'cash', paymentNotes: '', saleType: 'cash', ...extra }; };

await S.syncActiveCart({ items: [] });            // no cart_code → clears every unfinished cart of this user (earlier runs)
// ── cash sale ────────────────────────────────────────────────────────────────────────────────────
let c = `T-${Date.now()}`; await sync(c, 2);
const cart = await S.getActiveCart();
ok('synced cart comes back as the active cart (what POS restores)', cart.cart_code === c && cart.items.length === 1 && Number(cart.items[0].quantity) === 2);
const sale = await S.recordSale(body(c, 2));
ok('cash sale → invoice number, total, items', sale.success && sale.invoice_number && Number(sale.total_amount) === 3000 && sale.items.length === 1, `invoice ${sale.invoice_number}`);
ok('stock went 50 → 48', (await stock()) === 48);
const h = await S.history({ search: sale.invoice_number, limit: 5 });
ok('sale is in history with its total', h.sales.some((x) => x.invoice_number === sale.invoice_number && Number(x.total_amount) === 3000));
const det = await S.saleDetails(sale.invoice_number);
ok('sale details: payment + item', Number(det.payment.total_amount) === 3000 && det.items.length === 1 && det.items[0].name === name);
try { await S.recordSale(body(c, 2)); ok('selling the same cart twice is refused', false); } catch (e) { ok('selling the same cart twice is refused', !!e.message, e.message); }
c = `T-${Date.now()}x`; await sync(c, 5000);
try { await S.recordSale(body(c, 5000)); ok('selling more than the stock is refused', false); } catch (e) { ok('selling more than the stock is refused', !!e.message, e.message); }
ok('stock unchanged after the refused sale', (await stock()) === 48);
await S.syncActiveCart({ cart_code: c, items: [] });

// ── pending order ────────────────────────────────────────────────────────────────────────────────
c = `D-${Date.now()}`; await sync(c, 3);
const draft = await S.saveDraftOrder(body(c, 3, { saleType: 'pending', amountPaid: 0, amountDue: 4500, customerName: 'Typed Customer', customerPhone: '255700000123' }));
ok('save as pending with a typed (new) customer — needs the customerId fix', draft.success && draft.order_number, `order ${draft.order_number}`);
let pl = await S.getPendingOrders();
ok('pending list contains it with its value', pl.orderDatas.some((o) => o.cart_code === c && Number(o.order_value) === 4500));
ok('pending order does not touch stock', (await stock()) === 48);
const ed = await S.getOrderForEdit(c);
ok('order for edit returns lines with unit and customer', ed.cartDatas.length === 1 && ed.cartDatas[0].unit && ed.cartDatas[0].customer_name === 'Typed Customer');
await S.saveOrderChanges({ cart_code: c, orderNumber: draft.order_number, items: [{ product_id: prod.id, quantity: 4, selling_price: 1500, discount: 0 }], customerId: ed.cartDatas[0].customer_id, subTotal: 6000, amountTax: 0, totalDiscount: 0, discountMode: 'amount', amountTotal: 6000, amountPaid: 0, amountDue: 6000, amountChange: 0, paymentMethod: 'cash', note: 'edited' });
let od = await S.getOrder(c);
ok('saved changes: quantity 4, total 6000', Number(od.cartDatas[0].quantity) === 4);
await S.recordOrderPayments({ amount: 6000, amount_paid: 2000, amount_due: 6000, cart_code: c, payment_method: 'cash' });
od = await S.getOrder(c);
ok('payment on the order is recorded (2000 in total)', od.paymentDatas.reduce((s, p) => s + Number(p.amount_paid), 0) === 2000);
await S.cancelOrder(c);
ok('cancelled order is marked cancelled and shows in the cancelled list', String((await S.getOrder(c)).cartDatas[0].status).toLowerCase().includes('cancel') && (await S.getPendingOrders('Cancelled')).orderDatas.some((o) => o.cart_code === c) && !(await S.getPendingOrders()).orderDatas.some((o) => o.cart_code === c));
await S.reopenOrder(c);
ok('reopened order is back in the waiting list', (await S.getPendingOrders()).orderDatas.some((o) => o.cart_code === c));
const sold = await S.sellOrder(c);
ok('pending order sold → invoice + stock 48 → 44', sold.success && sold.invoice_number && (await stock()) === 44, `invoice ${sold.invoice_number}`);
pl = await S.getPendingOrders();
ok('sold order left the pending list', !pl.orderDatas.some((o) => o.cart_code === c));
c = `D-${Date.now()}b`; await sync(c, 1);
await S.saveDraftOrder(body(c, 1, { saleType: 'pending', amountPaid: 0, amountDue: 1500, customerName: 'Delete Me', customerPhone: '255700000124' }));
await S.deleteOrder(c);
ok('deleted order is gone', !(await S.getPendingOrders()).orderDatas.some((o) => o.cart_code === c));

// ── credit sale + debit payments ────────────────────────────────────────────────────────────────
c = `C-${Date.now()}`; await sync(c, 2);
const cr = await S.recordSale(body(c, 2, { saleType: 'credit', amountPaid: 500, amountDue: 2500, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone }));
ok('credit sale recorded; stock 44 → 42', cr.success && (await stock()) === 42);
const cl = await S.credit({ search: cr.invoice_number, limit: 5 });
const credit = cl.credit_sales.find((x) => x.invoice_number === cr.invoice_number);
ok('credit sale listed with due 2500', credit && Number(credit.amount_due) === 2500 && Number(credit.amount_paid) === 500);
ok('credit list sends a summary', cl.summary && typeof cl.summary === 'object', JSON.stringify(cl.summary));
await S.recordCreditPayment(credit.id, { amount: 1000, paymentMethod: 'cash', notes: 'test' });
let cd = await S.creditDetails(credit.id);
ok('payment of 1000 → due 1500, one payment on record', Number(cd.credit_sale.amount_due) === 1500 && cd.payments.length >= 1);
try { await S.recordCreditPayment(credit.id, { amount: 99999, paymentMethod: 'cash' }); ok('paying more than due is refused', false); } catch (e) { ok('paying more than due is refused', !!e.message, e.message); }
await S.recordCreditPayment(credit.id, { amount: 1500, paymentMethod: 'cash' });
cd = await S.creditDetails(credit.id);
ok('final payment closes the debt', Number(cd.credit_sale.amount_due) === 0 && String(cd.credit_sale.status).toLowerCase() === 'paid', `status ${cd.credit_sale.status}`);
const mo = await S.markOverdue(); ok('mark overdue runs', mo.success !== false);

// ── returns ─────────────────────────────────────────────────────────────────────────────────────
const ret = await S.createReturn({ invoiceNumber: sale.invoice_number, items: [{ product_id: prod.id, quantity: 1, price: 1500, condition: 'good', restock: true, reason: 'test' }], reason: 'test', notes: '', refundMethod: 'cash' });
ok('return created (pending)', ret.success && ret.return?.id, JSON.stringify(Object.keys(ret.return || {})));
ok('stock not changed until approval', (await stock()) === 42);
const rid = ret.return.id;
const rl = await S.returns({ search: sale.invoice_number, limit: 5 });
ok('return in the list', rl.returns.some((r) => r.id === rid));
const rd = await S.returnDetails(rid); console.log('INFO return detail keys:', Object.keys(rd).join(','), '|', Object.keys(rd.return || rd.sales_return || {}).join(','));
await S.approveReturn(rid);
ok('approved return restocks: 42 → 43', (await stock()) === 43);
const ret2 = await S.createReturn({ invoiceNumber: sale.invoice_number, items: [{ product_id: prod.id, quantity: 1, price: 1500, condition: 'damaged', restock: false, reason: 'broken' }], reason: 'broken', notes: '', refundMethod: 'cash' });
await S.rejectReturn(ret2.return.id, 'not valid');
ok('rejected return changes nothing: stock stays 43', (await stock()) === 43);
try { await S.createReturn({ invoiceNumber: sale.invoice_number, items: [{ product_id: prod.id, quantity: 99, price: 1500, condition: 'good', restock: true }], reason: 'x', refundMethod: 'cash' }); ok('returning more than was sold is refused', false); } catch (e) { ok('returning more than was sold is refused', !!e.message, e.message); }

localStorage.removeItem('accessToken');
try { await S.history({}); ok('sales history without token refused', false); } catch (e) { ok('sales history without token refused', e.status === 401); }
finish();
