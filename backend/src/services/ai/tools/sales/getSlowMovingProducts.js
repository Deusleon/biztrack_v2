import * as repo from '../../repositories/SalesRepository.js';
export default {
  id: 'getSlowMovingProducts', name: 'Slow Moving Products', category: 'sales',
  description: 'Returns verified products with the lowest sold quantities in a selected recent period.', requiredPermissions: ['ai_sales_insights'],
  inputSchema: { type:'object', properties:{ days:{type:'integer',minimum:1,maximum:365}, limit:{type:'integer',minimum:1,maximum:50} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { period: args.period || null, data: await repo.getProductMovement(storeId, { ...args, direction: 'asc' }) }; },
};
