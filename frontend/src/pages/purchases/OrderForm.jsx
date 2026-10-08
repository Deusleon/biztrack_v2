// FILE PATH: frontend/src/pages/purchases/OrderForm.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from '../../components/MainLayout';
import { useToast } from '../../contexts/ToastContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStoreSettings } from '../../hooks/useStoreSettings';
import { purchaseService } from '../../services/api';
import { Button, DatePicker, Input, Select, Textarea } from '../../components/ui';
import { useSuppliers, useAllProducts, dateOnly, num } from './common';
import { formatCurrency } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const EMPTY = { supplier_id: '', expected_delivery_date: '', delivery_address: '', payment_terms: '', notes: '', internal_notes: '', items: [] };
const blankItem = () => ({ key: Math.random().toString(36).slice(2), product_id: '', quantity: '1', unit_price: '', discount_percent: '0', tax_rate: '0', notes: '' });
const lineOf = (i) => { const gross = num(i.quantity) * num(i.unit_price); const net = gross - (gross * num(i.discount_percent)) / 100; return { net, tax: (net * num(i.tax_rate)) / 100, total: net + (net * num(i.tax_rate)) / 100 }; };
const cell = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-primary-20';

/** A purchase order, on the full page, laid out the same way as a sale invoice. */
export default function OrderForm() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { lang } = useLanguage();
  const { settings } = useStoreSettings();
  const suppliers = useSuppliers();
  const products = useAllProducts();
  const money = (v) => formatCurrency(num(v), settings);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const cartCode = useRef(null);
  const syncTimer = useRef(null);
  const setE = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setItem = (key, patch) => setForm((f) => ({ ...f, items: f.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const totals = useMemo(() => (form?.items || []).reduce((a, i) => { const l = lineOf(i); return { net: a.net + l.net, tax: a.tax + l.tax, total: a.total + l.total }; }, { net: 0, tax: 0, total: 0 }), [form?.items]);
  const payloadItems = (items) => items.filter((i) => i.product_id).map((i) => ({ product_id: i.product_id, quantity: num(i.quantity), unit_price: num(i.unit_price), discount_percent: num(i.discount_percent), tax_rate: num(i.tax_rate), notes: i.notes || '' }));

  useEffect(() => {
    let gone = false;
    (async () => {
      if (editing) {
        try {
          const o = (await purchaseService.orders.get(id)).data;
          if (gone) return;
          setForm({ supplier_id: o.supplier_id || '', expected_delivery_date: dateOnly(o.expected_delivery_date), delivery_address: o.delivery_address || '', payment_terms: o.payment_terms || '', notes: o.notes || '', internal_notes: o.internal_notes || '', po_number: o.po_number,
            items: (o.items || []).map((i) => ({ key: i.id, product_id: i.product_id, quantity: String(num(i.quantity)), unit_price: String(num(i.unit_price)), discount_percent: String(num(i.discount_percent)), tax_rate: String(num(i.tax_rate)), notes: i.notes || '' })) });
        } catch (err) { if (!gone) showError(err.message); }
        return;
      }
      let base = { ...EMPTY, items: [blankItem()] };
      try {
        const c = await purchaseService.orders.activeCart();
        if (c.cart_code) cartCode.current = c.cart_code;
        if (c.form_data || (c.items || []).length) base = { ...EMPTY, ...(c.form_data || {}), supplier_id: c.form_data?.supplier_id || '', expected_delivery_date: dateOnly(c.form_data?.expected_delivery_date), items: (c.items || []).length ? c.items.map((i) => ({ key: Math.random().toString(36).slice(2), product_id: i.product_id, quantity: String(num(i.quantity)), unit_price: String(num(i.unit_price)), discount_percent: String(num(i.discount_percent)), tax_rate: String(num(i.tax_rate)), notes: i.notes || '' })) : [blankItem()] };
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

  const save = async () => {
    const items = payloadItems(form.items);
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

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="page-header flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h1 className="text-xl font-bold text-gray-900">{editing ? `${t('update_purchase_order', lang)} ${form?.po_number ? `#${form.po_number}` : ''}` : t('new_purchase_order', lang)}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('manage_purchase_orders', lang)}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/purchases/orders')}>{t('back', lang)}</Button>
        </div>
        {!form && <div className="bg-white rounded shadow p-8 text-center text-gray-500">{t('loading_data', lang)}</div>}
        {form && (
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-4" noValidate>
            <div className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              <Select label={t('supplier', lang)} required searchable value={form.supplier_id} onChange={(e) => setE({ supplier_id: e.target.value, payment_terms: form.payment_terms || suppliers.find((s) => s.id === e.target.value)?.payment_terms || '' })} placeholder={t('select_supplier', lang)} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              <DatePicker label={t('expected_delivery', lang)} value={form.expected_delivery_date} onChange={(e) => setE({ expected_delivery_date: e.target.value })} />
              <Input label={t('payment_terms', lang)} value={form.payment_terms} onChange={(e) => setE({ payment_terms: e.target.value })} />
              <div className="md:col-span-3"><Input label={t('delivery_address', lang)} value={form.delivery_address} onChange={(e) => setE({ delivery_address: e.target.value })} /></div>
            </div>
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600"><tr>
                  <th className="px-3 py-2 text-left min-w-[16rem]">{t('product_name', lang)}</th>
                  <th className="px-2 py-2 w-28 text-right">{t('quantity', lang)}</th>
                  <th className="px-2 py-2 w-36 text-right">{t('unit_price', lang)}</th>
                  <th className="px-2 py-2 w-28 text-right">{t('discount', lang)} %</th>
                  <th className="px-2 py-2 w-24 text-right">{t('tax', lang)} %</th>
                  <th className="px-3 py-2 w-32 text-right">{t('total', lang)}</th>
                  <th className="w-10" />
                </tr></thead>
                <tbody>{form.items.map((i) => (
                  <tr key={i.key} className="border-t border-gray-100">
                    <td className="px-3 py-2"><Select searchable value={i.product_id} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setItem(i.key, { product_id: e.target.value, unit_price: i.unit_price || String(num(p?.cost_price)) }); }} placeholder={t('select_product', lang)} options={products.map((p) => ({ value: p.id, label: p.name }))} /></td>
                    {['quantity', 'unit_price', 'discount_percent', 'tax_rate'].map((f) => <td key={f} className="px-2 py-2"><input className={cell} inputMode="decimal" value={i[f]} onChange={(e) => setItem(i.key, { [f]: e.target.value })} /></td>)}
                    <td className="px-3 py-2 text-right font-medium">{money(lineOf(i).total)}</td>
                    <td className="px-1"><button type="button" className="p-1 text-gray-400 hover:text-red-600" onClick={() => setE({ items: form.items.length > 1 ? form.items.filter((x) => x.key !== i.key) : [blankItem()] })} aria-label={t('delete', lang)}>✕</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="xl:col-span-2 bg-white p-4 rounded shadow text-left"><Button type="button" variant="secondary" onClick={() => setE({ items: [...form.items, blankItem()] })}>{t('add_item', lang)}</Button></div>
              <div className="bg-white p-4 rounded shadow space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">{t('subtotal', lang)}</span><span>{money(totals.net)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{t('tax', lang)}</span><span>{money(totals.tax)}</span></div>
                <div className="flex justify-between text-lg font-bold border-t border-gray-100 pt-2"><span>{t('total', lang)}</span><span>{money(totals.total)}</span></div>
              </div>
            </div>
            <div className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
              <Textarea rows={2} label={t('notes', lang)} value={form.notes} onChange={(e) => setE({ notes: e.target.value })} />
              <Textarea rows={2} label={t('internal_notes', lang)} value={form.internal_notes} onChange={(e) => setE({ internal_notes: e.target.value })} />
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate('/purchases/orders')}>{t('ui_cancel', lang)}</Button>
                <Button type="submit" loading={saving}>{editing ? t('ui_update', lang) : t('save', lang)}</Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </MainLayout>
  );
}
