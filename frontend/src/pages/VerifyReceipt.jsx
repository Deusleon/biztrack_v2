import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { receiptVerifyService } from '../services/api';
import { formatCurrency } from '../utils/numberUtils';
import { formatDateOnly } from '../utils/formatDateLocalized';
import { t } from '../utils/i18n';

const lang = () => {
  try {
    const chosen = localStorage.getItem('lang');
    if (chosen === 'en' || chosen === 'sw') return chosen;
  } catch { /* ignore */ }
  return 'en';
};

/** Public page opened when a receipt QR code is scanned. */
export default function VerifyReceipt() {
  const [params] = useSearchParams();
  const invoice = params.get('invoice') || '';
  const store = params.get('store') || '';
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const L = lang();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!invoice || !store) {
        setState({ loading: false, error: 'invoice_and_store_required', data: null });
        return;
      }
      try {
        const res = await receiptVerifyService.verify(invoice, store);
        if (cancelled) return;
        setState({ loading: false, error: null, data: res.data || res });
      } catch (err) {
        if (cancelled) return;
        setState({ loading: false, error: err.message || 'receipt_not_found', data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [invoice, store]);

  const d = state.data;
  const settings = d ? {
    defaultCurrency: d.currency,
    defaultDecimalPlaces: d.decimal_places,
    showCurrency: d.show_currency,
    defaultCurrencyPosition: d.currency_position,
    defaultDateFormat: d.date_format,
  } : {};

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6 space-y-4 text-left">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">{t('receipt_verification', L)}</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{d?.business_name || t('biztrack', L) || 'BizTrack'}</h1>
        </div>

        {state.loading && <p className="text-sm text-gray-500">{t('loading', L) || 'Loading…'}</p>}

        {!state.loading && state.error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {t('receipt_not_verified', L)} — {t(state.error, L) || state.error}
          </div>
        )}

        {!state.loading && d && (
          <>
            <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 font-medium">
              {t('receipt_verified', L)}
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('invoice_number', L)}</dt><dd className="font-medium">#{d.invoice_number}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('date', L)}</dt><dd className="font-medium">{formatDateOnly(d.sales_date, settings)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('store', L)}</dt><dd className="font-medium">{d.store_name}</dd></div>
              {d.customer_name && <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('customer', L)}</dt><dd className="font-medium">{d.customer_name}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('total', L)}</dt><dd className="font-medium">{formatCurrency(Number(d.total_amount) || 0, settings)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('amount_paid', L)}</dt><dd className="font-medium">{formatCurrency(Number(d.amount_paid) || 0, settings)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">{t('payment_method', L)}</dt><dd className="font-medium capitalize">{t(d.payment_method, L) || d.payment_method}</dd></div>
            </dl>
          </>
        )}

        <div className="pt-2 border-t border-gray-100">
          <Link to="/login" className="text-sm text-primary hover:underline">{t('login', L) || 'Log in'}</Link>
        </div>
      </div>
    </div>
  );
}
