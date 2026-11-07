import { buildBusinessContext } from '../businessContext.service.js';
export default {
  id: 'getSalesSummary',
  name: 'Sales Summary',
  category: 'sales',
  requiredPermissions: ['ai_sales_insights'],
  description: 'Returns verified sales totals for today, including gross sales, discounts, net sales, VAT, sales count, amount due, yesterday net sales, percentage change, and payment methods.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute({ storeId }) {
    const context = await buildBusinessContext(storeId);
    return {
      period: context.period,
      sales: context.sales,
      payments: context.payments,
    };
  },
};
