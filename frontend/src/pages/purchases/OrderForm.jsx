// FILE PATH: frontend/src/pages/purchases/OrderForm.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useStore } from '../../contexts/StoreContext';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import { Button, DatePicker, Input, Select, Textarea } from '../../components/ui';
import { useSuppliers, useAllProducts, dateOnly, num } from './common';
import { formatCurrency, formatNumberWithCommas, removeNumberFormatting } from '../../utils/numberUtils';
import { getMoneyDecimals } from '../../utils/money';
import { t } from '../../utils/i18n';

const EMPTY = { supplier_id: '', expected_delivery_date: '', delivery_address: '', payment_terms: '', notes: '', internal_notes: '', items: [] };
const QTY_DECIMALS = 3;
const amount = (v) => removeNumberFormatting(v) || 0;

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

const lineOf = (i) => {
  const gross = amount(i.quantity) * amount(i.unit_price);
  const net = gross - (gross * amount(i.discount_percent)) / 100;
  const tax = (net * amount(i.tax_rate)) / 100;
  return { net, tax, total: net + tax };
};

const cell = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary-20 text-right';

/** A purchase order on the full page, arranged the same way as a sale invoice. */
export default function OrderForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { currentStore } = useStore();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const suppliers = useSuppliers();
  const products = useAllProducts();
  const parsedDecimals = Number(settings?.defaultDecimalPlaces ?? getMoneyDecimals());
  const moneyDecimals = Number.isFinite(parsedDecimals) ? parsedDecimals : 0;
  const money = (v) => formatCurrency(num(v), settings);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const cartCode = useRef(null);
  const syncTimer = useRef(null);
  const setE = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (key, patch) => setForm((f) => ({ ...f, items: f.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const rows = form?.items || [];
  const totals = useMemo(() => rows.reduce((a, i) => { const l = lineOf(i); return { net: a.net + l.net, tax: a.tax + l.tax, discount: a.discount + ((amount(i.quantity) * amount(i.unit_price) * amount(i.discount_percent)) / 100), total: a.total + l.total }; }, { net: 0, tax: 0, discount: 0, total: 0 }), [rows]);
  const payloadItems = (items) => items.filter((i) => i.product_id).map((i) => ({ product_id: i.product_id, quantity: amount(i.quantity), unit_price: amount(i.unit_price), discount_percent: amount(i.discount_percent), tax_rate: amount(i.tax_rate), notes: i.notes || '' }));

  const lineFrom = (i, moneyDec) => ({
    key: i.id || Math.random().toString(36).slice(2),
    product_id: i.product_id,
    product_name: i.product_name || '',
    unit: i.unit || '',
    stock: i.current_stock,
    quantity: formatNumberWithCommas(num(i.quantity), QTY_DECIMALS) || '1',
    unit_price: formatNumberWithCommas(num(i.unit_price), moneyDec),
    discount_percent: String(num(i.discount_percent) || 0),
    tax_rate: String(num(i.tax_rate) || 0),
    notes: i.notes || '',
  });

  useEffect(() => {
    let gone = false;
    (async () => {
      if (editing) {
        try {
          const o = (await purchaseService.orders.get(id)).data;
          if (gone) return;
          setForm({ supplier_id: o.supplier_id || '', expected_delivery_date: dateOnly(o.expected_delivery_date), delivery_address: o.delivery_address || '', payment_terms: o.payment_terms || '', notes: o.notes || '', internal_notes: o.internal_notes || '', po_number: o.po_number,
            items: (o.items || []).map((i) => lineFrom(i, moneyDecimals)) });
        } catch (err) { if (!gone) showError(err.message); }
        return;
      }
      let base = { ...EMPTY };
      try {
        const c = await purchaseService.orders.activeCart();
        if (c.cart_code) cartCode.current = c.cart_code;
        if (c.form_data || (c.items || []).length) {
          base = { ...EMPTY, ...(c.form_data || {}), supplier_id: c.form_data?.supplier_id || '', expected_delivery_date: dateOnly(c.form_data?.expected_delivery_date), items: (c.items || []).map((i) => lineFrom(i, moneyDecimals)) };
        }
      } catch { /* no draft yet */ }
      if (!gone) setForm(base);
    })();
    return () => { gone = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!form || editing) return undefined;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => { purchaseService.orders.syncCart({ cart_code: cartCode.current, supplier_id: form.supplier_id || null, expected_delivery_date: form.expected_delivery_date || null, delivery_address: form.delivery_address, payment_terms: form.payment_terms, notes: form.notes, internal_notes: form.internal_notes, items: payloadItems(form.items) }).then((r) => { if (r.cart_code) cartCode.current = r.cart_code; }).catch(() => {}); }, 900);
    return () => clearTimeout(syncTimer.current);
  }, [form, editing]);

  const addProduct = (p) => {
    if (!p) return;
    setForm((f) => {
      const existing = f.items.find((i) => i.product_id === p.id);
      if (existing) {
        const next = shapeNumber(String((amount(existing.quantity) || 0) + 1), QTY_DECIMALS);
        return { ...f, items: f.items.map((i) => (i.key === existing.key ? { ...i, quantity: next } : i)) };
      }
      return { ...f, items: [...f.items, { key: Math.random().toString(36).slice(2), product_id: p.id, product_name: p.name, unit: p.unit || '', stock: p.current_stock, quantity: '1', unit_price: formatNumberWithCommas(num(p.cost_price), moneyDecimals), discount_percent: '0', tax_rate: '0', notes: '' }] };
    });
  };

  const removeLine = (key) => setE({ items: rows.filter((i) => i.key !== key) });

  const save = async () => {
    const items = payloadItems(rows);
    if (!form.supplier_id) { showError(t('select_supplier', lang)); return; }
    if (items.length === 0) { showError(t('add_at_least_one_item', lang)); return; }
    if (items.some((i) => i.quantity <= 0 || i.unit_price < 0)) { showError(t('quantity_must_be_positive', lang)); return; }
    try {
      setSaving(true);
      const body = { supplier_id: form.supplier_id, expected_delivery_date: form.expected_delivery_date || undefined, delivery_address: form.delivery_address, payment_terms: form.payment_terms, notes: form.notes, internal_notes: form.internal_notes, items };
      const res = editing ? await purchaseService.orders.update(id, body) : await purchaseService.orders.create(body);
      if (!editing) { clearTimeout(syncTimer.current); await purchaseService.orders.syncCart({ cart_code: cartCode.current, items: [] }).catch(() => {}); }
      showSuccess(res.message);
      navigate('/purchases/orders');
    } catch (err) { showError(err.message); } finally { setSaving(false); }
  };

  const clearDraft = () => {
    setForm({ ...EMPTY });
    clearTimeout(syncTimer.current);
    purchaseService.orders.syncCart({ cart_code: cartCode.current, items: [] }).catch(() => {});
  };

  const productLabel = (p) => `${p.name} · ${t('price', lang)}: ${money(p.cost_price)} · ${t('qty', lang)}: ${formatNumberWithCommas(p.current_stock)}`;

  const fields = (i) => (
    <>
      <label className="block text-left"><span className="block text-xs text-gray-500 mb-1">{t('quantity', lang)}</span>
        <input className={cell} inputMode="decimal" value={i.quantity} onChange={(e) => setItem(i.key, { quantity: shapeNumber(e.target.value, QTY_DECIMALS) })} onBlur={() => { if (!i.quantity) setItem(i.key, { quantity: '1' }); }} /></label>
      <label className="block text-left"><span className="block text-xs text-gray-500 mb-1">{t('unit_price', lang)}</span>
        <input className={cell} inputMode="decimal" value={i.unit_price} onChange={(e) => setItem(i.key, { unit_price: shapeNumber(e.target.value, moneyDecimals) })} onBlur={() => setItem(i.key, { unit_price: formatNumberWithCommas(amount(i.unit_price), moneyDecimals) })} /></label>
      <label className="block text-left"><span className="block text-xs text-gray-500 mb-1">{t('discount', lang)} %</span>
        <input className={cell} inputMode="decimal" value={i.discount_percent} onChange={(e) => setItem(i.key, { discount_percent: shapeNumber(e.target.value, 2) })} /></label>
      <label className="block text-left"><span className="block text-xs text-gray-500 mb-1">{t('tax', lang)} %</span>
        <input className={cell} inputMode="decimal" value={i.tax_rate} onChange={(e) => setItem(i.key, { tax_rate: shapeNumber(e.target.value, 2) })} /></label>
    </>
  );

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{editing ? `${t('update_purchase_order', lang)} ${form?.po_number ? `#${form.po_number}` : ''}` : t('new_purchase_order', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{currentStore?.name}</p>
          </div>
          <div className="flex gap-2">
            {!editing && rows.length > 0 && <Button variant="secondary" onClick={clearDraft}>{t('clear', lang)}</Button>}
            <Button variant="secondary" onClick={() => navigate('/purchases/orders')}>{t('back', lang)}</Button>
          </div>
        </div>

        {!form && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {form && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <div className="bg-white p-4 rounded shadow text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                <Select label={t('supplier', lang)} required searchable value={form.supplier_id} onChange={(e) => setE({ supplier_id: e.target.value, payment_terms: form.payment_terms || suppliers.find((s) => s.id === e.target.value)?.payment_terms || '' })} placeholder={t('select_supplier', lang)} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                <DatePicker label={t('expected_delivery', lang)} value={form.expected_delivery_date} onChange={(e) => setE({ expected_delivery_date: e.target.value })} />
                <Input label={t('payment_terms', lang)} value={form.payment_terms} onChange={(e) => setE({ payment_terms: e.target.value })} />
                <div className="md:col-span-2 xl:col-span-3"><Input label={t('delivery_address', lang)} value={form.delivery_address} onChange={(e) => setE({ delivery_address: e.target.value })} /></div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 space-y-4">
                <div className="bg-white p-4 rounded shadow">
                  <Select searchable value="" placeholder={t('select_product', lang)} options={products.map((p) => ({ value: String(p.id), label: productLabel(p) }))} onChange={(e) => addProduct(products.find((x) => String(x.id) === String(e.target.value)))} />
                </div>

                <div className="md:hidden space-y-3">
                  {rows.length === 0 && <div className="bg-white rounded shadow px-3 py-10 text-center text-sm text-gray-400">{t('add_at_least_one_item', lang)}</div>}
                  {rows.map((i) => (
                    <div key={i.key} className="bg-white rounded shadow p-3 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-left min-w-0">
                          <div className="font-medium text-gray-900 truncate">{i.product_name}</div>
                          <div className="text-xs text-gray-400">{[i.unit && t(i.unit, lang), i.stock != null && `${t('available', lang)}: ${formatNumberWithCommas(i.stock)}`].filter(Boolean).join(' · ')}</div>
                        </div>
                        <button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => removeLine(i.key)} aria-label={t('delete', lang)}>✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">{fields(i)}</div>
                      <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-2"><span>{t('total', lang)}</span><span>{money(lineOf(i).total)}</span></div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block bg-white rounded shadow overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600"><tr>
                      <th className="px-3 py-2 text-left">{t('product_name', lang)}</th>
                      <th className="px-2 py-2 w-28 text-right">{t('quantity', lang)}</th>
                      <th className="px-2 py-2 w-36 text-right">{t('unit_price', lang)}</th>
                      <th className="px-2 py-2 w-28 text-right">{t('discount', lang)} %</th>
                      <th className="px-2 py-2 w-24 text-right">{t('tax', lang)} %</th>
                      <th className="px-3 py-2 w-32 text-right">{t('total', lang)}</th>
                      <th className="w-10" />
                    </tr></thead>
                    <tbody>
                      {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400">{t('add_at_least_one_item', lang)}</td></tr>}
                      {rows.map((i) => (
                        <tr key={i.key} className="border-t border-gray-100 align-middle">
                          <td className="px-3 py-2 text-left">
                            <div className="font-medium text-gray-900">{i.product_name}</div>
                            <div className="text-xs text-gray-400">{[i.unit && t(i.unit, lang), i.stock != null && `${t('available', lang)}: ${formatNumberWithCommas(i.stock)}`].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td className="px-2 py-2"><input className={cell} inputMode="decimal" value={i.quantity} onChange={(e) => setItem(i.key, { quantity: shapeNumber(e.target.value, QTY_DECIMALS) })} onBlur={() => { if (!i.quantity) setItem(i.key, { quantity: '1' }); }} /></td>
                          <td className="px-2 py-2"><input className={cell} inputMode="decimal" value={i.unit_price} onChange={(e) => setItem(i.key, { unit_price: shapeNumber(e.target.value, moneyDecimals) })} onBlur={() => setItem(i.key, { unit_price: formatNumberWithCommas(amount(i.unit_price), moneyDecimals) })} /></td>
                          <td className="px-2 py-2"><input className={cell} inputMode="decimal" value={i.discount_percent} onChange={(e) => setItem(i.key, { discount_percent: shapeNumber(e.target.value, 2) })} /></td>
                          <td className="px-2 py-2"><input className={cell} inputMode="decimal" value={i.tax_rate} onChange={(e) => setItem(i.key, { tax_rate: shapeNumber(e.target.value, 2) })} /></td>
                          <td className="px-3 py-2 text-right font-medium">{money(lineOf(i).total)}</td>
                          <td className="px-1 py-2"><button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => removeLine(i.key)} aria-label={t('delete', lang)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white p-4 rounded shadow space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">{t('subtotal', lang)}</span><span>{money(totals.net + totals.discount)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('discount', lang)}</span><span>- {money(totals.discount)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('tax', lang)}</span><span>{money(totals.tax)}</span></div>
                  <div className="flex justify-between text-lg font-bold border-t border-gray-100 pt-2"><span>{t('total', lang)}</span><span>{money(totals.total)}</span></div>
                </div>
                <div className="bg-white p-4 rounded shadow space-y-3 text-left">
                  <Textarea rows={2} label={t('notes', lang)} value={form.notes} onChange={(e) => setE({ notes: e.target.value })} />
                  <Textarea rows={2} label={t('internal_notes', lang)} value={form.internal_notes} onChange={(e) => setE({ internal_notes: e.target.value })} />
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" className="flex-1 whitespace-normal text-center leading-tight" size="" mobileIcon={false} loading={saving}>{editing ? t('ui_update', lang) : t('save', lang)}</Button>
                    <Button type="button" className="flex-1 whitespace-normal text-center leading-tight" size="" mobileIcon={false} variant="secondary" onClick={() => navigate('/purchases/orders')}>{t('ui_cancel', lang)}</Button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </MainLayout>
  );
}
