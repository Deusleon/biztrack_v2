import * as repo from '../../repositories/SalesRepository.js';
export default {
  id: 'getSalesByPaymentMethod', name: 'Sales by Payment Method', category: 'sales',
  description: 'Returns verified collections, amount due, transactions, and net sales grouped by payment method.', requiredPermissions: ['ai_sales_insights'],
  inputSchema: { type:'object', properties:{ period:{type:'string',enum:['today','yesterday','week','month','quarter','year']} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { period: args.period || null, data: await repo.getByPaymentMethod(storeId, args) }; },
};
