import { ok, svc, signIn, finish } from './harness.mjs';
const { priceCategoryService } = svc;
await signIn();
const l0 = await priceCategoryService.getAll();
ok('price categories list (server does not page → one page)', l0.success && l0.pagination.totalItems === l0.data.length && l0.data.length >= 3);
const c = await priceCategoryService.create({ name: 'ZZ Price Test', description: 'by test' });
ok('create', c.success && c.data?.id, c.message);
ok('list grew by one', (await priceCategoryService.getAll()).data.length === l0.data.length + 1);
ok('update', (await priceCategoryService.update(c.data.id, { name: 'ZZ Price Test 2', description: 'edited' })).data.name === 'ZZ Price Test 2');
try { await priceCategoryService.create({ name: 'ZZ Price Test 2' }); ok('duplicate name refused', false); } catch (e) { ok('duplicate name refused', !!e.message, e.message); }
try { await priceCategoryService.create({ name: '' }); ok('empty name refused', false); } catch (e) { ok('empty name refused', !!e.message, e.message); }
ok('delete → back to original', (await priceCategoryService.remove(c.data.id)).success && (await priceCategoryService.getAll()).data.length === l0.data.length);
finish();
