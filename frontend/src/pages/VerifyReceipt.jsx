import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { salesService } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDate } from '../utils/dateFormat';
import { formatCurrency } from '../utils/numberUtils';
import { t } from '../utils/i18n';

/**
 * Opened by the QR code on a receipt. No sign-in, and no way into the rest of BizTrack.
 * The only job of this page is to say whether the receipt is genuine and what it shows now.
 */
function when(value) {
  if (!value) return '';
  const date = formatDate(value);
  const raw = String(value);
  if (!/[T ]\d{2}:\d{2}/.test(raw)) return date;
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
  return date ? `${date} · ${time}` : time;
}

function Fact({ label, value, tone }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-gray-100">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium text-right ${tone || 'text-gray-900'}`}>{value || '—'}</dd>
    </div>
  );
}

export default function VerifyReceipt() {
  const [params] = useSearchParams();
  const { lang } = useLanguage();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gone = false;
    salesService.verifyReceipt({ invoice: params.get('invoice') || '', store: params.get('store') || '' })
      .then((r) => { if (!gone) setRow(r?.data && r.valid == null ? r.data : r); })
      .catch(() => { if (!gone) setRow({ valid: false }); })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [params]);

  const ok = row?.valid === true || row?.verified === true;
  const money = (value) => formatCurrency(value, {
    showCurrency: row?.show_currency !== false,
    defaultCurrency: row?.currency || '',
    defaultCurrencyPosition: row?.currency_position || 'before',
    defaultDecimalPlaces: row?.decimal_places ?? 0,
  });
  const due = Number(row?.amount_due);
  const showStore = row?.store_name && row.store_name !== row.business_name;

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded shadow w-full max-w-md p-6 text-left space-y-4" role="status">
        <h1 className="text-lg font-bold text-gray-900">{t('verify_receipt', lang)}</h1>
        {loading && <p className="text-sm text-gray-500">{t('loading', lang)}</p>}
        {!loading && !ok && (
          <p className="text-sm font-medium text-red-700 rounded bg-red-50 px-3 py-3">{t('receipt_not_verified', lang)}</p>
        )}
        {!loading && ok && (
          <>
            <p className="text-sm font-medium text-green-800 rounded bg-green-50 px-3 py-3">{t('receipt_verified', lang)}</p>
            <dl className="text-sm">
              <Fact label={t('business_name', lang)} value={row.business_name} />
              {showStore && <Fact label={t('store_name', lang)} value={row.store_name} />}
              <Fact label={t('invoice_number', lang)} value={row.invoice_number ? `#${row.invoice_number}` : ''} />
              <Fact label={t('date', lang)} value={when(row.sales_date)} />
              <Fact label={t('served_by', lang)} value={row.served_by} />
              <Fact label={t('customer', lang)} value={row.customer_name || t('walk_in', lang)} />
              <Fact label={t('sale_type', lang)} value={row.sale_type ? t(row.sale_type, lang) : ''} />
              <Fact label={t('payment_method', lang)} value={row.payment_method ? t(row.payment_method, lang) : ''} />
              <Fact label={t('items', lang)} value={row.item_count != null ? String(row.item_count) : ''} />
              <Fact label={t('invoice_amount', lang)} value={money(row.total_amount)} />
              <Fact label={t('total_paid', lang)} value={money(row.amount_paid)} />
              <Fact label={t('balance_due', lang)} value={money(row.amount_due)} tone={due > 0 ? 'text-red-600' : 'text-green-700'} />
            </dl>
            {row.returned && (
              <p className="text-sm text-amber-800 rounded bg-amber-50 px-3 py-3">{t('invoice_returned', lang)}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
