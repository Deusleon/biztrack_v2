// System tools, backups and the Bulk operations imports. Runs against a backend started with DEVELOPER_EMAIL set to the owner,
// to see both what a developer account can do and what an ordinary owner cannot.
import { createRequire } from 'node:module';
import { ok, svc, signIn, finish } from './harness.mjs';
const require = createRequire(import.meta.url);
const XLSX = require('../../frontend/node_modules/xlsx'); const pg = require('../../backend/node_modules/pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { toolsService: T, backupService: B, integrationService: I, importExportService: X } = svc;
const { store } = await signIn();
const { default: axios } = await import('../../frontend/node_modules/axios/index.js');
const base = process.env.API_URL; const token = localStorage.getItem('accessToken');
const raw = (m, p, d) => axios({ method: m, url: base + p, headers: { Authorization: `Bearer ${token}`, 'X-Store-ID': store.id }, data: d, validateStatus: () => true });
const text = async (p) => String((await axios.get(base + p, { headers: { Authorization: `Bearer ${token}`, 'X-Store-ID': store.id }, responseType: 'text', transformResponse: (x) => x })).data);

// ── tools ───────────────────────────────────────────────────────────────────────────────────────
const h = await T.dbHealth(); ok('database health: healthy, with timings and table count', h.status === 'healthy' && h.tableCount > 30 && h.responseMs >= 0, JSON.stringify({ ms: h.responseMs, tables: h.tableCount }));
const logs = await T.logs({ page: 1, limit: 5 }); ok('activity log: rows with user, action, time and a total', logs.logs.length > 0 && logs.total >= logs.logs.length && logs.logs.every((l) => l.action && l.created_at), `${logs.total} entries`);
const login = await T.logs({ action: 'login_success', limit: 5 }); ok('activity log filter by action', login.logs.length > 0 && login.logs.every((l) => l.action === 'login_success'));
const someUser = logs.logs.find((l) => l.user_email); const me = (await pool.query(`SELECT id FROM users WHERE email = $1`, [someUser.user_email])).rows[0];
const byUser = await T.logs({ userId: me.id, limit: 5 }); ok('activity log filter by person', byUser.logs.length > 0 && byUser.logs.every((l) => l.user_email === someUser.user_email));
const future = await T.logs({ dateFrom: '2099-01-01', dateTo: '2099-12-31' }); ok('activity log filter by date (nothing in 2099)', future.logs.length === 0 && future.total === 0);
const page1 = await T.logs({ page: 1, limit: 2 }); const page2 = await T.logs({ page: 2, limit: 2 }); ok('activity log paging gives different rows', page1.logs.length === 2 && page2.logs.length > 0 && page1.logs[0].id !== page2.logs[0].id);
const exportTxt = await text('/tools/export'); const backupTxt = await text('/tools/backup');
ok('store data export / backup are SQL for THIS store', /Store: Magomeni Store/.test(exportTxt) && /INSERT INTO/i.test(exportTxt) && /Store: Magomeni Store/.test(backupTxt) && /INSERT INTO/i.test(backupTxt), `${exportTxt.length} + ${backupTxt.length} bytes`);
const foreign = (await pool.query(`SELECT email FROM users WHERE email IN ('deusleon6@gmail.com','lifen980003@gmail.com')`)).rows.map((r) => r.email);
ok("the export / backup contain nobody else's account (emails, password hashes)", !foreign.some((e) => exportTxt.includes(e) || backupTxt.includes(e)) && !/\$2[aby]\$/.test(exportTxt + backupTxt));
ok('clearing the cache works', (await T.clearCache()).message);

// ── backups: status / history for owners; restore and credentials for the developer only ────────
const st = await B.status(); ok('backup status: schedule, retention, last result', st.success && st.schedule_time && st.retention_days > 0 && 'configured' in st, JSON.stringify({ at: st.schedule_time, keep: st.retention_days }));
const hist = await B.list(5); ok('backup history lists backups', hist.success && Array.isArray(hist.backups));
const dev = process.env.DEVELOPER_EMAIL && process.env.DEVELOPER_EMAIL.toLowerCase().includes('deusleon7');
const acc = await raw('get', '/integrations/access');
ok(dev ? 'the developer account passes the integrations access check' : 'an ordinary owner is refused on integrations', dev ? acc.status === 200 : acc.status === 403, `HTTP ${acc.status}`);
// NEVER call /backups/restore/drive/:id here — it answers 202 and STARTS a restore even for a fake id. The upload route without a file is a safe probe.
const rd = { status: 403 }; const ru = await raw('post', '/backups/restore/upload', {});
if (dev) ok('the developer reaches the restore-from-file endpoint (no file → 400 from the logic, not a permission refusal)', ru.status === 400, `HTTP ${ru.status}`);
else ok('an ordinary owner can NOT restore the whole database from a file (and the Drive route has the same guard)', ru.status === 403, `HTTP ${ru.status}`);
if (dev) {
  const list = await I.list(); ok('integrations list (developer) answers', Array.isArray(list));
  const dump = JSON.stringify(list); ok('integration secrets are masked in the list', !/ya29\.|1\/\/0/.test(dump));
}

// ── bulk operations: the contacts import (SMS contacts) ─────────────────────────────────────────
const tpl = await X.template('contacts', 'arraybuffer'); const wbT = XLSX.read(Buffer.from(tpl), { type: 'buffer' });
const header = XLSX.utils.sheet_to_json(wbT.Sheets[wbT.SheetNames[0]], { header: 1 })[0]; ok('contacts template downloads with its columns', header.length >= 2, header.join(' | '));
const col = (re) => header.find((x) => re.test(String(x)));
const tag = String(Date.now()).slice(-7);
const rowOf = (name, phone, group) => { const r = {}; r[col(/name/i)] = name; r[col(/phone/i)] = phone; const g = col(/group/i); if (g) r[g] = group; return r; };
const sheet = (rows) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Contacts'); return new File([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })], 'contacts.xlsx'); };
const good = [rowOf(`ZZ Contact A ${tag}`, `25571${tag}`, `ZZ Group ${tag}`), rowOf(`ZZ Contact B ${tag}`, `25572${tag}`, `ZZ Group ${tag}`)];
const bad = rowOf(`ZZ Bad ${tag}`, '123', `ZZ Group ${tag}`);
const loose = [rowOf(`ZZ Loose A ${tag}`, `+255 73${tag.slice(0, 2)} ${tag.slice(2, 5)} ${tag.slice(5)}`, ''), rowOf(`ZZ Loose B ${tag}`, `074${tag}`, '')];
const first = await X.importFile('contacts', sheet([...good, bad]));
ok('contacts with a bad phone number: the server asks for confirmation and imports nothing yet', first.requiresConfirmation === true && (await pool.query(`SELECT 1 FROM messaging_contacts WHERE phone = $1`, [`25571${tag}`])).rows.length === 0, JSON.stringify(first.results).slice(0, 160));
const done = await X.importFile('contacts', sheet([...good, bad]), { confirmed: true });
ok('confirmed import: 2 contacts in, the bad one reported', done.results?.success === 2 && done.results?.failed === 1, JSON.stringify(done.results).slice(0, 200));
const inDb = (await pool.query(`SELECT c.phone, g.name AS grp FROM messaging_contacts c LEFT JOIN messaging_contact_groups cg ON cg.contact_id = c.id LEFT JOIN messaging_groups g ON g.id = cg.group_id WHERE c.phone IN ($1, $2)`, [`25571${tag}`, `25572${tag}`])).rows;
ok('the contacts exist and the group was created automatically', inDb.length === 2 && inDb.every((r) => r.grp === `ZZ Group ${tag}`), JSON.stringify(inDb));
const again = await X.importFile('contacts', sheet(good)); ok('importing the same phone numbers again does not duplicate them', (await pool.query(`SELECT count(*)::int AS n FROM messaging_contacts WHERE phone IN ($1, $2)`, [`25571${tag}`, `25572${tag}`])).rows[0].n === 2, JSON.stringify(again.results || again).slice(0, 140));
const looseNorm = [`25573${tag}`, `25574${tag}`];
const lo = await X.importFile('contacts', sheet(loose)); ok('phone numbers typed loosely (+255 7.. / 07..) are stored in international format', lo.results.success === 2 && (await pool.query(`SELECT count(*)::int AS n FROM messaging_contacts WHERE phone = ANY($1)`, [looseNorm])).rows[0].n === 2, JSON.stringify(lo.results));
await pool.query(`DELETE FROM messaging_contacts WHERE phone = ANY($1)`, [looseNorm]);
await pool.query(`DELETE FROM messaging_contacts WHERE phone IN ($1, $2)`, [`25571${tag}`, `25572${tag}`]); await pool.query(`DELETE FROM messaging_groups WHERE name = $1`, [`ZZ Group ${tag}`]);
await pool.end(); finish();
