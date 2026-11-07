import * as repo from '../../repositories/SalesRepository.js';
export default {
  id: 'getSalesByCategory', name: 'Sales by Category', category: 'sales',
  description: 'Returns verified quantity and net sales grouped by product category.', requiredPermissions: ['ai_sales_insights'],
  inputSchema: { type:'object', properties:{ period:{type:'string',enum:['today','yesterday','week','month','quarter','year']}, limit:{type:'integer',minimum:1,maximum:30} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { period: args.period || null, data: await repo.getByCategory(storeId, args) }; },
};
