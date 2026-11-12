// FILE PATH: frontend/src/pages/sales/Invoice.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import BarcodeScanner from '../../components/BarcodeScanner';
import { useStore } from '../../contexts/StoreContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { useSaleItems } from '../../hooks/useSaleItems';
import { salesService, productService, customerService, priceCategoryService } from '../../services/api';
import { Input, NumberInput, Select, Textarea, Button, ConfirmModal, FormModal, DatePicker } from '../../components/ui';
import { formatCurrency, formatNumberWithCommas, removeNumberFormatting } from '../../utils/numberUtils';
import { getMoneyDecimals } from '../../utils/money';
import { printReceiptViaQz } from '../../utils/qzReceipt';
import { t } from '../../utils/i18n';

const newCode = () => `S-ID-${Date.now()}`;
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const toServerDate = (v) => `${v.replace('T', ' ')}:00`;
const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank_transfer'];
const QTY_DECIMALS = 3;

/** Digits and one decimal point, with commas, while the person is still typing. */
const shapeNumber = (value, maxDecimals) => {
  let cleaned = String(value ?? '').replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot !== -1) cleaned = `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, '')}`;
  let [intPart, decPart] = cleaned.split('.');
  intPart = (intPart || '').replace(/^0+(?=\d)/, '');
  if (maxDecimals === 0) decPart = undefined;
  else if (decPart != null && maxDecimals != null) decPart = decPart.slice(0, maxDecimals);
  const commas = intPart ? Number(intPart).toLocaleString('en-US') : '';
  if (decPart != null) return `${commas || '0'}.${decPart}`;
  return commas;
};

/** Loads every page of a paged list (the POS needs all products / customers on hand to search instantly). */
const loadAll = async (fetchPage, max = 60) => {
  const all = []; let page = 1; let pages = 1;
  do { const r = await fetchPage(page); all.push(...r.rows); pages = r.pages; page += 1; } while (page <= pages && page <= max);
  return all;
};

export default function Invoice() {
  const { currentStore } = useStore();
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const navigate = useNavigate();
  const { state } = useLocation();
  const editCode = state?.fromPendingOrder ? state.cartCode : null;     // opened from "Pending orders → Edit"

  const discountEnabled = !!settings?.allowDiscount;
  const vatEnabled = !!settings?.allowVAT;
  const vatRate = removeNumberFormatting(settings?.defaultTaxRate) || 0;
  const sale = useSaleItems({ discountEnabled, vatEnabled, vatRate, settings });
  const { items, subtotal, totalDiscount, totalVat, grandTotal } = sale;
  const rows = items.filter((i) => i.productId);

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [priceCategories, setPriceCategories] = useState([]);
  const parsedDecimals = Number(settings?.defaultDecimalPlaces ?? getMoneyDecimals());
  const moneyDecimals = Number.isFinite(parsedDecimals) ? parsedDecimals : 0;
  const [priceCategory, setPriceCategory] = useState(() => (settings?.defaultPriceCategory ? String(settings.defaultPriceCategory) : ''));
  const categoryPicked = useRef(false);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [saleDate, setSaleDate] = useState(nowLocal());
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [barcode, setBarcode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(null);            // 'cash' | 'credit' | 'pending' | 'save'
  const [cartCode, setCartCode] = useState(editCode || newCode());
  const [orderNumber, setOrderNumber] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [hasPayments, setHasPayments] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [editReady, setEditReady] = useState(false);
  const restored = useRef(false);
  const baseline = useRef(null);
  const syncTimer = useRef(null);

  const customer = customers.find((c) => c.id === customerId) || null;
  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const priceFrom = (p) => {
    const direct = Number(p.selling_price ?? p.sellingPrice) || 0;
    if (direct > 0) return direct;
    const batches = [...(p.batches || [])].sort((a, b) => Number(b.status === 'in_use') - Number(a.status === 'in_use'));
    const hit = batches.find((b) => (Number(b.selling_price ?? b.sellingPrice) || 0) > 0);
    return hit ? Number(hit.selling_price ?? hit.sellingPrice) : 0;
  };
  const total = grandTotal;
  const paidNum = removeNumberFormatting(paid) || 0;
  const fullyPaid = rows.length > 0 && paidNum + 0.0001 >= total;
  const orderKey = () => JSON.stringify({
    lines: rows.map((i) => [i.productId, Math.round((Number(i.rawQuantity) || 0) * 1000), Math.round((Number(i.rawPrice) || 0) * 100), Math.round((Number(i.rawDiscount) || 0) * 100)]),
    customerId: customerId || '',
    notes: notes.trim(),
  });
  const dirty = !!editCode && baseline.current != null && orderKey() !== baseline.current; // eslint-disable-line react-hooks/refs -- baseline is a snapshot taken when the order loads; comparing it during render is the point

  // ── data ─────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => { categoryPicked.current = false; }, [currentStore?.id]);
  useEffect(() => {
    if (categoryPicked.current || editCode) return;
    if (settings?.defaultPriceCategory) setPriceCategory(String(settings.defaultPriceCategory));
  }, [settings?.defaultPriceCategory, currentStore?.id, editCode]);

  useEffect(() => {
    if (!currentStore?.id) return;
    priceCategoryService.getAll().then((r) => setPriceCategories(r.data)).catch(() => {});
    loadAll(async (page) => { const r = await customerService.getAll({ page, limit: 100 }); return { rows: r.data, pages: r.pagination.totalPages }; })
      .then(setCustomers).catch(() => {});
  }, [currentStore?.id]);

  const loadProducts = useCallback(async () => {
    try {
      const list = priceCategory
        ? await loadAll(async (page) => { const r = await salesService.productsWithPrices({ priceCategoryId: priceCategory, page, limit: 100 }); return { rows: (r.products || []).map((p) => ({ id: p.productId || p.id, name: p.productName, barcode: p.barcode, unit: p.unit, status: p.status, price: priceFrom(p), currentStock: (p.batches || []).reduce((s, b) => s + (Number(b.availableStock) || 0), 0) })), pages: r.pagination?.totalPages || 1 }; })
        : await loadAll(async (page) => { const r = await productService.getAll({ page, limit: 100 }); return { rows: r.data.map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, unit: p.unit, status: p.status, price: priceFrom(p), currentStock: Number(p.current_stock) || 0 })), pages: r.pagination.totalPages }; });
      setProducts(list.filter((p) => p.status !== 'inactive'));
    } catch (err) { showError(err.message); }
  }, [priceCategory, currentStore?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    if (!editCode || !editReady || baseline.current) return;
    baseline.current = orderKey();
  }, [editReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore what was in the cart (another device, or a refresh) — or load the pending order being edited.
  useEffect(() => {
    if (restored.current || products.length === 0) return;
    restored.current = true;
    const stockOf = (id) => products.find((p) => p.id === id)?.currentStock || 0;
    const nameOf = (id) => products.find((p) => p.id === id)?.name || '';
    (async () => {
      try {
        if (editCode) {
          const r = await salesService.getOrderForEdit(editCode);
          const first = r.cartDatas?.[0];
          setOrderNumber(r.order_number || null);
          if (first?.customer_id) setCustomerId(first.customer_id);
          if (first?.note && !/^order_modified_on_/i.test(first.note)) setNotes(first.note);
          setHasPayments((r.paymentDatas || []).some((p) => Number(p.amount_paid) > 0 && !/^mod_by_/i.test(p.payment_method || '')));
          sale.loadItems((r.cartDatas || []).map((c) => ({ ...c, productName: c.product_name || nameOf(c.product_id), currentStock: stockOf(c.product_id) })));
          setEditReady(true);
        } else {
          const r = await salesService.getActiveCart();
          if (r.cart_code) setCartCode(r.cart_code);
          if ((r.items || []).length) sale.loadItems(r.items.map((c) => ({ ...c, currentStock: stockOf(c.product_id) })));
        }
      } catch { /* nothing to restore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const cartItems = useCallback(() => rows.filter((i) => i.rawQuantity > 0).map((i) => ({ product_id: i.productId, quantity: i.rawQuantity, price: i.rawPrice, discount: i.rawDiscount || 0, discount_mode: sale.discountType === 'percentage' ? 'percentage' : 'amount', customer_id: customerId || null })), [rows, customerId, sale.discountType]);

  // Keep a copy of the cart on the server (it is what a sale is made from) — a moment after the last change.
  useEffect(() => {
    if (!restored.current || editCode) return undefined;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { salesService.syncActiveCart({ cart_code: cartCode, items: cartItems() }).catch(() => {}); }, 800);
    return () => clearTimeout(syncTimer.current);
  }, [items, customerId, cartCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── adding products ──────────────────────────────────────────────────────────────────────────────
  const addProduct = (p) => {
    const existing = rows.find((r) => r.productId === p.id);
    if (existing) sale.updateItem(existing.id, 'quantity', String((Number(existing.rawQuantity) || 0) + 1));
    else { const empty = items.find((r) => !r.productId) || items[items.length - 1]; sale.setProductForRow(empty.id, p); }
  };
  const addByCode = (code) => {
    const c = String(code).trim(); if (!c) return false;
    if (sale.addProductByBarcode(c, products)) { setBarcode(''); return true; }
    showWarning(t('product_not_found', lang)); return false;
  };

  // ── checks and totals ───────────────────────────────────────────────────────────────────────────
  const hasCustomer = !!customerId || (customerName.trim() && customerPhone.trim());
  const validate = (type) => {
    if (rows.length === 0) { showWarning(t('add_at_least_one_item', lang)); return false; }
    for (const i of rows) {
      if (i.rawQuantity <= 0) { showWarning(`${t('quantity_must_be_positive', lang)}: ${i.productName}`); return false; }
      if (i.rawPrice < 0) { showWarning(`${t('price_cannot_be_negative', lang)}: ${i.productName}`); return false; }
      if (!settings?.allowNegativeStock && i.rawQuantity > i.quantityLeft) { showWarning(`${i.productName}: ${t('quantity_exceeds_stock', lang)} (${t('available', lang)}: ${i.quantityLeft})`); return false; }
    }
    if (settings?.fullCustomerRegistration && !hasCustomer) { showError(t('customer_required', lang)); return false; }
    if (type === 'credit') {
      if (!hasCustomer) { showError(t('customer_required_for_credit', lang)); return false; }
      if (customer && settings?.customerCreditLimit) {
        const avail = Number(customer.credit_limit) - Number(customer.current_balance);
        if (total > avail) { showError(`${t('credit_limit_exceeded', lang)}. ${t('available_credit', lang)}: ${money(avail)}`); return false; }
      }
    }
    if (type === 'cash' && paidNum < total) { showError(t('insufficient_payment', lang)); return false; }
    if (type === 'pending' && !hasCustomer) { showError(t('customer_required_for_pending', lang)); return false; }
    return true;
  };

  const payload = (type) => {
    const due = Math.max(0, total - paidNum);
    return {
      cart_code: cartCode, priceCategory: priceCategory || null, salesDate: toServerDate(saleDate),
      items: rows.filter((i) => i.rawQuantity > 0).map((i) => ({ product_id: i.productId, quantity: i.rawQuantity, selling_price: i.rawPrice, discount: i.rawDiscount || 0 })),
      customerId: customerId || null, customerName: customerName || customer?.name || null, customerPhone: customerPhone || customer?.phone || null,
      subTotal: subtotal, amountTax: totalVat, totalDiscount, discountMode: settings?.defaultDiscountType, amountTotal: total,
      amountPaid: paidNum, amountDue: due, amountChange: Math.max(0, paidNum - total), paymentMethod: method,
      paymentNotes: [notes, reference && method === 'bank_transfer' ? `Ref: ${reference}` : ''].filter(Boolean).join(' · '), saleType: type,
    };
  };

  const reset = () => {
    sale.resetItems(); setPaid(''); setNotes(''); setReference(''); setCustomerId(''); setCustomerName(''); setCustomerPhone('');
    setSaleDate(nowLocal()); setCartCode(newCode()); setOrderNumber(null);
  };

  /** Sends the receipt to the printer through QZ Tray. No browser print window. */
  const printSilently = async (saleData) => {
    try {
      await printReceiptViaQz({ saleData, settings, cashierName: user?.name });
    } catch (err) { showError(err.message || t('print_failed', lang)); }
  };

  const submit = async (type) => {
    if (busy || !validate(type)) return;
    try {
      setBusy(type);
      let code = cartCode;
      if (editCode) { await salesService.reopenOrder(editCode); code = editCode; }
      // the server sells FROM its copy of the cart, so make sure it is exactly what is on screen
      await salesService.syncActiveCart({ cart_code: code, items: cartItems() });
      const body = { ...payload(type), cart_code: code };
      const res = type === 'pending' ? await salesService.saveDraftOrder(body) : await salesService.recordSale(body);
      showSuccess(res.message || 'sale_processed_successfully');
      reset(); loadProducts();
      if (type === 'pending') { if (editCode) navigate('/sales/pending'); return; }
      if (settings?.enableReceiptPrinting) {
        if (settings.receiptPreview === false) await printSilently(res);
        else navigate('/sales/receipt', { state: { saleData: res } });
      } else if (editCode) navigate('/sales/pending');
    } catch (err) { showError(err.message || t('something_went_wrong', lang)); }
    finally { setBusy(null); }
  };

  const saveChanges = async () => {
    if (busy || !validate('pending')) return;
    try {
      setBusy('save');
      const b = payload('pending');
      await salesService.saveOrderChanges({ cart_code: editCode, orderNumber, items: rows.filter((i) => i.rawQuantity > 0).map((i) => ({ product_id: i.productId, quantity: i.rawQuantity, selling_price: i.rawPrice, discount: i.rawDiscount || 0 })), customerId: b.customerId, subTotal: b.subTotal, amountTax: b.amountTax, totalDiscount: b.totalDiscount, discountMode: b.discountMode, amountTotal: b.amountTotal, amountPaid: b.amountPaid, amountDue: b.amountDue, amountChange: b.amountChange, paymentMethod: method, note: notes });
      showSuccess('order_updated'); navigate('/sales/pending');
    } catch (err) { showError(err.message); }
    finally { setBusy(null); }
  };

  const cancelEdit = () => navigate('/sales/pending');

  const cancelThisOrder = async () => {
    if (hasPayments && cancelReason.trim().length < 3) { showError(t('cancel_reason_required', lang)); return; }
    try {
      setBusy('cancel');
      await salesService.cancelOrder(editCode, hasPayments ? cancelReason.trim() : undefined);
      showSuccess('order_cancelled');
      navigate('/sales/pending');
    } catch (err) { showError(err.message); }
    finally { setBusy(null); setConfirmCancel(false); setCancelOpen(false); }
  };
  const clearAll = () => { reset(); salesService.syncActiveCart({ cart_code: cartCode, items: [] }).catch(() => {}); setConfirmClear(false); };

  const cell = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-20 text-right';

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{editCode ? `${t('edit_order', lang)} ${orderNumber ? `#${orderNumber}` : ''}` : t('invoice_sale', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{currentStore?.name}</p>
          </div>
          <div className="flex gap-2">
            {editCode ? <Button variant="secondary" onClick={cancelEdit}>{t('back', lang)}</Button> : rows.length > 0 && <Button variant="secondary" onClick={() => setConfirmClear(true)}>{t('clear', lang)}</Button>}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow space-y-3 text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Select label={t('customer', lang)} searchable value={customerId} onChange={(e) => { setCustomerId(e.target.value); }} placeholder={t('select_customer', lang)} options={[{ value: '', label: t('walk_in', lang) }, ...customers.map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` }))]} />
              {!customerId && (
                <div className="grid grid-cols-2 gap-2">
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('customer_name', lang)} />
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))} placeholder={t('phone', lang)} inputMode="numeric" />
                </div>
              )}
              {customer && settings?.customerCreditLimit && <p className="text-xs text-gray-500">{t('available_credit', lang)}: {money(Number(customer.credit_limit) - Number(customer.current_balance))}</p>}
            </div>
            {priceCategories.length > 0 && (
              <Select label={t('price_category', lang)} value={priceCategory} disabled={rows.length > 0} onChange={(e) => { categoryPicked.current = true; setPriceCategory(e.target.value); }} placeholder={t('select_price_category', lang)} options={priceCategories.map((c) => ({ value: String(c.id), label: c.name }))} />
            )}
            <DatePicker label={t('sales_date', lang)} value={saleDate.slice(0, 10)} onChange={(e) => setSaleDate(e.target.value ? `${e.target.value}T${(saleDate.split('T')[1] || '00:00').slice(0, 5)}` : saleDate)} />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4">
            <div className="bg-white p-4 rounded shadow relative">
              <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <Select
                    searchable
                    value=""
                    placeholder={t('select_product', lang)}
                    options={products.map((p) => ({ value: String(p.id), label: `${p.name} · ${t('price', lang)}: ${money(p.price)} · ${t('qty', lang)}: ${formatNumberWithCommas(p.currentStock)}` }))}
                    onChange={(e) => { const p = products.find((x) => String(x.id) === String(e.target.value)); if (p) addProduct(p); }}
                  />
                </div>
                <div className="hidden md:block w-56 shrink-0">
                  <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={t('barcode', lang)} autoComplete="off"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addByCode(barcode); } }} />
                </div>
                <Button className="md:hidden shrink-0" variant="secondary" mobileIcon={false} onClick={() => setScanning(true)}>{t('scan_barcode', lang)}</Button>
              </div>
            </div>

            <div className="md:hidden space-y-3">
              {rows.length === 0 && <div className="bg-white rounded shadow px-3 py-10 text-center text-sm text-gray-400">{t('add_at_least_one_item', lang)}</div>}
              {rows.map((r) => (
                <div key={r.id} className="bg-white rounded shadow p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-left min-w-0">
                      <div className="font-medium text-gray-900 truncate">{r.productName}</div>
                      <div className="text-xs text-gray-400">{t(r.unit, lang)} · {t('available', lang)}: {formatNumberWithCommas(r.quantityLeft)}</div>
                    </div>
                    <button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => sale.clearProductFromRow(r.id)} aria-label={t('delete', lang)}>✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-left"><span className="block text-xs text-gray-500 mb-1">{t('quantity', lang)}</span><input className={cell} inputMode="decimal" value={r.quantity} onChange={(e) => sale.updateItem(r.id, 'quantity', shapeNumber(e.target.value, QTY_DECIMALS))} onBlur={() => { if (!r.quantity) sale.updateItem(r.id, 'quantity', '1'); }} /></label>
                    <label className="block text-left"><span className="block text-xs text-gray-500 mb-1">{t('price', lang)}</span><input className={cell} inputMode="decimal" value={r.price} onChange={(e) => sale.updateItem(r.id, 'price', shapeNumber(e.target.value, moneyDecimals))} onBlur={() => sale.updateItem(r.id, 'price', formatNumberWithCommas(r.rawPrice || 0, moneyDecimals))} /></label>
                    {discountEnabled && <label className="block text-left"><span className="block text-xs text-gray-500 mb-1">{t('discount', lang)}</span><input className={cell} inputMode="decimal" value={r.discount} onChange={(e) => sale.updateItem(r.id, 'discount', shapeNumber(e.target.value, sale.discountType === 'percentage' ? 2 : moneyDecimals))} onBlur={() => { if (sale.discountType !== 'percentage') sale.updateItem(r.id, 'discount', formatNumberWithCommas(r.rawDiscount || 0, moneyDecimals)); }} /></label>}
                    {vatEnabled && <div className="text-left"><span className="block text-xs text-gray-500 mb-1">{t('tax', lang)}</span><div className="py-1.5 text-sm text-right text-gray-600">{r.vat}</div></div>}
                  </div>
                  <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-2"><span>{t('total', lang)}</span><span>{r.total}</span></div>
                </div>
              ))}
            </div>

            <div className="hidden md:block bg-white rounded shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600"><tr>
                  <th className="px-3 py-2 text-left">{t('product_name', lang)}</th><th className="px-2 py-2 w-28 text-right">{t('quantity', lang)}</th>
                  <th className="px-2 py-2 w-36 text-right">{t('price', lang)}</th>
                  {discountEnabled && <th className="px-2 py-2 w-32 text-right">{t('discount', lang)}</th>}
                  {vatEnabled && <th className="px-2 py-2 w-24 text-right">{t('tax', lang)}</th>}
                  <th className="px-3 py-2 w-32 text-right">{t('total', lang)}</th><th className="w-10" />
                </tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400">{t('add_at_least_one_item', lang)}</td></tr>}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 align-middle">
                      <td className="px-3 py-2 text-left"><div className="font-medium text-gray-900">{r.productName}</div><div className="text-xs text-gray-400">{t(r.unit, lang)} · {t('available', lang)}: {formatNumberWithCommas(r.quantityLeft)}</div></td>
                      <td className="px-2 py-2"><input className={cell} inputMode="decimal" value={r.quantity} onChange={(e) => sale.updateItem(r.id, 'quantity', shapeNumber(e.target.value, QTY_DECIMALS))} onBlur={() => { if (!r.quantity) sale.updateItem(r.id, 'quantity', '1'); }} /></td>
                      <td className="px-2 py-2"><input className={cell} inputMode="decimal" value={r.price} onChange={(e) => sale.updateItem(r.id, 'price', shapeNumber(e.target.value, moneyDecimals))} onBlur={() => sale.updateItem(r.id, 'price', formatNumberWithCommas(r.rawPrice || 0, moneyDecimals))} /></td>
                      {discountEnabled && <td className="px-2 py-2"><input className={cell} inputMode="decimal" value={r.discount} onChange={(e) => sale.updateItem(r.id, 'discount', shapeNumber(e.target.value, sale.discountType === 'percentage' ? 2 : moneyDecimals))} onBlur={() => { if (sale.discountType !== 'percentage') sale.updateItem(r.id, 'discount', formatNumberWithCommas(r.rawDiscount || 0, moneyDecimals)); }} /></td>}
                      {vatEnabled && <td className="px-2 py-2 text-right text-gray-600">{r.vat}</td>}
                      <td className="px-3 py-2 text-right font-medium">{r.total}</td>
                      <td className="px-1 py-2"><button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => sale.clearProductFromRow(r.id)} aria-label={t('delete', lang)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-4 rounded shadow space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">{t('subtotal', lang)}</span><span>{money(subtotal)}</span></div>
              {discountEnabled && <div className="flex justify-between"><span className="text-gray-500">{t('discount', lang)}</span><span>- {money(totalDiscount)}</span></div>}
              {vatEnabled && <div className="flex justify-between"><span className="text-gray-500">{t('tax', lang)} ({vatRate}%)</span><span>{money(totalVat)}</span></div>}
              <div className="flex justify-between text-lg font-bold border-t border-gray-100 pt-2"><span>{t('total', lang)}</span><span>{money(total)}</span></div>
            </div>

            <div className="bg-white p-4 rounded shadow space-y-3 text-left">
              {!editCode && (
                <>
                  <Select label={t('payment_method', lang)} value={method} onChange={(e) => setMethod(e.target.value)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(m, lang) }))} />
                  {method === 'bank_transfer' && <Input label={t('reference_number', lang)} value={reference} onChange={(e) => setReference(e.target.value)} />}
                  <NumberInput label={t('amount_paid', lang)} value={paid} decimals={moneyDecimals} onChange={(e) => setPaid(e.target.value)} />
                  <div className="flex justify-between text-sm"><button type="button" className="text-primary hover:underline" onClick={() => setPaid(total.toFixed(moneyDecimals))}>{t('full_payment', lang)}</button>
                    <span className={fullyPaid ? 'text-green-600' : 'text-red-600'}>{fullyPaid ? `${t('change', lang)}: ${money(paidNum - total)}` : `${t('amount_due', lang)}: ${money(total - paidNum)}`}</span></div>
                </>
              )}
              <Textarea rows={2} label={t('notes', lang)} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex gap-2 pt-1">
                {!editCode && <Button className="flex-1 whitespace-normal text-center leading-tight" size="" mobileIcon={false} loading={busy === 'cash'} disabled={!!busy || !fullyPaid} onClick={() => submit('cash')}>{t('cash_sale', lang)}</Button>}
                {!editCode && settings?.creditSalesSupport && <Button className="flex-1 whitespace-normal text-center leading-tight" size="" mobileIcon={false} variant="secondary" loading={busy === 'credit'} disabled={!!busy || rows.length === 0 || fullyPaid} onClick={() => submit('credit')}>{t('credit_sale', lang)}</Button>}
                {editCode
                  ? <>
                    {/* eslint-disable-next-line react-hooks/refs -- `dirty` compares with the snapshot taken when the order loaded (see above) */}
                    <Button className="flex-1 whitespace-normal text-center leading-tight" size="" mobileIcon={false} loading={busy === 'save'} disabled={!!busy || !dirty} onClick={saveChanges}>{t('save_changes', lang)}</Button>
                    <Button className="flex-1 whitespace-normal text-center leading-tight" size="" mobileIcon={false} variant="danger" loading={busy === 'cancel'} disabled={!!busy} onClick={() => (hasPayments ? setCancelOpen(true) : setConfirmCancel(true))}>{t('cancel_order', lang)}</Button>
                  </>
                  : <Button className="flex-1 whitespace-normal text-center leading-tight" size="" mobileIcon={false} variant="secondary" loading={busy === 'pending'} disabled={!!busy || rows.length === 0} onClick={() => submit('pending')}>{t('save_as_pending', lang)}</Button>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {scanning && <BarcodeScanner onClose={() => setScanning(false)} onScan={(code) => { setScanning(false); addByCode(code); }} />}
      <ConfirmModal isOpen={confirmClear} variant="warning" title={t('clear', lang)} confirmText={t('clear', lang)} cancelText={t('ui_cancel', lang)} message={t('cancel_sale_message', lang)} onClose={() => setConfirmClear(false)} onConfirm={clearAll} />
      <ConfirmModal isOpen={confirmCancel} variant="warning" title={t('cancel_order', lang)} confirmText={t('confirm', lang)} cancelText={t('ui_cancel', lang)} message={t('confirm_cancel_order', lang)} onClose={() => setConfirmCancel(false)} onConfirm={cancelThisOrder} />
      <FormModal isOpen={cancelOpen} title={t('cancel_order', lang)} onClose={() => setCancelOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">{t('cancel_reason_required', lang)}</p>
          <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder={t('cancel_reason_placeholder', lang)} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCancelOpen(false)}>{t('ui_cancel', lang)}</Button><Button variant="danger" loading={busy === 'cancel'} onClick={cancelThisOrder}>{t('cancel_order', lang)}</Button></div>
        </div>
      </FormModal>
    </MainLayout>
  );
}
