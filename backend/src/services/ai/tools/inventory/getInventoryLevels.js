import * as repo from '../../repositories/InventoryRepository.js';
export default {
  id: 'getInventoryLevels', name: 'Inventory Levels', category: 'inventory',
  description: 'Returns verified current stock quantities, minimum levels, and stock value by product.', requiredPermissions: ['ai_inventory_insights'],
  inputSchema: { type:'object', properties:{ status:{type:'string',enum:['all','in_stock','low_stock','out_of_stock']}, limit:{type:'integer',minimum:1,maximum:50} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { data: await repo.getLevels(storeId, args) }; },
};
