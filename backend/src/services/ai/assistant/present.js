import { businessToday } from './periods.js';

const LINKS = {
  getSalesSummary: { en: 'Sales', sw: 'Mauzo', to: '/reports/sales' },
  getSalesForPeriod: { en: 'Sales', sw: 'Mauzo', to: '/reports/sales' },
  getSalesComparison: { en: 'Sales comparison', sw: 'Ulinganisho wa mauzo', to: '/reports/sales' },
  getSalesTrend: { en: 'Sales', sw: 'Mauzo', to: '/reports/sales' },
  getSalesByCategory: { en: 'Sales by category', sw: 'Mauzo kwa kundi', to: '/reports/sales' },
  getSalesByPaymentMethod: { en: 'Sales by payment', sw: 'Mauzo kwa malipo', to: '/reports/sales' },
  getTopProducts: { en: 'Products', sw: 'Bidhaa', to: '/reports/sales' },
  getFastMovingProducts: { en: 'Fast-moving products', sw: 'Bidhaa zinazouzwa haraka', to: '/reports/sales' },
  getSlowMovingProducts: { en: 'Slow-moving products', sw: 'Bidhaa zinazouzwa polepole', to: '/reports/sales' },
  getProfitAnalysis: { en: 'Profit', sw: 'Faida', to: '/reports/profit' },
  getProfitForPeriod: { en: 'Profit', sw: 'Faida', to: '/reports/profit' },
  getExpenseAnalysis: { en: 'Expenses', sw: 'Matumizi', to: '/reports/expenses' },
  getCustomerDebts: { en: 'Customer debts', sw: 'Madeni ya wateja', to: '/sales/debits' },
  getInventoryStatus: { en: 'Stock', sw: 'Hisa', to: '/inventory/current-stock' },
  getInventoryLevels: { en: 'Stock', sw: 'Hisa', to: '/inventory/current-stock' },
  getInventoryValuation: { en: 'Stock value', sw: 'Thamani ya hisa', to: '/inventory/stock-value' },
  getLowStockProducts: { en: 'Low stock', sw: 'Hisa ndogo', to: '/inventory/current-stock' },
  getReorderProducts: { en: 'Reorder', sw: 'Za kuagiza', to: '/inventory/current-stock' },
  getDeadStock: { en: 'Unsold stock', sw: 'Hisa isiyouzwa', to: '/inventory/current-stock' },
  getExpiryProducts: { en: 'Expiry', sw: 'Muda wa kuisha', to: '/inventory/current-stock' },
  getPurchaseSummary: { en: 'Purchases', sw: 'Manunuzi', to: '/purchases/orders' },
  getSupplierDebts: { en: 'Supplier invoices', sw: 'Ankara za wasambazaji', to: '/purchases/invoices' },
  getSalesReturnsSummary: { en: 'Sales returns', sw: 'Marejesho ya mauzo', to: '/sales/returns' },
  getCashierSales: { en: 'Sales by cashier', sw: 'Mauzo kwa mhudumu', to: '/reports/sales' },
  getStoreComparison: { en: 'Your stores', sw: 'Maduka yako', to: '/dashboard' },
};

const SALES_TOOLS = new Set([
  'getSalesSummary', 'getTopProducts', 'getSalesComparison', 'getSalesTrend', 'getSalesByCategory',
  'getSalesByPaymentMethod', 'getFastMovingProducts', 'getSlowMovingProducts', 'getSalesForPeriod',
]);
const PROFIT_TOOLS = new Set(['getProfitAnalysis', 'getProfitForPeriod']);

function money(amount, format = {}) {
  const decimals = Number.isInteger(format.decimals) ? format.decimals : 0;
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const text = safe.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${format.currency || 'TZS'} ${text}`;
}

function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function labelOf(value) {
  if (value && typeof value === 'object') return value.en || value.sw || value.name || '';
  return String(value || '').trim();
}

function sourcesFor(toolIds, lang = 'en') {
  const seen = new Set();
  const sources = [];
  for (const id of toolIds || []) {
    const link = LINKS[id];
    if (!link || seen.has(link.to + link.en)) continue;
    seen.add(link.to + link.en);
    const label = lang === 'sw' ? link.sw : link.en;
    sources.push({ label, name: label, to: link.to, verified: true });
  }
  return sources;
}

function productLines(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ id: row?.id || row?.product_id || null, name: labelOf(row?.name || row?.product_name) }))
    .filter((row) => row.name);
}

function actionsFor(results, lang = 'en', format = {}) {
  const actions = [];
  const low = [
    ...(results?.getLowStockProducts?.products || []),
    ...(Array.isArray(results?.getReorderProducts?.data) ? results.getReorderProducts.data : []),
  ];
  const products = [];
  for (const row of low) {
    const id = row?.id || row?.product_id;
    const name = labelOf(row?.name || row?.product_name);
    if (!id || !name || products.some((item) => item.id === id)) continue;
    products.push({ id, name, quantity: 1 });
    if (products.length >= 8) break;
  }
  if (products.length) {
    actions.push({
      id: 'prepare_purchase',
      label: lang === 'sw' ? 'Andaa oda ya manunuzi' : 'Prepare a purchase order',
      to: '/purchases/orders/new',
      draft: { kind: 'purchase', products },
    });
  }

  const debtor = (results?.getCustomerDebts?.topDebtors || []).find((row) => row?.name);
  if (debtor) {
    const balance = money(debtor.balance, format);
    const name = labelOf(debtor.name);
    actions.push({
      id: 'remind_customer',
      label: lang === 'sw' ? `Andaa kumbusho kwa ${name}` : `Prepare a reminder for ${name}`,
      to: '/messaging/recent',
      draft: {
        kind: 'sms',
        phone: debtor.phone || '',
        name,
        message: lang === 'sw'
          ? `Habari ${name}, una deni la ${balance}. Tafadhali lipa unapoweza.`
          : `Hello ${name}, your balance is ${balance}. Please pay when you can.`,
      },
    });
  }
  return actions;
}

function listNames(rows, limit = 5) {
  return (Array.isArray(rows) ? rows : []).slice(0, limit).map((row) => labelOf(row?.name || row?.product_name || row)).filter(Boolean);
}

function figuresAnswer(lang, results, format = {}) {
  const sw = lang === 'sw';
  const lines = [];
  const data = results || {};
  for (const [id, value] of Object.entries(data)) {
    if (!value || typeof value !== 'object') continue;
    const period = value.period;
    if (period?.from && period?.to) {
      const from = formatDate(period.from);
      const to = formatDate(period.to);
      lines.push(from === to ? (sw ? `Kipindi: ${from}` : `Period: ${from}`) : (sw ? `Kipindi: ${from} – ${to}` : `Period: ${from} – ${to}`));
    } else if (period?.date) {
      lines.push(sw ? `Kipindi: ${formatDate(period.date)}` : `Period: ${formatDate(period.date)}`);
    } else if (period?.type === 'today') {
      lines.push(sw ? `Kipindi: leo, ${formatDate(businessToday())}` : `Period: today, ${formatDate(businessToday())}`);
    }
    if (value.sales && value.sales.netSales != null) {
      const count = value.sales.salesCount;
      lines.push(sw
        ? `Mauzo halisi: ${money(value.sales.netSales, format)}${count != null ? ` (${count} mauzo)` : ''}.`
        : `Net sales: ${money(value.sales.netSales, format)}${count != null ? ` (${count} sales)` : ''}.`);
    }
    if (value.profitability?.estimatedOperatingProfit != null) {
      lines.push(sw
        ? `Faida ya uendeshaji: ${money(value.profitability.estimatedOperatingProfit, format)}.`
        : `Estimated operating profit: ${money(value.profitability.estimatedOperatingProfit, format)}.`);
    }
    if (value.totalOutstanding != null) {
      lines.push(sw
        ? `Madeni ya wateja: ${money(value.totalOutstanding, format)} (${value.customersWithDebt || 0} wateja).`
        : `Customer debts: ${money(value.totalOutstanding, format)} (${value.customersWithDebt || 0} customers).`);
    }
    if (value.totalBalance != null && id === 'getSupplierDebts') {
      lines.push(sw
        ? `Madeni ya wasambazaji: ${money(value.totalBalance, format)}.`
        : `Supplier debts: ${money(value.totalBalance, format)}.`);
    }
    if (value.orders != null && id === 'getPurchaseSummary') {
      lines.push(sw
        ? `Manunuzi: oda ${value.orders}, jumla ${money(value.total, format)}.`
        : `Purchases: ${value.orders} orders, total ${money(value.total, format)}.`);
      for (const order of (value.orderDetails || []).slice(0, 5)) {
        const items = (order.items || []).map((item) => `${labelOf(item.name)} × ${item.quantity}`).filter(Boolean).join(', ');
        if (items) lines.push(sw ? `Oda ${order.poNumber} (${labelOf(order.supplier)}): ${items}.` : `Order ${order.poNumber} (${labelOf(order.supplier)}): ${items}.`);
      }
    }
    if (value.returns != null) {
      lines.push(sw
        ? `Marejesho: ${value.returns}, jumla ${money(value.total, format)}.`
        : `Returns: ${value.returns}, total ${money(value.total, format)}.`);
    }
    const names = listNames(value.products || value.topProducts || value.data || value.cashiers || value.stores);
    if (names.length && !value.sales) lines.push(`${sw ? 'Orodha' : 'List'}: ${names.join(', ')}.`);
  }
  const unique = [...new Set(lines.filter(Boolean))];
  if (!unique.length) {
    return sw ? 'Hakuna tarakimu zilizohakikiwa kwa swali hili.' : 'There are no verified figures for this question.';
  }
  return unique.join('\n');
}

function providerNote(lang) {
  return lang === 'sw'
    ? 'Huduma ya AI haipatikani, kwa hiyo hizi ndizo tarakimu zilizohakikiwa.'
    : 'The AI provider is unavailable, so these are the verified figures.';
}

function fallbackAnswer(lang, results, format) {
  return `${figuresAnswer(lang, results, format)}\n\n${providerNote(lang)}`;
}

function compactVerified(results) {
  let clone;
  try {
    clone = JSON.parse(JSON.stringify(results || {}));
  } catch {
    return {};
  }
  for (const value of Object.values(clone)) {
    if (!value || typeof value !== 'object') continue;
    for (const key of Object.keys(value)) {
      if (Array.isArray(value[key]) && value[key].length > 8) value[key] = value[key].slice(0, 8);
    }
  }
  if (JSON.stringify(clone).length > 12000) {
    return Object.fromEntries(Object.keys(clone).map((key) => [key, { saved: true }]));
  }
  return clone;
}

function mapPeriodTools(tools) {
  const out = [];
  for (const id of tools || []) {
    if (PROFIT_TOOLS.has(id)) out.push('getProfitForPeriod');
    else if (SALES_TOOLS.has(id)) out.push('getSalesForPeriod');
    else out.push(id);
  }
  return [...new Set(out.length ? out : ['getSalesForPeriod'])];
}

function briefAction(data, lang = 'en', format = {}) {
  const products = [];
  for (const row of data?.lowStock || []) {
    const id = row?.id || row?.product_id;
    const name = labelOf(row?.name || row?.product_name || row);
    if (!id || !name || products.some((item) => item.id === id)) continue;
    const shortfall = Number(row.minimumStock) - Number(row.quantity);
    products.push({ id, name, quantity: Number.isFinite(shortfall) && shortfall > 0 ? Math.ceil(shortfall) : 1 });
    if (products.length >= 8) break;
  }
  if (products.length) {
    return {
      id: 'prepare_purchase',
      label: lang === 'sw' ? 'Andaa oda ya manunuzi' : 'Prepare a purchase order',
      to: '/purchases/orders/new',
      draft: { kind: 'purchase', products },
    };
  }
  const debtor = (data?.debts || []).find((row) => row?.name);
  if (debtor) {
    const name = labelOf(debtor.name);
    const balance = money(debtor.balance, format);
    return {
      id: 'remind_customer',
      label: lang === 'sw' ? `Andaa kumbusho kwa ${name}` : `Prepare a reminder for ${name}`,
      to: '/messaging/recent',
      draft: {
        kind: 'sms',
        phone: debtor.phone || '',
        name,
        message: lang === 'sw'
          ? `Habari ${name}, una deni la ${balance}. Tafadhali lipa unapoweza.`
          : `Hello ${name}, your balance is ${balance}. Please pay when you can.`,
      },
    };
  }
  return null;
}

function chooseBriefAction(data, lang) {
  if (data.lowStock?.length) {
    return lang === 'sw'
      ? 'Andaa oda ya manunuzi kwa bidhaa zinazokaribia kuisha.'
      : 'Prepare a purchase order for the products that are running low.';
  }
  if (data.debts?.length) {
    const name = labelOf(data.debts[0].name);
    return lang === 'sw' ? `Andaa kumbusho kwa ${name}.` : `Prepare a reminder for ${name}.`;
  }
  if (data.slow?.length) {
    return lang === 'sw'
      ? 'Kagua bidhaa ambazo haziuuzi na uamue kama zipunguzwe bei.'
      : 'Review the products that are not selling and decide whether to reduce the price.';
  }
  return lang === 'sw' ? 'Endelea na mauzo ya leo na ufuatilie hisa jioni.' : 'Carry on with today’s sales and check stock again this evening.';
}

function composeBrief(lang, format, data) {
  const sw = lang === 'sw';
  const lines = [sw ? `Jana, ${formatDate(data.date)}` : `Yesterday, ${formatDate(data.date)}`];
  if (data.sales) {
    lines.push(sw
      ? `Mauzo halisi: ${money(data.sales.net, format)} (${data.sales.count} mauzo).`
      : `Net sales: ${money(data.sales.net, format)} (${data.sales.count} sales).`);
  }
  if (data.profit != null) {
    lines.push(sw
      ? `Faida ya uendeshaji: ${money(data.profit, format)}.`
      : `Estimated operating profit: ${money(data.profit, format)}.`);
  }
  if (data.lowStock?.length) lines.push(`${sw ? 'Zinakaribia kuisha' : 'Running low'}: ${data.lowStock.map(labelOf).join(', ')}.`);
  if (data.slow?.length) lines.push(`${sw ? 'Haziuuzi' : 'Not selling'}: ${data.slow.map(labelOf).join(', ')}.`);
  if (data.debts?.length) {
    lines.push(`${sw ? 'Bado wana deni' : 'Still owed'}: ${data.debts.map((row) => `${labelOf(row.name)} ${money(row.balance, format)}`).join(', ')}.`);
  }
  const action = data.action || chooseBriefAction(data, lang);
  lines.push(`${sw ? 'Ifanye leo' : 'Do this today'}: ${action}`);
  return { text: lines.join('\n'), action };
}

function plainText(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[*•-]\s+/gm, '');
}

function splitAnswer(text) {
  const parts = String(text || '').match(/[^.!?\n]+[.!?\n]*\s*/g);
  return parts?.length ? parts : [String(text || '')];
}

export {
  LINKS, money, formatDate, sourcesFor, actionsFor, figuresAnswer, providerNote, fallbackAnswer,
  compactVerified, mapPeriodTools, composeBrief, chooseBriefAction, briefAction, splitAnswer, plainText, productLines, labelOf,
};
