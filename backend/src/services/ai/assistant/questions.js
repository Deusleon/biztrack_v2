/** Real questions used to check that BizTrack AI picks the right verified figures.
 *  `lastTools` is what the previous answer already checked. `reuse` means the
 *  follow-up must answer from those saved figures instead of fetching again.
 *  A wrong answer invents numbers, names a different period, or reads a store
 *  the person does not belong to.
 */
const QUESTIONS = [
  { id: 'sales-today-en', lang: 'en', text: 'How were my sales today?', tools: ['getSalesSummary'] },
  { id: 'sales-today-sw', lang: 'sw', text: 'Mauzo ya leo yalikuwa mangapi?', tools: ['getSalesSummary'] },
  { id: 'profit-en', lang: 'en', text: 'Why is my profit down?', tools: ['getProfitAnalysis', 'getSalesSummary'] },
  { id: 'profit-sw', lang: 'sw', text: 'Faida ya leo ikoje?', tools: ['getProfitAnalysis', 'getSalesSummary'] },
  { id: 'products-en', lang: 'en', text: 'Which products sold the most?', tools: ['getTopProducts'] },
  { id: 'products-sw', lang: 'sw', text: 'Bidhaa gani zinaongoza?', tools: ['getTopProducts'] },
  { id: 'debts-en', lang: 'en', text: 'Who owes us the most?', tools: ['getCustomerDebts'] },
  { id: 'debts-sw', lang: 'sw', text: 'Nani anadaiwa zaidi?', tools: ['getCustomerDebts'] },
  { id: 'expenses-en', lang: 'en', text: 'What are today’s expenses?', tools: ['getExpenseAnalysis'] },
  { id: 'expenses-sw', lang: 'sw', text: 'Matumizi ya leo ni kiasi gani?', tools: ['getExpenseAnalysis'] },
  { id: 'low-en', lang: 'en', text: 'Which products are almost finished?', tools: ['getLowStockProducts', 'getInventoryStatus'] },
  { id: 'low-sw', lang: 'sw', text: 'Bidhaa zipi zinakaribia kuisha?', tools: ['getLowStockProducts', 'getInventoryStatus'] },
  { id: 'stock-en', lang: 'en', text: 'What is my stock value?', tools: ['getInventoryStatus'] },
  { id: 'compare-week', lang: 'en', text: 'Compare this week with last week', tools: ['getSalesComparison'] },
  { id: 'why', lang: 'en', text: 'Why?', lastTools: ['getProfitAnalysis'], tools: ['getProfitAnalysis'], reuse: true },
  { id: 'kwa-nini', lang: 'sw', text: 'Kwa nini?', lastTools: ['getSalesSummary'], tools: ['getSalesSummary'], reuse: true },
  { id: 'last-month', lang: 'en', text: 'And last month?', lastTools: ['getSalesSummary'], tools: ['getSalesForPeriod'], reuse: false },
  { id: 'mwezi', lang: 'sw', text: 'Na mwezi uliopita?', lastTools: ['getProfitAnalysis'], tools: ['getProfitForPeriod'], reuse: false },
  { id: 'purchases-en', lang: 'en', text: 'How were purchases this month?', tools: ['getPurchaseSummary'] },
  { id: 'purchases-sw', lang: 'sw', text: 'Manunuzi ya mwezi huu yalikuwa mangapi?', tools: ['getPurchaseSummary'] },
  { id: 'suppliers-en', lang: 'en', text: 'Which suppliers do we owe?', tools: ['getSupplierDebts'] },
  { id: 'suppliers-sw', lang: 'sw', text: 'Tunadaiwa na wasambazaji gani?', tools: ['getSupplierDebts'] },
  { id: 'returns-en', lang: 'en', text: 'How many sales were returned?', tools: ['getSalesReturnsSummary'] },
  { id: 'returns-sw', lang: 'sw', text: 'Marejesho ya mauzo yalikuwa mangapi?', tools: ['getSalesReturnsSummary'] },
  { id: 'cashier-en', lang: 'en', text: 'Which cashier sold the most?', tools: ['getCashierSales'] },
  { id: 'cashier-sw', lang: 'sw', text: 'Mhudumu gani aliuza zaidi?', tools: ['getCashierSales'] },
  { id: 'expiry-en', lang: 'en', text: 'What is about to expire?', tools: ['getExpiryProducts'] },
  { id: 'expiry-sw', lang: 'sw', text: 'Bidhaa zipi muda wa kuisha unakaribia?', tools: ['getExpiryProducts'] },
  { id: 'slow-en', lang: 'en', text: 'What is not selling?', tools: ['getSlowMovingProducts', 'getDeadStock'] },
  { id: 'slow-sw', lang: 'sw', text: 'Bidhaa zipi haziuzwi?', tools: ['getSlowMovingProducts', 'getDeadStock'] },
  { id: 'stores-en', lang: 'en', text: 'Compare my stores', tools: ['getStoreComparison'] },
  { id: 'stores-sw', lang: 'sw', text: 'Linganisha maduka yangu', tools: ['getStoreComparison'] },
  { id: 'yesterday-en', lang: 'en', text: 'How were sales yesterday?', tools: ['getSalesForPeriod'] },
  { id: 'yesterday-sw', lang: 'sw', text: 'Mauzo ya jana yalikuwa mangapi?', tools: ['getSalesForPeriod'] },
];

function sameTools(actual, expected) {
  const left = [...new Set(actual || [])].sort();
  const right = [...new Set(expected || [])].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function gradeQuestion(classify, question) {
  const result = classify(question.text, { lastTools: question.lastTools || [] });
  const toolsOk = sameTools(result.tools, question.tools);
  const reuseOk = question.reuse == null || result.reuseFigures === question.reuse;
  return {
    id: question.id,
    pass: toolsOk && reuseOk,
    expected: question.tools,
    actual: result.tools,
    reuse: result.reuseFigures,
    wrong: 'A wrong answer invents a number, uses another period, or includes a store the person does not belong to.',
  };
}

export { QUESTIONS, gradeQuestion, sameTools };
