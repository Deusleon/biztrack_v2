import * as repo from '../../repositories/SalesRepository.js';
export default {
  id: 'getSalesTrend', name: 'Sales Trend', category: 'sales',
  description: 'Returns verified sales trend buckets with transactions, gross sales, discounts, net sales, and amount due.', requiredPermissions: ['ai_sales_insights'],
  inputSchema: { type:'object', properties:{ period:{type:'string',enum:['today','yesterday','week','month','quarter','year']}, interval:{type:'string',enum:['day','week','month']} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { period: args.period || null, data: await repo.getTrend(storeId, args) }; },
};
