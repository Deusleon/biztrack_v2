import * as repo from '../../repositories/InventoryRepository.js';
export default {
  id: 'getExpiryProducts', name: 'Expiry Products', category: 'inventory',
  description: 'Returns active inventory batches that are expired or will expire within the selected period.', requiredPermissions: ['ai_inventory_insights'],
  inputSchema: { type:'object', properties:{ days:{type:'integer',minimum:0,maximum:365}, limit:{type:'integer',minimum:1,maximum:50} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { data: await repo.getExpiry(storeId, args) }; },
};
