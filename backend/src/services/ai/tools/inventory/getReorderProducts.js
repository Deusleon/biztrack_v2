import * as repo from '../../repositories/InventoryRepository.js';
export default {
  id: 'getReorderProducts', name: 'Reorder Products', category: 'inventory',
  description: 'Returns products at or below reorder level with a verified suggested order quantity.', requiredPermissions: ['ai_inventory_insights'],
  inputSchema: { type:'object', properties:{ safetyFactor:{type:'number',minimum:1,maximum:3}, limit:{type:'integer',minimum:1,maximum:50} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { data: await repo.getReorder(storeId, args) }; },
};
