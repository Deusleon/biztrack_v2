// Sign-in / account-recovery rate limits and the standard security headers.
//   - correct sign-ins are never counted (a person can sign in as often as they like)
//   - the 11th WRONG try for the same address + e-mail inside 15 minutes is refused with 429 + Retry-After, in the caller's language
//   - someone else's e-mail (same address) is not affected, and the right account still signs in while another one is blocked
//   - helmet headers are present and X-Powered-By is gone
import { ok, finish } from './harness.mjs';
const { default: axios } = await import('../../frontend/node_modules/axios/index.js');
const base = process.env.API_URL;
const call = (path, body, headers = {}) => axios.post(base + path, body, { headers, validateStatus: () => true });
const email = process.env.TEST_EMAIL || 'deusleon7@gmail.com'; const password = process.env.TEST_PASSWORD || 'Test1234!';

let statuses = [];
for (let i = 0; i < 14; i++) statuses.push((await call('/auth/login', { email, password })).status);
ok('14 correct sign-ins in a row are all accepted (successes are not counted)', statuses.every((s) => s === 200), [...new Set(statuses)].join(','));

const ghost = `zz.nobody.${Date.now()}@test.com`;
statuses = [];
for (let i = 0; i < 10; i++) statuses.push((await call('/auth/login', { email: ghost, password: 'wrong-pass-1' })).status);
ok('the first 10 wrong tries are answered normally (not rate limited)', statuses.every((s) => s !== 429), [...new Set(statuses)].join(','));
const blocked = await call('/auth/login', { email: ghost, password: 'wrong-pass-1' });
ok('the 11th wrong try is refused with 429', blocked.status === 429 && blocked.data?.code === 'RATE_LIMITED', `HTTP ${blocked.status}`);
ok('…with a Retry-After header', Number(blocked.headers['retry-after']) > 0, blocked.headers['retry-after']);
ok('…and an English message', /too many attempts/i.test(blocked.data?.message || ''), blocked.data?.message);
const sw = await call('/auth/login', { email: ghost, password: 'wrong-pass-1' }, { 'x-language': 'sw' });
ok('…in Kiswahili when the caller uses Kiswahili', /majaribio mengi/i.test(sw.data?.message || ''), sw.data?.message);
const other = await call('/auth/login', { email: `zz.other.${Date.now()}@test.com`, password: 'wrong-pass-1' });
ok('a different e-mail from the same address is not blocked', other.status !== 429, `HTTP ${other.status}`);
const good = await call('/auth/login', { email, password });
ok('the real account still signs in while another e-mail is blocked', good.status === 200, `HTTP ${good.status}`);

const fp = []; for (let i = 0; i < 11; i++) fp.push((await call('/auth/forgot-password', { email: ghost })).status);
ok('forgot-password: refused after 10 requests for the same e-mail in an hour', fp[10] === 429 && fp.slice(0, 10).every((s) => s !== 429), fp.join(','));

const h = (await axios.get(base.replace(/\/api$/, '') + '/health')).headers;
ok('security headers present: nosniff + frame protection', h['x-content-type-options'] === 'nosniff' && !!h['x-frame-options']);
ok('X-Powered-By is not advertised', h['x-powered-by'] === undefined);
ok('files stay readable cross-origin (images, receipts)', h['cross-origin-resource-policy'] === 'cross-origin', h['cross-origin-resource-policy']);
finish();
