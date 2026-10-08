// FILE PATH: frontend/src/utils/receiptData.js
import { t } from './i18n';

/**
 * Builds the object utils/receiptPdf.js draws from — the same shape BizTrack always used.
 * `sale` can be either the reply of "sell" ({ invoice_number, items, customerInfo, paymentInfo, … }) or a row loaded from
 * sales history ({ payment, items }); `settings` is the store's settings (business name, currency, VAT, discount…).
 */
export const buildReceiptData = ({ sale = {}, settings = {}, cashierName }) => {
  const pay = sale.paymentInfo || sale.payment || {};
  const cust = sale.customerInfo || { name: pay.customer_name, phone: pay.customer_phone };
  const rawItems = sale.items || [];
  const items = rawItems.map((i) => ({ id: i.product_id || i.id, name: i.name || i.product_name, quantity: i.quantity, price: i.price, discount: i.discount }));
  return {
    businessInfo: {
      name: settings.businessName || 'BizTrack',
      address: settings.address || '', phone: settings.phone || '', email: settings.email || '', website: settings.website || '',
      tin: settings.tinNumber || '', VRN: settings.vrnNumber || '',
      logo: settings.logo?.preview || '/icon-192.png', footer: settings.receiptFooterText || '',
    },
    orderInfo: { invoice_number: sale.invoice_number || pay.invoice_number, sales_date: pay.sales_date || sale.sales_date, cashierName: cashierName || sale.cashierName || pay.cashier_name, items },
    customerInfo: { name: cust?.name || t('walk_in'), phone: cust?.phone || '', tin: cust?.tin || '', address: cust?.address || '', email: cust?.email || '' },
    paymentInfo: {
      method: pay.payment_method || sale.payment_method,
      status: pay.payment_status || (Number(pay.amount_due) > 0 ? 'partial_paid' : 'paid'),
      subTotal: pay.subtotal || '0', taxAmount: pay.total_vat || '0', amountDue: pay.amount_due || '0', amountPaid: pay.amount_paid || '0',
      amountChange: pay.amount_change || '0', amountTotal: pay.total_amount || sale.total_amount || '0', amountDiscount: pay.total_discount || '0',
      dueDate: pay.due_date,
    },
    items,
    settings: { ...settings },
  };
};

export const RECEIPT_SIZE_OPTIONS = [
  { value: '58mm', label: 'size_58mm' },
  { value: '80mm', label: 'size_80mm' },
  { value: 'A5', label: 'size_a5' },
  { value: 'A4', label: 'size_a4' },
];
