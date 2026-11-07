import salesAdapter from './adapters/SalesReportContextAdapter.js';
import profitAdapter from './adapters/ProfitReportContextAdapter.js';
import inventoryAdapter from './adapters/InventoryReportContextAdapter.js';
const adapters = [salesAdapter, profitAdapter, inventoryAdapter];
const map = new Map(adapters.map((adapter) => [adapter.id, adapter]));
export default { get(type) { return map.get(type); }, list() { return adapters.map(({ id, requiredPermission }) => ({ id, requiredPermission })); } };
