import * as repo from '../../repositories/InventoryRepository.js';
export default {
  id: 'getInventoryValuation', name: 'Inventory Valuation', category: 'inventory',
  description: 'Returns verified total inventory value and the products holding the most stock value.', requiredPermissions: ['ai_inventory_insights'],
  inputSchema: { type:'object', properties:{ limit:{type:'integer',minimum:1,maximum:30} }, additionalProperties:false },
  async execute({ storeId, args = {} }) { return { data: await repo.getValuation(storeId, args) }; },
};
