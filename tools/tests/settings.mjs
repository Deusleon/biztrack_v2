// Store settings through the same calls the Configuration / Security / Notifications screens make — and the security policy
// is checked by BEHAVIOUR: wrong passwords really lock the account, an old password really has to be changed.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const require = createRequire(import.meta.url);
const pg = require('../../backend/node_modules/pg'); const bcrypt = require('../../backend/node_modules/bcryptjs');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { settingsAdminService: S, authService } = svc;
const { store } = await signIn();
const original = await S.getAll();
const ops0 = original.storeSettings.operations; const biz0 = original.systemSettings.businessInfo; const sys0 = original.systemSettings.systemDefaults;
const optionsCount = JSON.stringify(original.storeSettings.systemOptions).length + JSON.stringify(original.systemSettings.systemOptions).length;

// ── shape ───────────────────────────────────────────────────────────────────────────────────────
ok('settings: the server describes its own fields (sections, types, options)', original.storeSettings.systemOptions.some((s) => s.id === 'localization') && original.storeSettings.systemOptions.some((s) => s.id === 'operations') && original.systemSettings.systemOptions.some((s) => s.id === 'businessInfo'));
ok('settings: values for every described field exist', original.storeSettings.systemOptions.flatMap((s) => s.fields).every((f) => f.key in ops0 || f.key in (sys0 || {})), original.storeSettings.systemOptions.flatMap((s) => s.fields).filter((f) => !(f.key in ops0) && !(f.key in (sys0 || {}))).map((f) => f.key).join(','));

// ── configuration ───────────────────────────────────────────────────────────────────────────────
const stable = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b))));
const put = (payload) => S.update(store.id, payload);
await put({ operations: { ...ops0, defaultTaxRate: 15, allowDiscount: !ops0.allowDiscount, defaultDecimalPlaces: '0' }, systemDefaults: { ...sys0 } });
let now = (await S.getAll()).storeSettings.operations;
ok('configuration saved: tax 18→15, discount toggled, decimals 0', now.defaultTaxRate === 15 && now.allowDiscount === !ops0.allowDiscount && now.defaultDecimalPlaces === '0');
ok('a save keeps every other setting', Object.keys(ops0).every((k) => k in now), Object.keys(ops0).filter((k) => !(k in now)).join(','));
const sysNow = (await S.getAll()).systemSettings.systemDefaults;
ok("system defaults are not wiped by a save (defaultStore, multiStoreSupport, interStoreTransfer survive)", Object.keys(sys0 || {}).every((k) => k in sysNow));
await put({ operations: { ...ops0 }, systemDefaults: { ...sys0 } });
ok('restoring the original values works', stable((await S.getAll()).storeSettings.operations) === stable(ops0));
// business info (kept only from the primary store)
await put({ operations: { ...ops0 }, systemDefaults: { ...sys0 }, businessInfo: { ...biz0, receiptFooterText: 'Footer by test' } });
ok('business information saved from the primary store', (await S.getAll()).systemSettings.businessInfo.receiptFooterText === 'Footer by test');
await put({ operations: { ...ops0 }, systemDefaults: { ...sys0 }, businessInfo: { ...biz0 } });
ok('business information restored', (await S.getAll()).systemSettings.businessInfo.receiptFooterText === biz0.receiptFooterText);
ok('field definitions untouched by all these saves', JSON.stringify((await S.getAll()).storeSettings.systemOptions).length + JSON.stringify((await S.getAll()).systemSettings.systemOptions).length === optionsCount);

// ── security policy, by behaviour ───────────────────────────────────────────────────────────────
const email = 'zz.cashier@test.com'; const password = 'Cash1234!';
const role = (await pool.query(`SELECT id FROM roles WHERE name = 'Cashier' AND store_id = $1`, [store.id])).rows[0];
let u = (await pool.query(`SELECT id FROM users WHERE email = $1`, [email])).rows[0];
if (!u) u = (await pool.query(`INSERT INTO users (name, email, password, is_verified, status, password_changed_at, preferred_language) VALUES ('ZZ Cashier', $1, $2, true, true, now(), 'en') RETURNING id`, [email, bcrypt.hashSync(password, 10)])).rows[0];
await pool.query(`INSERT INTO store_users (store_id, user_id, role_id, status) SELECT $1, $2, $3, true WHERE NOT EXISTS (SELECT 1 FROM store_users WHERE store_id = $1 AND user_id = $2)`, [store.id, u.id, role.id]);
const reset = () => pool.query(`UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, password_changed_at = now(), password = $2 WHERE id = $1`, [u.id, bcrypt.hashSync(password, 10)]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const security = { sessionTimeout: 30, loginAttempts: 2, passwordExpiry: 90, accountLockMinutes: 1, auditLogging: true, dataEncryption: true };
await put({ operations: { security } });
const savedSec = (await S.getAll()).storeSettings.operations.security;
ok('security policy saved and returned', Object.entries(security).every(([k, v]) => savedSec[k] === v), JSON.stringify(savedSec));
await reset();
const tryLogin = async (pw) => { try { return { ok: true, r: await authService.login({ email, password: pw }) }; } catch (e) { return { ok: false, e }; } };
const w1 = await tryLogin('wrong-1'); const w2 = await tryLogin('wrong-2'); const right = await tryLogin(password);
ok('after 2 wrong passwords (the limit) even the RIGHT password is refused — the account is locked', !w1.ok && !w2.ok && !right.ok, `${w1.e?.status}/${w2.e?.status}/${right.e?.status} ${right.e?.message || ''}`);
await reset();
ok('unlocking (or waiting out the lock time) lets the right password in again', (await tryLogin(password)).ok);
// password expiry
await put({ operations: { security: { ...security, loginAttempts: 5, passwordExpiry: 30 } } });
await pool.query(`UPDATE users SET password_changed_at = now() - interval '45 days' WHERE id = $1`, [u.id]);
const old = await tryLogin(password);
const mustChange = old.ok ? (old.r.password_change_required || old.r.passwordExpired || old.r.password_expired || old.r.expired) : (old.e?.code || old.e?.status);
ok('a password older than the expiry has to be changed', !!mustChange && (old.ok ? true : [428, 403].includes(old.e.status)), JSON.stringify(old.ok ? Object.keys(old.r) : { status: old.e.status, code: old.e.code, message: old.e.message }));
await reset();
await put({ operations: { security: { sessionTimeout: 30, loginAttempts: 5, passwordExpiry: 90, accountLockMinutes: 15, auditLogging: true, dataEncryption: true } } });
// values are kept inside their limits
await put({ operations: { security: { sessionTimeout: 99999, loginAttempts: 0, passwordExpiry: 9999, accountLockMinutes: -4 } } });
const clamped = (await authService.switchStore(store.id)); ok('switching store still works with out-of-range security values (they are clamped)', !!clamped.token);
await put({ operations: { security: { sessionTimeout: 30, loginAttempts: 5, passwordExpiry: 90, accountLockMinutes: 15, auditLogging: true, dataEncryption: true } } });

// ── unlocking the idle screen = verifying the person's password again ──────────────────────────
await reset();
const keep = localStorage.getItem('accessToken');
const cl = await authService.login({ email, password }); localStorage.setItem('accessToken', cl.token);
const good = await authService.verifyPassword({ password }).then((r) => r, (e) => ({ failed: e }));
ok('the right password unlocks (verify-password)', !good.failed, good.failed?.message);
const badPw = await authService.verifyPassword({ password: 'not-my-password' }).then(() => null, (e) => e);
ok('a wrong password does not unlock', !!badPw && [400, 401, 403].includes(badPw.status), `HTTP ${badPw?.status}`);
const none = await authService.verifyPassword({ password: '' }).then(() => null, (e) => e);
ok('an empty password does not unlock', !!none && none.status >= 400, `HTTP ${none?.status}`);
localStorage.setItem('accessToken', keep);
await reset();

// ── notifications ───────────────────────────────────────────────────────────────────────────────
const n0 = await S.getNotifications();
ok('notification settings: in-app / email / sms switches per event', ['inapp_low_stock', 'email_new_sale', 'sms_payment_due'].every((k) => k in n0));
await S.updateNotifications({ ...n0, email_new_sale: !n0.email_new_sale, sms_low_stock: true });
const n1 = await S.getNotifications(); ok('notification change saved', n1.email_new_sale === !n0.email_new_sale && n1.sms_low_stock === true);
await S.updateNotifications(n0); ok('notification settings restored', stable(await S.getNotifications()) === stable(n0));
try { await S.updateNotifications('nonsense'); ok('invalid notification settings refused', false); } catch (e) { ok('invalid notification settings refused', e.status === 400, e.message); }
const tr = await S.testRunNotifications(false); ok('notification test run answers', tr.success !== false, tr.message);
ok('branding assets list answers', typeof (await S.getBranding()) === 'object');

await pool.query(`UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, password_changed_at = now() WHERE id = $1`, [u.id]);
await pool.end(); finish();
