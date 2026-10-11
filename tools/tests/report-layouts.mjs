// Every report's LAYOUT (frontend/src/pages/reports/layouts.js) must match what the server really sends:
// each column named in a layout exists in the rows, each totalled column is numeric, and every chart column exists.
// Reports with no rows in the test data are listed as "no rows" (nothing to compare) — they are not failures.
import { ok, svc, signIn, finish } from './harness.mjs';
import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', '..', 'frontend', 'src', 'pages', 'reports');
const { REPORT_GROUPS, FILTER_OPTIONS } = await import(pathToFileURL(path.join(dir, 'catalog.js')).href);
const { REPORT_LAYOUTS } = await import(pathToFileURL(path.join(dir, 'layouts.js')).href);
await signIn();
const iso = (d) => d.toISOString().slice(0, 10);
const params = { startDate: iso(new Date(Date.now() - 400 * 864e5)), endDate: iso(new Date()) };
let checked = 0, empty = [];
for (const [g, grp] of Object.entries(REPORT_GROUPS)) for (const r of grp.reports) {
  const id = `${g}.${r.id}`; const lay = REPORT_LAYOUTS[id];
  const p = { ...(r.dates ? params : {}) };
  for (const f of r.filters) { const o = FILTER_OPTIONS[f]; if (o?.default) p[o.param || f] = o.default; }
  let res; try { res = await svc.reportService.get(r.path, p); } catch (e) { ok(`${id}: endpoint answers`, false, e.message); continue; }
  const rows = res.data || [];
  if (!rows.length) { empty.push(id); continue; }
  const keys = new Set(rows.flatMap((x) => Object.keys(x)));
  if (lay) {
    const missing = lay.cols.filter((k) => !keys.has(k));
    ok(`${id}: every layout column exists in the data`, missing.length === 0, missing.join(', '));
    const bad = (lay.foot || []).filter((k) => !rows.some((x) => Number.isFinite(Number(x[k]))));
    ok(`${id}: every totalled column is numeric`, bad.length === 0, bad.join(', '));
  }
  if (r.chart) { const miss = [r.chart.x, ...r.chart.ys].filter((k) => !keys.has(k)); ok(`${id}: chart columns exist`, miss.length === 0, miss.join(', ')); }
  checked++;
}
console.log(`\n${checked} reports compared with real data; no rows in the test data for: ${empty.join(', ') || '—'}`);
finish();
