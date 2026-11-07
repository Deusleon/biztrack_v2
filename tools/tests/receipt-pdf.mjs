// Generates a receipt with BizTrack's own PDF engine (utils/receiptPdf.js + utils/receiptData.js) in all three sizes and checks
// the files are real PDFs. No server needed. (It cannot judge the LOOK — compare a printed receipt with the original by eye.)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(here, '..', '..', 'frontend');
globalThis.window = globalThis; globalThis.__auth_user = null; globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { build } = await import(pathToFileURL(path.join(FRONT, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-pdf-')); const out = path.join(tmp, 'bundle.mjs'); const entry = path.join(tmp, 'entry.js');
const src = (f) => JSON.stringify(path.join(FRONT, 'src', f));
fs.writeFileSync(entry, `export { generateReceiptPDFBase64 } from ${src('utils/receiptPdf.js')};\nexport { buildReceiptData } from ${src('utils/receiptData.js')};`);
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, alias: { '@': path.join(FRONT, 'src') }, logLevel: 'error', loader: { '.json': 'json' }, external: ['jspdf-autotable/*'] });
const { generateReceiptPDFBase64, buildReceiptData } = await import(pathToFileURL(out).href);
let failed = 0; const ok = (n, c, e = '') => { if (!c) failed++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${e ? '  — ' + e : ''}`); };
const sale = { invoice_number: '00042', items: [{ id: 'a', name: 'Afya Water 1.5L', quantity: 3, price: 1500, discount: 0 }, { id: 'b', name: 'Bread', quantity: 1, price: 2500, discount: 100 }], customerInfo: { name: 'Test Customer', phone: '255700000001' },
  paymentInfo: { invoice_number: '00042', subtotal: '7000', total_amount: '6900', total_discount: '100', total_vat: '0', amount_paid: '7000', amount_due: '0', amount_change: '100', payment_method: 'cash', sales_date: '2026-11-07 12:00:00' } };
const settings = { businessName: 'Test Shop', address: 'Dar es Salaam', phone: '255700000000', defaultDecimalPlaces: 0, allowVAT: false, allowDiscount: true, defaultDiscountType: 'amount', showChangeOnReceipt: true };
for (const size of ['58mm', '80mm', 'A5']) {
  try { const b64 = generateReceiptPDFBase64(buildReceiptData({ sale, settings, cashierName: 'Cashier' }), size); const head = Buffer.from(b64.replace(/^data:[^,]+,/, ''), 'base64').subarray(0, 5).toString();
    ok(`receipt ${size} is a PDF`, head === '%PDF-' && b64.length > 3000, `${Math.round(b64.length * 0.75 / 1024)} KB`); }
  catch (e) { ok(`receipt ${size} is a PDF`, false, e.message); }
}
fs.rmSync(tmp, { recursive: true, force: true }); console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
