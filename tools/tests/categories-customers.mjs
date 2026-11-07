import { ok, svc, signIn, finish } from './harness.mjs';
const { categoryService, customerService, priceCategoryService, dashboardService, authService } = svc;
const { switched } = await signIn();
ok('switch store → role + permissions for that store', switched.permissions.length > 100, `${switched.permissions.length} perms, role ${switched.storeInfo.role_name}`);

let l = await categoryService.getAll({ page: 1, limit: 5 });
ok('categories list → {success,data,pagination}', l.success && Array.isArray(l.data) && l.pagination.totalItems >= 15, `total ${l.pagination.totalItems}`);
const before = l.pagination.totalItems;
const c = await categoryService.create({ name: 'ZZ Test Category', description: 'created by test' });
ok('category create', c.success && c.data?.id, c.message);
const u = await categoryService.update(c.data.id, { name: 'ZZ Test Category 2', description: 'edited' });
ok('category update', u.data?.name === 'ZZ Test Category 2');
const s = await categoryService.getAll({ search: 'ZZ Test', limit: 5 });
ok('category search', s.data.length === 1 && s.data[0].id === c.data.id);
const d = await categoryService.remove(c.data.id);
l = await categoryService.getAll({ page: 1, limit: 5 });
ok('category delete → back to original size', d.success && l.pagination.totalItems === before);
try { await categoryService.create({ name: '' }); ok('empty category name refused', false); } catch (e) { ok('empty category name refused', !!e.message, e.message); }

const types = await priceCategoryService.getAll();
ok('price categories (customer types)', types.data.length > 0, types.data.map((t) => t.name).join(', '));
const cl = await customerService.getAll({ limit: 25 });
ok('customers list', cl.success && cl.pagination.totalItems >= 1, `${cl.pagination.totalItems}`);
const cu = await customerService.create({ name: 'ZZ Test Customer', phone: '255712345678', email: 'zz@test.com', customer_type: types.data[0].id, credit_limit: 50000, credit_due_days: 14, address: 'Dar' });
ok('customer create', cu.success && cu.data?.id);
const cu2 = await customerService.update(cu.data.id, { name: 'ZZ Test Customer B', phone: '255712345678', email: 'zz@test.com', customer_type: types.data[0].id, credit_limit: 75000, credit_due_days: 7, address: 'Dar' });
ok('customer update', Number(cu2.data.credit_limit) === 75000 && Number(cu2.data.credit_due_days) === 7);
ok('customer delete', (await customerService.remove(cu.data.id)).success);

const dash = await dashboardService.getStats();
ok('dashboard stats', !!dash.data.todayStats && Array.isArray(dash.data.revenueTrend));
localStorage.removeItem('accessToken');
try { await categoryService.getAll({}); ok('categories without token refused', false); } catch (e) { ok('categories without token refused', e.status === 401, `HTTP ${e.status}`); }
finish();
