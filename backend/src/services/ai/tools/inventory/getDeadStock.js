import * as repo from '../../repositories/InventoryRepository.js';
export default {
  id: 'getDeadStock', name: 'Dead Stock', category: 'inventory',
  description: 'Returns products currently in stock that have not sold within the selected number of days.', requiredPermissions: ['ai_inventory_insights'],
  inputSchema: { type:'object', properties:{ days:{type:'integer',minimum:7,maximum:730}, limit:{type:'integer',minimum:1,maximum:50} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { data: await repo.getDeadStock(storeId, args) }; },
};
