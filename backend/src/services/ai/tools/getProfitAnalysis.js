import { buildBusinessContext } from '../businessContext.service.js';
export default {
  id: 'getProfitAnalysis',
  name: 'Profit Analysis',
  category: 'finance',
  requiredPermissions: ['ai_profit_insights'],
  description: 'Returns verified profitability metrics for today: net sales, discounts, COGS, gross profit, gross margin, operating expenses, and estimated operating profit. Use for profit, margin, and COGS questions.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute({ storeId }) {
    const context = await buildBusinessContext(storeId);
    return {
      period: context.period,
      sales: {
        netSales: context.sales.netSales,
        discounts: context.sales.discounts,
        changePercent: context.sales.changePercent,
      },
      profitability: context.profitability,
    };
  },
};
