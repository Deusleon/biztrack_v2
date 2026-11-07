// FILE PATH: frontend/src/pages/inventory/ProductDetails.jsx
import FormModal from '../../components/ui/FormModal';
import { Button } from '../../components/ui';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatCurrency, formatNumberWithCommas } from '../../utils/numberUtils';
import { t } from '../../utils/i18n';

const Row = ({ label, children }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-gray-100 last:border-0">
    <span className="text-gray-500">{label}</span><span className="text-gray-900 text-right break-words">{children}</span>
  </div>
);
const Stat = ({ label, value, danger }) => (
  <div className="bg-gray-50 rounded p-3 text-left"><p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p><p className={`text-base font-semibold mt-0.5 ${danger ? 'text-red-600' : 'text-gray-900'}`}>{value}</p></div>
);

/** Everything about one product: picture, stock health, pricing and profit, the active batch. */
export default function ProductDetails({ product, isOpen, onClose, settings = {}, onEdit, onDelete, onPrintBarcode }) {
  const { lang } = useLanguage();
  if (!product) return null;
  const money = (v) => formatCurrency(Number(v) || 0, settings);
  const stock = Number(product.current_stock) || 0;
  const minimum = Number(product.minimum_stock) || 0;
  const cost = Number(product.cost_price) || 0;
  const price = Number(product.selling_price) || 0;
  const profit = price - cost;
  const batch = product.batches?.find((b) => b.status === 'active');
  const level = stock <= 0 ? 'out' : stock <= minimum ? 'low' : 'ok';

  return (
    <FormModal isOpen={isOpen} onClose={onClose} size="lg" title={t('product_details', lang)}>
      <div className="space-y-4 text-left">
        <div className="flex gap-4">
          <div className="w-24 h-24 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-gray-400">{t('no_image', lang)}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-lg font-semibold text-gray-900 break-words">{product.name}</h4>
            <p className="text-sm text-gray-500">{product.category_name || t('not_specified', lang)}</p>
            <p className="text-sm mt-1">{t('current_stock', lang)}: <b>{formatNumberWithCommas(stock)} {t(product.unit, lang)}</b>
              {level !== 'ok' && <span className="ml-2 text-xs font-medium text-red-600">{level === 'out' ? t('out_of_stock_item', lang) : t('low_stock_item', lang)}</span>}</p>
            <p className="text-sm">{t('selling_price', lang)}: <b>{money(price)}</b> <span className="text-gray-500">{t('per', lang)} {t(product.unit, lang)}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label={t('cost_price', lang)} value={money(cost)} />
          <Stat label={t('selling_price', lang)} value={money(price)} />
          <Stat label={profit < 0 ? t('loss_per_unit', lang) : t('profit_per_unit', lang)} value={money(Math.abs(profit))} danger={profit < 0} />
          <Stat label={t('stock_value', lang)} value={money(stock * cost)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <div>
            <h5 className="text-sm font-semibold text-gray-700 mb-1">{t('product_info', lang)}</h5>
            <Row label={t('barcode', lang)}>{product.barcode || t('n_a', lang)}</Row>
            <Row label={t('unit', lang)}>{t(product.unit, lang) || t('n_a', lang)}</Row>
            <Row label={t('category', lang)}>{product.category_name || t('n_a', lang)}</Row>
            <Row label={t('alert_qty', lang)}>{formatNumberWithCommas(minimum)}</Row>
            <Row label={t('status', lang)}>{t(product.status, lang)}</Row>
          </div>
          <div>
            <h5 className="text-sm font-semibold text-gray-700 mb-1">{t('pricing_&_stock_value', lang)}</h5>
            <Row label={t('potential_revenue', lang)}>{money(stock * price)}</Row>
            <Row label={stock * profit < 0 ? t('potential_loss', lang) : t('potential_profit', lang)}>{money(Math.abs(stock * profit))}</Row>
          </div>
        </div>

        {batch && (
          <div>
            <h5 className="text-sm font-semibold text-gray-700 mb-1">{t('active_batch', lang)}</h5>
            <Row label={t('batch_number', lang)}>{batch.batch_number || t('n_a', lang)}</Row>
            <Row label={t('mfg_date', lang)}>{batch.manufacturing_date || t('n_a', lang)}</Row>
            {settings.allowExpireDate && <Row label={t('exp_date', lang)}>{batch.expiry_date || t('n_a', lang)}</Row>}
          </div>
        )}

        {product.description && <div><h5 className="text-sm font-semibold text-gray-700 mb-1">{t('description', lang)}</h5><p className="text-sm text-gray-700 whitespace-pre-line">{product.description}</p></div>}

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-gray-100">
          {onPrintBarcode && <Button variant="secondary" onClick={() => onPrintBarcode(product)}>{t('print_barcode', lang)}</Button>}
          {onEdit && <Button variant="secondary" onClick={() => onEdit(product)}>{t('edit', lang)}</Button>}
          {onDelete && <Button variant="danger" onClick={() => onDelete(product)}>{t('delete', lang)}</Button>}
          <Button variant="secondary" onClick={onClose}>{t('close', lang)}</Button>
        </div>
      </div>
    </FormModal>
  );
}
