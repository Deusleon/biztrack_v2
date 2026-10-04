// A person with NO permissions (role "Pending") calls EVERY backend route. Everything except what any member legitimately needs
// (their own profile and stores, the store's general settings/branding, subscription info, their own support tickets, their permission list)
// must answer 401/403. Found 20+ gaps in the original (dashboard figures, all AI, price changes, expenses…) — this keeps them closed.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
import { ok, svc, finish } from './harness.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', '..', 'backend', 'package.json'));
const pg = require('pg'); const bcrypt = require('bcryptjs');
const { default: axios } = await import('../../frontend/node_modules/axios/index.js');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const src = path.join(here, '..', '..', 'backend', 'src');
const store = (await pool.query(`SELECT id FROM stores WHERE name = 'Magomeni Store'`)).rows[0];
const role = (await pool.query(`SELECT id FROM roles WHERE name = 'Pending' AND store_id = $1`, [store.id])).rows[0];
const email = 'zz.pending@test.com'; const password = 'Pend1234!';
let u = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0];
if (!u) u = (await pool.query(`INSERT INTO users (name, email, password, is_verified, status, password_changed_at, preferred_language) VALUES ('ZZ Pending', $1, $2, true, true, now(), 'en') RETURNING id`, [email, bcrypt.hashSync(password, 10)])).rows[0];
await pool.query(`INSERT INTO store_users (store_id, user_id, role_id, status) SELECT $1, $2, $3, true WHERE NOT EXISTS (SELECT 1 FROM store_users WHERE store_id = $1 AND user_id = $2)`, [store.id, u.id, role.id]);
const login = await svc.authService.login({ email, password }); localStorage.setItem('accessToken', login.token);
const sw = await svc.authService.switchStore(store.id);
ok('a person with NO permissions has no permissions at all', sw.permissions.length === 0);

const server = fs.readFileSync(path.join(src, 'server.js'), 'utf8');
const imports = Object.fromEntries([...server.matchAll(/import (\w+) from '\.\/routes\/([\w./-]+)'/g)].map((m) => [m[1], m[2]]));
const mounts = [...server.matchAll(/app\.use\(\s*['"](\/api[^'"]*)['"]\s*,\s*(\w+)\s*\)/g)].map((m) => [m[1], imports[m[2]]]).filter((m) => m[1]);
const fake = '00000000-0000-0000-0000-000000000001';
const base = new URL(process.env.API_URL).origin;
const headers = { Authorization: `Bearer ${sw.token}`, 'X-Store-ID': store.id };
const skip = /^\/api\/(auth|health)|\/public|\/track|webhook|\/qz\/sign|\/user-manual|\/test/;
const allowed = /^\/api\/(profile|user|stores|support\/tickets|subscriptions\/(plans|me|history))(\/|$)|^\/api\/settings(\/branding)?\/?$/;
let total = 0; const surprising = [];
for (const [prefix, file] of mounts) {
  const f = path.join(src, 'routes', file.endsWith('.js') ? file : `${file}.js`); if (!fs.existsSync(f)) continue;
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/router\.(get|post|put|delete|patch)\(\s*['"]([^'"]*)['"]/g)) {
    const raw = prefix + (m[2] === '/' ? '' : m[2]); if (skip.test(raw)) continue;
    total++;
    const r = await axios({ method: m[1], url: base + raw.replace(/:\w+/g, fake), headers, data: ['get', 'delete'].includes(m[1]) ? undefined : {}, validateStatus: () => true, timeout: 30000, maxRedirects: 0 }).catch(() => ({ status: 'ERR' }));
    if (![401, 403].includes(r.status) && !allowed.test(raw)) surprising.push(`${m[1].toUpperCase()} ${raw} → ${r.status}`);
  }
}
ok(`${total} routes tried`, total > 250);
ok('every route outside the "any member" list refuses a person with no permissions', surprising.length === 0, surprising.join(' | '));
await pool.end(); finish();
