import { periodFromMessage } from './periods.js';
import { mapPeriodTools } from './present.js';

const PATTERNS = [
  { tools: ['getStoreComparison'], re: /compare my stores|other stores|across stores|linganisha maduka|maduka yangu|maduka mengine/i },
  { tools: ['getSupplierDebts'], re: /supplier.*(owe|debt|balance)|owe the supplier|wasambazaji.*(deni|anadaiwa)|tunadaiwa na wasambazaji|madeni ya wasambazaji/i },
  { tools: ['getLowStockProducts'], re: /prepare a purchase order|andaa oda|oda ya manunuzi/i },
  { tools: ['getPurchaseSummary'], re: /purchase|manunuzi|purchase order|oda ya manunuzi/i },
  { tools: ['getSalesReturnsSummary'], re: /sales return|returned|marejesho ya mauzo|marejesho(?! ya wasambazaji)/i },
  { tools: ['getCashierSales'], re: /cashier|who sold|nani aliuza|mhudumu|muuzaji/i },
  { tools: ['getExpiryProducts'], re: /expir|muda wa kuisha|tarehe ya kuisha|shelf life/i },
  { tools: ['getSlowMovingProducts', 'getDeadStock'], re: /not selling|slow moving|dead stock|haziuzwi|haziuwi|zisizouzwa|haiziuzi/i },
  { tools: ['getCustomerDebts'], re: /debt|debtor|owe|outstanding|credit customer|madeni|anadaiwa|wanadaiwa|deni/i },
  { tools: ['getExpenseAnalysis'], re: /expense|expenses|spending|cost category|matumizi|gharama za uendeshaji/i },
  { tools: ['getLowStockProducts', 'getInventoryStatus'], re: /low stock|out of stock|reorder|almost finished|running low|running out|stock.*isha|karibia kuisha|imeisha|minimum stock/i },
  { tools: ['getInventoryStatus'], re: /inventory|stock status|stock value|hali ya stock|thamani ya stock/i },
  { tools: ['getSalesComparison'], re: /compare sales|sales comparison|this week|last week|wiki hii|wiki iliyopita|linganisha.*mauzo/i },
  { tools: ['getProfitAnalysis', 'getSalesSummary'], re: /profit|faida|margin|cogs|gross/i },
  { tools: ['getTopProducts'], re: /top product|best seller|sold the most|bidhaa.*ongoza|bidhaa.*uzwa zaidi|zinaongoza/i },
  { tools: ['getSalesSummary'], re: /sales|revenue|mauzo|mapato|miamala/i },
];

const EXPLAIN = /^(why|how come|explain|more detail|tell me more|kwa nini|eleza|ongeza|zaidi)\b/i;
const FOLLOW_UP = /^(why|how|explain|more|which|what about|and |kwa nini|vipi|eleza|ongeza|zipi|gani|na je|na )\b/i;

function classifyIntent(message, conversation = {}) {
  const period = periodFromMessage(message);
  const selected = [];
  for (const pattern of PATTERNS) {
    if (pattern.re.test(message)) selected.push(...pattern.tools);
  }
  let unique = [...new Set(selected)];
  const drop = (keep, ...rest) => {
    if (unique.includes(keep)) unique = unique.filter((id) => !rest.includes(id));
  };
  drop('getSupplierDebts', 'getCustomerDebts');
  drop('getStoreComparison', 'getSalesComparison', 'getSalesSummary');
  drop('getCashierSales', 'getSalesSummary', 'getTopProducts');
  drop('getSalesReturnsSummary', 'getSalesSummary');
  drop('getExpiryProducts', 'getLowStockProducts', 'getInventoryStatus');
  drop('getPurchaseSummary', 'getSalesSummary');
  if (/prepare a purchase order|andaa oda/i.test(message)) {
    unique = [...new Set(['getLowStockProducts', ...unique.filter((id) => id !== 'getPurchaseSummary')])];
  }
  drop('getSlowMovingProducts', 'getSalesSummary', 'getTopProducts');

  if (period && period.kind !== 'today') {
    const base = unique.length ? unique : (conversation.lastTools || []);
    return { tools: mapPeriodTools(base), followUp: true, reuseFigures: false, period, broad: false };
  }

  if (!unique.length && EXPLAIN.test(String(message || '').trim()) && conversation.lastTools?.length) {
    return { tools: [...conversation.lastTools], followUp: true, reuseFigures: true, period: null, broad: false };
  }

  if (!unique.length && FOLLOW_UP.test(String(message || '').trim()) && conversation.lastTools?.length) {
    return { tools: [...conversation.lastTools], followUp: true, reuseFigures: false, period: null, broad: false };
  }

  if (!unique.length && /update|what happened|habari za leo|nini kipya|taarifa|how (is|are) (the )?(business|shop|store)|hali ya biashara|muhtasari wa biashara/i.test(message)) {
    return { tools: ['getSalesSummary', 'getProfitAnalysis', 'getPurchaseSummary', 'getLowStockProducts'], followUp: false, reuseFigures: false, period: null, broad: false };
  }

  if (!unique.length) {
    return { tools: [], followUp: false, reuseFigures: false, period: null, broad: false, clarify: true };
  }

  return { tools: unique, followUp: false, reuseFigures: false, period, broad: false };
}

export { classifyIntent };
