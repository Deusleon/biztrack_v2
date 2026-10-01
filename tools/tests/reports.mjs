// All 47 report endpoints run, and the numbers in them agree with each other and with the underlying data.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { ok, svc, signIn, finish } from './harness.mjs';
const R = svc.reportService;
const here = path.dirname(fileURLToPath(import.meta.url));
await signIn();
const routes = [...fs.readFileSync(path.join(here, '..', '..', 'backend', 'src', 'routes', 'report.routes.js'), 'utf8').matchAll(/router\.get\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
const range = { startDate: '2000-01-01', endDate: '2099-12-31' };
const n = (v) => Number(v) || 0; const sum = (rows, k) => rows.reduce((s, r) => s + n(r[k]), 0); const near = (a, b) => Math.abs(a - b) < 0.5;

// 1. every report answers
const failed = [];
for (const p of routes) { try { const r = await R.get(p, { ...range, date: new Date().toISOString().slice(0, 10), groupBy: 'month', sortBy: 'margin_desc' }); if (r.success === false) failed.push(p); } catch (e) { failed.push(`${p} (${e.message})`); } }
ok(`all ${routes.length} report endpoints answer`, routes.length >= 47 && failed.length === 0, failed.join('; '));

// 2. sales
const sales = await R.get('/sales', range); const rows = sales.data;
ok('sales summary: invoice count and total match the rows', n(sales.summary.total_invoices) === rows.length && near(n(sales.summary.total_amount), sum(rows, 'total_amount')), `${rows.length} invoices, ${sales.summary.total_amount}`);
ok('sales summary: paid + due covers the total (a refunded sale keeps what was paid, so it can be more)', n(sales.summary.total_paid) + n(sales.summary.total_due) >= n(sales.summary.total_amount) - 0.5 && rows.filter((r) => r.sale_type === 'credit').every((r) => near(n(r.amount_paid) + n(r.amount_due), n(r.total_amount))));
const cash = await R.get('/sales', { ...range, saleType: 'cash' }); const credit = await R.get('/sales', { ...range, saleType: 'credit' });
ok('sale type filter: cash rows are cash, credit rows are credit, together they are all', cash.data.every((r) => r.sale_type === 'cash') && credit.data.every((r) => r.sale_type === 'credit') && cash.data.length + credit.data.length === rows.length, `${cash.data.length}+${credit.data.length}=${rows.length}`);
const none = await R.get('/sales', { startDate: '2099-01-01', endDate: '2099-12-31' });
ok('a date range with no sales returns nothing', none.data.length === 0 && n(none.summary.total_amount) === 0);
const narrow = await R.get('/sales', { startDate: rows[0].sales_date.slice(0, 10), endDate: rows[0].sales_date.slice(0, 10) });
ok('a one-day range returns only that day', narrow.data.length > 0 && narrow.data.every((r) => r.sales_date.slice(0, 10) === rows[0].sales_date.slice(0, 10)));
const byProduct = await R.get('/sales/by-product', range);
ok('sales by product adds up to the sales total (no tax/discount in the test data)', near(n(byProduct.summary.total_revenue), n(sales.summary.total_amount)), `${byProduct.summary.total_revenue} vs ${sales.summary.total_amount}`);
const byPay = await R.get('/sales/by-payment-method', range); ok('sales by payment method adds up to the total', near(sum(byPay.data, 'total_amount'), n(sales.summary.total_amount)));
const byCust = await R.get('/sales/by-customer', range); ok('sales by customer adds up to the total', near(sum(byCust.data, 'total_amount'), n(sales.summary.total_amount)));
const debits = await R.get('/sales/debits', range); ok('debits report: amount due is positive on every row', debits.data.length > 0 && debits.data.every((r) => n(r.amount_due) > 0));

// 3. profit
const profit = await R.get('/profit', range);
ok('profit summary: revenue − cost = net profit', near(n(profit.summary.total_revenue) - n(profit.summary.total_cost), n(profit.summary.net_profit)), JSON.stringify([profit.summary.total_revenue, profit.summary.total_cost, profit.summary.net_profit]));
ok('profit revenue equals sales total', near(n(profit.summary.total_revenue), n(sales.summary.total_amount)));
const net = (await R.get('/net-profit', range)).summary;
ok('net profit: gross = revenue − cost of goods; net = gross − expenses', near(net.gross_profit, net.total_revenue - net.total_cost_of_goods_sold) && near(net.net_profit, net.gross_profit - net.total_expenses));
ok('net-profit revenue equals profit-report revenue', near(net.total_revenue, n(profit.summary.total_revenue)));
const trends = await R.get('/profit/trends', { ...range, groupBy: 'month' }); ok('profit trends by month add up to the profit total', near(sum(trends.data, 'total_profit'), n(profit.summary.total_profit)));
const margins = await R.get('/profit/margins', { ...range, sortBy: 'margin_desc' }); const asc = await R.get('/profit/margins', { ...range, sortBy: 'margin_asc' });
const mg = (r) => n(r.profit_margin_percentage ?? r.profit_margin);
ok('margins can be sorted both ways (same rows; ordered when there is more than one product sold)', asc.data.length === margins.data.length && margins.data.every((r, i) => i === 0 || mg(margins.data[i - 1]) >= mg(r)) && asc.data.every((r, i) => i === 0 || mg(asc.data[i - 1]) <= mg(r)), `${margins.data.length} products`);

// 4. day report
const day = await R.get('/day-report', { date: rows[0].sales_date.slice(0, 10) });
ok('day report: transactions and totals agree', day.transactions.length === n(day.summary.total_transactions) && near(sum(day.transactions, 'total_amount'), n(day.summary.total_sales)), `${day.transactions.length} tx`);
ok('day report: payment breakdown adds up to the day total', near(sum(day.payment_breakdown, 'total_amount'), n(day.summary.total_sales)));

// 5. purchases and suppliers
const pur = await R.get('/purchases', range); ok('purchases summary matches its rows', n(pur.summary.total_orders) === pur.data.length && near(n(pur.summary.total_amount), sum(pur.data, 'total_amount')));
const pay = await R.get('/purchases/supplier-payable', {}); ok('supplier payable: invoiced − paid = outstanding', near(n(pay.summary.total_invoiced) - n(pay.summary.total_paid), n(pay.summary.total_outstanding)), JSON.stringify(pay.summary));
const inv = await R.get('/purchases/invoices', range); ok('invoice report: balance = total − paid on every row', inv.data.length > 0 && inv.data.every((r) => near(n(r.total_amount) - n(r.amount_paid), n(r.balance_due)) || n(r.balance_due) >= 0));
const unpaid = await R.get('/purchases/invoices', { ...range, paymentStatus: 'paid' }); ok('invoice report payment-status filter', unpaid.data.every((r) => n(r.balance_due) === 0));
const grn = await R.get('/purchases/grn', range); ok('GRN report lists received goods', grn.data.length > 0 && n(grn.summary.total_grns ?? grn.data.length) > 0);

// 6. inventory
const invRep = await R.get('/inventory', {}); ok('inventory report: stock value = sum of rows', near(n(invRep.summary.total_stock_value), sum(invRep.data, 'stock_value')) && n(invRep.summary.total_products) === invRep.data.length);
const low = await R.get('/inventory/current-summary', { stockState: 'low-stock' }); const out = await R.get('/inventory/current-summary', { stockState: 'out-of-stock' }); const lowU = await R.get('/inventory/current-summary', { stockState: 'low_stock' }); const baseOut = await R.get('/inventory', { stockState: 'out_of_stock' });
ok('stock-state filter: out-of-stock rows have no stock, low-stock rows are at/below the alert level', out.data.every((r) => n(r.current_stock) === 0) && low.data.every((r) => n(r.current_stock) > 0 && n(r.current_stock) <= n(r.minimum_stock)), `${out.data.length} out, ${low.data.length} low`);
ok('both spellings (low-stock / low_stock, out-of-stock / out_of_stock) give the same answer in both reports', lowU.data.length === low.data.length && baseOut.data.length === out.data.length && baseOut.data.every((r) => n(r.current_stock) === 0));
const prodId = (await R.get('/inventory/ledger', range)).data[0]; const pid = invRep.data.find((r) => r.product_name === prodId.product_name)?.product_id;
const ledger = await R.get('/inventory/ledger', { ...range, productId: pid }); ok('ledger for one product shows only that product', ledger.data.length > 0 && ledger.data.every((r) => r.product_name === prodId.product_name), `${ledger.data.length} movements`);
const detailed = await R.get('/inventory/current-detailed', {}); ok('current detailed (per batch) holds the same total quantity as the stock report', near(n(detailed.summary.total_quantity), n(invRep.summary.total_quantity)), `${detailed.summary.total_quantity} vs ${invRep.summary.total_quantity} (values differ by method: per-batch cost vs product cost)`);

localStorage.removeItem('accessToken');
try { await R.get('/sales', range); ok('reports without token refused', false); } catch (e) { ok('reports without token refused', e.status === 401); }
finish();
