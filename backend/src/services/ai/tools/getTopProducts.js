import { buildBusinessContext } from '../businessContext.service.js';
export default {
  id: 'getTopProducts',
  name: 'Top Products',
  category: 'sales',
  requiredPermissions: ['ai_sales_insights'],
  description: 'Returns verified top-selling products for today, including quantity sold, net sales, and contribution to total net sales. Use for best-seller and leading-product questions.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: 'Number of products to return. The current verified context supports up to 5. Defaults to 5.',
      },
    },
    additionalProperties: false,
  },
  async execute({ storeId, args = {} }) {
    const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 5);
    const context = await buildBusinessContext(storeId);
    return {
      period: context.period,
      totalNetSales: context.sales.netSales,
      products: context.products.topProducts.slice(0, limit),
    };
  },
};
