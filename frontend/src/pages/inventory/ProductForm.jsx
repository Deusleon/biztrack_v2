// FILE PATH: frontend/src/pages/inventory/ProductForm.jsx
import { useState, useEffect } from 'react';
import Barcode from 'react-barcode';
import FormModal from '../../components/ui/FormModal';
import ImageInput from '../../components/ImageInput';
import BarcodeScanner from '../../components/BarcodeScanner';
import { Input, NumberInput, Select, Textarea, DatePicker, Button } from '../../components/ui';
import { useLanguage } from '../../contexts/LanguageContext';
import { t } from '../../utils/i18n';

export const UNITS = ['unit_pc', 'unit_packet', 'unit_box', 'unit_crt', 'unit_ctn', 'unit_kg', 'unit_g', 'unit_L', 'unit_ml', 'unit_m', 'unit_ft', 'unit_dz', 'unit_pair', 'unit_bottle', 'unit_tray', 'unit_bag'];

const EMPTY = { product_name: '', unit: '', product_category: '', barcode: '', cost_price: '', selling_price: '', current_stock: '0', alert_qty: '0', status: 'active', mfg_date: '', exp_date: '', product_description: '', image: null };

/**
 * Add / edit a product. On ADD it also takes the opening cost, price, stock and dates (a first batch is created from them);
 * on EDIT those are changed through stock adjustments and price updates, so only the product's own details show.
 * What the store allows (expiry dates, negative stock, decimals) comes from its settings.
 */
export default function ProductForm({ isOpen, onClose, product, categories, settings = {}, saving, onSubmit }) {
  const { lang } = useLanguage();
  const editing = !!product;
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setForm(product ? {
      ...EMPTY, product_name: product.name || '', unit: product.unit || '', product_category: product.category_id || '', barcode: product.barcode || '',
      selling_price: String(Number(product.selling_price) || 0), alert_qty: String(Number(product.minimum_stock) || 0), status: product.status || 'active',
      product_description: product.description || '', image: product.image_url || null,
    } : EMPTY);
  }, [isOpen, product]);

  const set = (f) => (e) => { setForm((x) => ({ ...x, [f]: e?.target ? e.target.value : e })); setErrors((x) => ({ ...x, [f]: undefined })); };
  const currency = settings.showCurrency && settings.defaultCurrency ? ` (${settings.defaultCurrency})` : '';

  const validate = () => {
    const e = {};
    if (!form.product_name.trim()) e.product_name = t('enter_product_name', lang);
    if (!form.unit) e.unit = t('select_unit', lang);
    if (!form.product_category) e.product_category = t('select_product_category', lang);
    if (!editing) {
      if (form.cost_price === '' || Number(form.cost_price) < 0) e.cost_price = t('enter_cost_price', lang);
      if (form.selling_price === '' || Number(form.selling_price) < 0) e.selling_price = t('enter_selling_price', lang);
      if (!settings.allowNegativeStock && Number(form.current_stock) < 0) e.current_stock = t('invalid_stock', lang);
    }
    if (form.alert_qty !== '' && Number(form.alert_qty) < 0) e.alert_qty = t('invalid_number', lang);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev) => { ev.preventDefault(); if (validate()) onSubmit({ ...form, barcode: form.barcode.trim() }); };

  return (
    <>
      <FormModal isOpen={isOpen} onClose={onClose} size="xl" title={t('product_form', lang)}>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label={t('product_name', lang)} required autoFocus value={form.product_name} onChange={set('product_name')} error={errors.product_name} disabled={saving} />
            <Select label={t('unit', lang)} required value={form.unit} onChange={set('unit')} error={errors.unit} disabled={saving} placeholder={t('select_unit', lang)} options={UNITS.map((u) => ({ value: u, label: t(u, lang) }))} />
            <Select label={t('category', lang)} required searchable value={form.product_category} onChange={set('product_category')} error={errors.product_category} disabled={saving} placeholder={t('select_product_category', lang)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />

            <div>
              <Input label={t('barcode', lang)} value={form.barcode} onChange={set('barcode')} disabled={saving} placeholder={t('barcode_here', lang)} />
              <div className="flex items-center gap-2 mt-1">
                <Button type="button" variant="secondary" size="xs" disabled={saving} onClick={() => setScanning(true)}>{t('scan_barcode', lang)}</Button>
                {form.barcode && <Button type="button" variant="ghost" size="xs" disabled={saving} onClick={() => setForm((x) => ({ ...x, barcode: '' }))}>{t('remove', lang)}</Button>}
              </div>
              {form.barcode && <div className="mt-2 overflow-x-auto"><Barcode value={form.barcode} height={40} fontSize={12} margin={0} /></div>}
            </div>

            {!editing && <NumberInput label={`${t('cost_price', lang)}${currency}`} required value={form.cost_price} onChange={set('cost_price')} error={errors.cost_price} disabled={saving} placeholder={t('enter_cost_price', lang)} />}
            {!editing && <NumberInput label={`${t('selling_price', lang)}${currency}`} required value={form.selling_price} onChange={set('selling_price')} error={errors.selling_price} disabled={saving} placeholder={t('enter_selling_price', lang)} helperText={t('uses_default_price_category', lang)} />}
            {!editing && <NumberInput label={t('current_stock', lang)} allowDecimals value={form.current_stock} onChange={set('current_stock')} error={errors.current_stock} disabled={saving} />}
            <NumberInput label={t('alert_qty', lang)} value={form.alert_qty} onChange={set('alert_qty')} error={errors.alert_qty} disabled={saving} />
            {editing && <Select label={t('status', lang)} value={form.status} onChange={set('status')} disabled={saving} options={[{ value: 'active', label: t('active', lang) }, { value: 'inactive', label: t('inactive', lang) }]} />}
            {!editing && <DatePicker label={t('mfg_date', lang)} value={form.mfg_date} onChange={set('mfg_date')} disabled={saving} />}
            {!editing && settings.allowExpireDate && <DatePicker label={t('exp_date', lang)} value={form.exp_date} onChange={set('exp_date')} disabled={saving} />}
          </div>

          <Textarea label={t('product_description', lang)} value={form.product_description} onChange={set('product_description')} disabled={saving} />
          <ImageInput label={t('image', lang)} value={form.image} onChange={(img) => setForm((x) => ({ ...x, image: img }))} disabled={saving} />

          <div className="flex justify-end gap-3 pt-1">
            <Button type="submit" loading={saving}>{editing ? t('ui_update', lang) : t('save', lang)}</Button>
            <Button type="button" variant="secondary" onClick={onClose}>{t('ui_cancel', lang)}</Button>
          </div>
        </form>
      </FormModal>
      {scanning && <BarcodeScanner onClose={() => setScanning(false)} onScan={(code) => { setForm((x) => ({ ...x, barcode: code })); setScanning(false); }} />}
    </>
  );
}
