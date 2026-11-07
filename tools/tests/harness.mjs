// Runs the REAL frontend service layer (frontend/src/services/api.js + utils/api.js) inside Node against a live backend,
// so the exact calls the pages make can be tested without a browser.
//
//   env: API_URL        default http://localhost:5055/api
//        TEST_EMAIL     default deusleon7@gmail.com        (the Owner of "Magomeni Store" in the user's test data)
//        TEST_PASSWORD  default Test1234!                  (set by you on a COPY of the test database — see tools/README.md)
//        TEST_STORE     default "Magomeni Store"           (the store that has products/customers/categories)
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(here, '..', '..', 'frontend');
const SRC = path.join(FRONT, 'src');
process.env.VITE_API_BASE_URL = process.env.API_URL || 'http://localhost:5055/api';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.window = { __auth_user: null, dispatchEvent() {}, location: { pathname: '/', href: '' } };
globalThis.CustomEvent = class { constructor(n, o) { this.type = n; this.detail = o?.detail; } };

// Vite resolves extension-less imports and import.meta.env; Node does not. Make small patched copies in a temp dir.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-svc-'));
for (const f of ['utils/api.js', 'services/api.js', 'utils/i18n.js']) {
  const dst = path.join(tmp, f); fs.mkdirSync(path.dirname(dst), { recursive: true });
  let s = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/import\.meta\.env\.VITE_API_BASE_URL/g, 'process.env.VITE_API_BASE_URL');
  s = s.replace(/import (\w+) from ['"]\.\.\/lang\/(en|sw)\.json['"];?/g, (m, n, l) => `const ${n} = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(SRC, 'lang', l + '.json'))},'utf8'));`);
  s = s.replace(/from '(\.\.?\/[^']+?)(?<!\.js)(?<!\.json)'/g, "from '$1.js'");
  if (f === 'utils/i18n.js') s = "import fs from 'node:fs';\n" + s;
  fs.writeFileSync(dst, s);
}
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
fs.symlinkSync(path.join(FRONT, 'node_modules'), path.join(tmp, 'node_modules'));
export const svc = await import(path.join(tmp, 'services/api.js'));

let failed = 0;
export const ok = (name, cond, extra = '') => { if (!cond) failed++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); };

/** Signs in like the Login page and switches to the store that has data. Returns { store, login }. */
export const signIn = async () => {
  const login = await svc.authService.login({ email: process.env.TEST_EMAIL || 'deusleon7@gmail.com', password: process.env.TEST_PASSWORD || 'Test1234!' });
  localStorage.setItem('accessToken', login.token);
  const stores = await svc.storeService.getMine();
  const want = process.env.TEST_STORE || 'Magomeni Store';
  const store = stores.data.find((s) => s.name === want);
  if (!store) throw new Error(`Store "${want}" not found. Stores: ${stores.data.map((s) => s.name).join(', ')}`);
  const sw = await svc.authService.switchStore(store.id);
  localStorage.setItem('accessToken', sw.token); localStorage.setItem('currentStoreId', store.id);
  return { store, login, switched: sw };
};

export const finish = () => { fs.rmSync(tmp, { recursive: true, force: true }); console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0); };
process.on('uncaughtException', (e) => { console.log('ERROR:', e.message, (e.stack||'').split('\n').slice(1,3).join(' | ')); fs.rmSync(tmp, { recursive: true, force: true }); process.exit(1); });
