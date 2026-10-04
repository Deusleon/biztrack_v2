// People, roles, permissions and stores — through the same calls the Users / Roles / Permissions / Stores screens make.
// The decisive test: grant a permission to a role from the API and see a person with that role gain (then lose) real access.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const require = createRequire(import.meta.url);
const pg = require('../../backend/node_modules/pg');
const { default: axios } = await import('../../frontend/node_modules/axios/index.js');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { roleService: Ro, userAdminService: U, permissionService: P, storeService: S } = svc;
const { store } = await signIn();
const tag = Date.now();
const ownerToken = localStorage.getItem('accessToken');
const as = async (token, fn) => { const prev = localStorage.getItem('accessToken'); localStorage.setItem('accessToken', token); try { return await fn(); } finally { localStorage.setItem('accessToken', prev); } };

// ── roles ────────────────────────────────────────────────────────────────────────────────────────
const before = (await Ro.getAll()).data;
ok('roles list (Owner is not offered) carries the number of people in each role', before.length >= 2 && before.every((r) => 'user_count' in r) && !before.some((r) => r.name === 'Owner'), before.map((r) => `${r.name}:${r.user_count}`).join(' '));
const role = (await Ro.create({ name: `ZZ Role ${tag}`, description: 'made by test' })).data;
ok('role create', !!role?.id && role.name === `ZZ Role ${tag}`);
try { await Ro.create({ name: `ZZ Role ${tag}`, description: 'dup' }); ok('duplicate role name refused', false); } catch (e) { ok('duplicate role name refused', !!e.message, e.message); }
ok('role update', (await Ro.update(role.id, { name: `ZZ Role ${tag} B`, description: 'edited' })).data.name === `ZZ Role ${tag} B`);

// ── permissions ──────────────────────────────────────────────────────────────────────────────────
const matrix = (await P.get(role.id)).data; const flat = Object.values(matrix).flatMap((m) => Object.values(m).flat());
ok('permission matrix: modules → submodules → permissions, all off for a new role', flat.length > 150 && flat.every((p) => p.is_allowed === false), `${Object.keys(matrix).length} modules, ${flat.length} permissions`);
const expenses = flat.find((p) => p.name === 'view_expenses');
await P.set({ roleId: role.id, permissionId: expenses.id, isAllowed: true });
ok('one permission granted', (await P.get(role.id)).data && Object.values((await P.get(role.id)).data).flatMap((m) => Object.values(m).flat()).find((p) => p.name === 'view_expenses').is_allowed === true);

// ── people ───────────────────────────────────────────────────────────────────────────────────────
const email = `zz.staff.${tag}@test.com`;
const made = await U.create({ full_name: 'ZZ Staff', email, password: 'Staff1234!', role: `ZZ Role ${tag} B`, status: true });
ok('create a person in a role (by role name, in THIS store)', made.success, made.message);
const list = await U.list({ search: `zz.staff.${tag}`, limit: 5 });
const person = list.data.find((x) => x.email === email);
ok('person is listed with their role and status', !!person && person.storeInfo?.role_name === `ZZ Role ${tag} B` && person.status === true, JSON.stringify(person?.storeInfo));
try { await U.create({ full_name: 'Dup', email, password: 'Staff1234!', role: `ZZ Role ${tag} B`, status: true }); ok('same email twice refused', false); } catch (e) { ok('same email twice refused', !!e.message, e.message); }

// the person logs in and can do exactly what the role allows
const base = process.env.API_URL; const login = await axios.post(`${base}/auth/login`, { email, password: 'Staff1234!' }, { validateStatus: () => true });
ok('the new person can sign in', login.status === 200 && !!login.data.token, `HTTP ${login.status}`);
const staffToken = login.data.token;
const reach = async (p) => (await axios.get(base + p, { headers: { Authorization: `Bearer ${staffToken}`, 'X-Store-ID': store.id }, validateStatus: () => true })).status;
ok('with view_expenses granted: expenses open, products refused', (await reach('/expenses')) === 200 && (await reach(`/customers/${store.id}`)) === 403);
await P.set({ roleId: role.id, permissionId: expenses.id, isAllowed: false });
ok('permission revoked: access is gone immediately', (await reach('/expenses')) === 403, `HTTP ${await reach('/expenses')}`);
await P.setMany({ roleId: role.id, module: 'Expenses', isAllowed: true });
ok('a whole module switched on at once', (await reach('/expenses')) === 200, `HTTP ${await reach('/expenses')}`);
await P.setMany({ roleId: role.id, module: 'Expenses', isAllowed: false });

// ── change role / disable / remove ───────────────────────────────────────────────────────────────
const other = before.find((r) => r.name === 'Cashier');
const upd = await U.update(person.id, { role: other.id, status: false });
ok('change a person\'s role and disable them', upd.success, upd.message);
const again = await axios.post(`${base}/auth/login`, { email, password: 'Staff1234!' }, { validateStatus: () => true });
ok('a disabled person cannot work (login or store access refused)', again.status !== 200 || (await axios.get(`${base}/expenses`, { headers: { Authorization: `Bearer ${again.data.token}`, 'X-Store-ID': store.id }, validateStatus: () => true })).status !== 200, `login HTTP ${again.status}`);
const ownerUserId = (await pool.query(`SELECT su.user_id FROM store_users su JOIN roles r ON r.id = su.role_id WHERE su.store_id = $1 AND r.name = 'Owner' LIMIT 1`, [store.id])).rows[0].user_id;
try { await U.update(ownerUserId, { role: other.id, status: true }); ok('the Owner cannot be demoted', false); } catch (e) { ok('the Owner cannot be demoted', e.status === 403 && /owner/i.test(e.message), `HTTP ${e.status} ${e.message}`); }
try { await U.update(ownerUserId, { role: other.id, status: false }); ok('the Owner cannot be disabled', false); } catch (e) { ok('the Owner cannot be disabled', e.status === 403, `HTTP ${e.status}`); }
try { await U.remove(ownerUserId); ok('the Owner cannot be removed', false); } catch (e) { ok('the Owner cannot be removed', e.status === 403 && /owner/i.test(e.message), `HTTP ${e.status} ${e.message}`); }
// a person of ANOTHER store: this store's admin must not be able to delete their account
const stranger = (await pool.query(`SELECT id FROM users WHERE email = 'deusleon6@gmail.com'`)).rows[0];
try { await U.remove(stranger.id); ok("an admin cannot delete somebody else's account (a person of another store)", false); } catch (e) { ok("an admin cannot delete somebody else's account (a person of another store)", e.status === 404, `HTTP ${e.status}`); }
ok('that account still exists', (await pool.query(`SELECT 1 FROM users WHERE id = $1`, [stranger.id])).rows.length === 1);
ok('the Owner is still the Owner afterwards', (await pool.query(`SELECT r.name FROM store_users su JOIN roles r ON r.id = su.role_id WHERE su.store_id = $1 AND su.user_id = $2`, [store.id, ownerUserId])).rows[0].name === 'Owner');
const rm = await U.remove(person.id); ok('remove a person from the store', rm.success, rm.message);
ok('removed person is gone from the list', !(await U.list({ search: `zz.staff.${tag}`, limit: 5 })).data.some((x) => x.email === email));

// roles from another store / the Owner role can't be handed out
const foreign = (await pool.query(`SELECT id FROM roles WHERE store_id <> $1 AND name = 'Manager' LIMIT 1`, [store.id])).rows[0];
const ownerRole = (await pool.query(`SELECT id FROM roles WHERE store_id = $1 AND name = 'Owner'`, [store.id])).rows[0];
const keep = (await U.create({ full_name: 'ZZ Keep', email: `zz.staff.keep${tag}@test.com`, password: 'Staff1234!', role: other.id, status: true })).success;
const keepP = (await U.list({ search: `zz.staff.keep${tag}`, limit: 5 })).data[0];
if (foreign) { try { await U.update(keepP.id, { role: foreign.id, status: true }); ok('a role from ANOTHER store cannot be assigned', false); } catch (e) { ok('a role from ANOTHER store cannot be assigned', !!e.message, e.message); } }
try { await U.update(keepP.id, { role: ownerRole.id, status: true }); ok('nobody can be made Owner through the people screen', false); } catch (e) { ok('nobody can be made Owner through the people screen', !!e.message, e.message); }
try { await U.create({ full_name: 'ZZ Boss', email: `zz.staff.boss${tag}@test.com`, password: 'Staff1234!', role: 'Owner', status: true }); ok('a new person cannot be created as Owner', false); } catch (e) { ok('a new person cannot be created as Owner', !!e.message, e.message); }
ok('creating a person with the role NAME "Manager" gives them THIS store\'s Manager', (await U.create({ full_name: 'ZZ Mgr', email: `zz.staff.mgr${tag}@test.com`, password: 'Staff1234!', role: 'Manager', status: true })).success && (await U.list({ search: `zz.staff.mgr${tag}`, limit: 5 })).data[0].storeInfo.role_id === (await Ro.getAll()).data.find((r) => r.name === 'Manager').id);
// disabling a person here must not switch them off in OTHER stores
const gu = (await pool.query(`SELECT id, status FROM users WHERE email = $1`, [`zz.staff.keep${tag}@test.com`])).rows[0];
await U.update(keepP.id, { role: other.id, status: false });
ok('disabling a person in this store leaves their account itself enabled (other stores unaffected)', (await pool.query(`SELECT status FROM users WHERE id = $1`, [gu.id])).rows[0].status === true);
await U.remove(keepP.id);

// ── delete the role ──────────────────────────────────────────────────────────────────────────────
const del = await Ro.remove(role.id); ok('role delete', del.success, del.message);
ok('role list back to its original size', (await Ro.getAll()).data.length === before.length);

// ── stores ───────────────────────────────────────────────────────────────────────────────────────
const stores0 = (await S.getMine()).data.length;
const ns = (await S.create({ name: `ZZ Store ${tag}`, store_code: `ZZ${String(tag).slice(-8)}`, location: 'Dar' })).data;
ok('store create', !!ns?.id, ns?.name);
ok('new store listed', (await S.getMine()).data.length === stores0 + 1);
try { await S.create({ name: `ZZ Store ${tag}`, store_code: `ZY${String(tag).slice(-8)}`, location: 'x' }); ok('same store name twice refused', false); } catch (e) { ok('same store name twice refused', !!e.message, e.message); }
try { await S.create({ name: `ZZ Other ${tag}`, store_code: `ZZ${String(tag).slice(-8)}`, location: 'x' }); ok('same store code twice refused', false); } catch (e) { ok('same store code twice refused', !!e.message, e.message); }
ok('store update', (await S.update(ns.id, { name: `ZZ Store ${tag} B`, store_code: `ZZ${String(tag).slice(-8)}`, location: 'Arusha' })).data.location === 'Arusha');
try { await S.remove(ns.id, 'wrong-password'); ok('deleting a store with the wrong password is refused', false); } catch (e) { ok('deleting a store with the wrong password is refused', !!e.message, e.message); }
ok('store still there after the refused delete', (await S.getMine()).data.some((x) => x.id === ns.id));
const rs = await S.remove(ns.id, process.env.TEST_PASSWORD || 'Test1234!'); ok('store delete with the right password', rs.success, rs.message);
ok('store list back to its original size', (await S.getMine()).data.length === stores0);
await pool.query(`DELETE FROM users WHERE email LIKE 'zz.staff.%@test.com'`);
await pool.end(); finish();
