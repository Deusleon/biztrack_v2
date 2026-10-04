// Authorization: a CASHIER (17 permissions) must not be able to use any administration endpoint, must not be able to give
// themselves more permissions, and must not be able to change or delete a store; the OWNER still can do all of it.
// Creates the test user zz.cashier@test.com (a Cashier of "Magomeni Store") directly in the TEST database.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const require = createRequire(import.meta.url);
const pg = require('../../backend/node_modules/pg'); const bcrypt = require('../../backend/node_modules/bcryptjs');
const { default: axios } = await import('../../frontend/node_modules/axios/index.js');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { store, login: ownerLogin } = await signIn();
const ownerToken = localStorage.getItem('accessToken');
const email = 'zz.cashier@test.com'; const password = 'Cash1234!';
const role = (await pool.query(`SELECT id FROM roles WHERE name = 'Cashier' AND store_id = $1`, [store.id])).rows[0];
let u = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0];
if (!u) u = (await pool.query(`INSERT INTO users (name, email, password, is_verified, status, password_changed_at, preferred_language) VALUES ('ZZ Cashier', $1, $2, true, true, now(), 'en') RETURNING id`, [email, bcrypt.hashSync(password, 10)])).rows[0];
await pool.query(`INSERT INTO store_users (store_id, user_id, role_id, status) SELECT $1, $2, $3, true WHERE NOT EXISTS (SELECT 1 FROM store_users WHERE store_id = $1 AND user_id = $2)`, [store.id, u.id, role.id]);
const cl = await svc.authService.login({ email, password }); localStorage.setItem('accessToken', cl.token);
const sw = await svc.authService.switchStore(store.id);
const base = process.env.API_URL; const fake = '00000000-0000-0000-0000-000000000001';
const call = (token, m, p, b) => axios({ method: m, url: base + p, headers: { Authorization: `Bearer ${token}`, 'X-Store-ID': store.id }, data: b, validateStatus: () => true, timeout: 20000 });
ok('the test cashier has only cashier permissions', sw.permissions.length < 30 && sw.storeInfo.role_name === 'Cashier', `${sw.permissions.length} permissions`);
ok('a person cannot be a member of the same store twice (unique rule)', await pool.query(`INSERT INTO store_users (store_id, user_id, role_id, status) VALUES ($1, $2, $3, true)`, [store.id, u.id, role.id]).then(() => false, (e) => e.code === '23505'));

const admin = [
  ['GET', '/roles'], ['POST', '/roles', { name: 'ZZ not allowed' }], ['PUT', `/roles/${fake}`, { name: 'x' }], ['DELETE', `/roles/${fake}`],
  ['GET', `/permissions?roleId=${role.id}`], ['POST', '/permissions', { roleId: role.id, permissionId: fake, isAllowed: true }], ['POST', '/permissions/bulk', { roleId: role.id, module: 'Users', isAllowed: true }],
  ['POST', '/store-users', { store_id: store.id, email: 'nobody@test.com', role_id: role.id }], ['POST', '/store-users/create-user', { name: 'x', email: 'x@test.com', role_id: role.id }], ['GET', `/store-users/${store.id}/users`], ['PUT', `/store-users/${fake}`, { role_id: role.id }], ['DELETE', `/store-users/${fake}`],
  ['PUT', `/settings/${store.id}`, { businessName: 'hacked' }], ['GET', '/settings/notifications'], ['PUT', '/settings/notifications', {}], ['POST', '/settings/notifications/test-run', {}], ['DELETE', '/settings/branding/logo'],
  ['GET', '/tools/export'], ['GET', '/tools/backup'], ['GET', '/tools/db-health'], ['POST', '/tools/clear-cache', {}], ['GET', '/tools/logs'],
  ['GET', '/integrations'], ['PUT', '/integrations/sms', { config: {} }], ['POST', '/integrations/cloud_backup/run', {}],
  ['GET', '/backups'], ['POST', '/backups/run', {}],
  ['GET', '/import-export/export/full'], ['POST', '/import-export/stock'],
];
const open = [];
for (const [m, p, b] of admin) { const r = await call(cl.token, m, p, b); if (![401, 403].includes(r.status)) open.push(`${m} ${p.split('?')[0].replace(fake, ':id')} → ${r.status}`); }
ok(`a cashier is refused on all ${admin.length} administration endpoints`, open.length === 0, open.join('; '));

// privilege escalation: try to give the cashier role permissions it does not have (one, then a whole module)
const rowsBefore = (await pool.query(`SELECT count(*)::int AS n FROM role_permissions WHERE role_id = $1 AND store_id = $2`, [role.id, store.id])).rows[0].n;
const viewUsers = (await pool.query(`SELECT id FROM permissions WHERE name = 'edit_users'`)).rows[0];
const e1 = await call(cl.token, 'POST', '/permissions', { roleId: role.id, permissionId: viewUsers.id, isAllowed: true });
const e2 = await call(cl.token, 'POST', '/permissions/bulk', { roleId: role.id, module: 'Users', isAllowed: true });
const rowsAfter = (await pool.query(`SELECT count(*)::int AS n FROM role_permissions WHERE role_id = $1 AND store_id = $2 AND is_allowed`, [role.id, store.id])).rows[0].n;
const allowedBefore = (await pool.query(`SELECT count(*)::int AS n FROM role_permissions WHERE role_id = $1 AND store_id = $2 AND is_allowed`, [role.id, store.id])).rows[0].n;
ok('a cashier cannot give their own role more permissions (one permission, or a whole module)', [401, 403].includes(e1.status) && [401, 403].includes(e2.status) && rowsAfter === allowedBefore && allowedBefore <= rowsBefore, `HTTP ${e1.status}/${e2.status}; allowed permissions of the role: ${rowsAfter}`);
const fresh = await svc.authService.switchStore(store.id); ok('the cashier still has exactly the cashier permissions', new Set(fresh.permissions.map((p) => p.name)).size === fresh.permissions.length && fresh.permissions.length === rowsAfter, `${fresh.permissions.length} permissions`);

// stores belonging to someone else
const nameBefore = (await pool.query(`SELECT name FROM stores WHERE id = $1`, [store.id])).rows[0].name;
const up = await call(cl.token, 'PUT', `/stores/${store.id}`, { name: 'hijacked' }); const del = await call(cl.token, 'DELETE', `/stores/${store.id}`, { password: 'Cash1234!' });
const nameAfter = (await pool.query(`SELECT name FROM stores WHERE id = $1`, [store.id])).rows[0]?.name;
ok('a cashier cannot rename or delete the store', ![200, 201].includes(up.status) && ![200, 204].includes(del.status) && nameAfter === nameBefore, `PUT ${up.status}, DELETE ${del.status}, name still "${nameAfter}"`);
const gone = await call(cl.token, 'DELETE', `/stores/${fake}`, { password: 'x' }); ok('deleting a store that does not exist answers 404, not a server error', gone.status === 404 || gone.status === 403, `HTTP ${gone.status}`);

// what a cashier DOES need still works
for (const [m, p] of [['GET', '/settings'], ['GET', '/settings/branding'], ['GET', '/user/permissions'], ['GET', '/stores']]) { const r = await call(cl.token, m, p); ok(`cashier can still ${m} ${p}`, r.status === 200, `HTTP ${r.status}`); }

// the owner still can
for (const [m, p] of [['GET', '/roles'], ['GET', `/permissions?roleId=${role.id}`], ['GET', `/store-users/${store.id}/users`], ['GET', '/settings/notifications'], ['GET', '/settings']]) { const r = await call(ownerToken, m, p); ok(`owner can ${m} ${p.split('?')[0]}`, r.status === 200, `HTTP ${r.status}`); }
const rname = `ZZ Role ${Date.now()}`;
const made = await call(ownerToken, 'POST', '/roles', { name: rname, description: 'test' }); ok('owner creates a role', made.status === 201, made.data?.message);
const list = await call(ownerToken, 'GET', '/roles'); const mine = (list.data.roles || list.data.data || []).find((r) => r.name === rname);
const upd = mine && await call(ownerToken, 'PUT', `/roles/${mine.id}`, { name: `${rname} B`, description: 'edited' }); ok('owner renames the role', !!mine && upd.status === 200, `HTTP ${upd?.status}`);
const dl = mine && await call(ownerToken, 'DELETE', `/roles/${mine.id}`); ok('owner deletes the role', !!mine && dl.status === 200, `HTTP ${dl?.status}`);
await pool.query(`DELETE FROM roles WHERE name LIKE 'ZZ not allowed%' OR name LIKE 'ZZ authz%'`);
await pool.end(); finish();
