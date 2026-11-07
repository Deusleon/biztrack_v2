// FILE PATH: backend/src/utils/verifyUpgrade.js
/**
 * Checks that an upgrade lost nothing: compares the live database with a backup taken before it.
 *
 *   npm run db:verify                          # against the newest "before-migration" backup (or, if none, the newest backup)
 *   npm run db:verify -- backups/some-file.sql.gz
 *
 * For every table in the backup it reports whether the rows are identical (same count and same content checksum),
 * whether rows were added since (normal — people keep using the app), or whether rows are MISSING (a real problem;
 * the command then exits with an error). It also lists the migration status.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';
import sequelize from '../config/database.js';
import { backupDir } from '../services/backup/backupService.js';
import { status } from './migrate.js';

const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
const HASH = `COALESCE(SUM(((('x' || substr(md5(t::text), 1, 15))::bit(60))::bigint)::numeric), 0)::text`;

const readManifest = async (file) => {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let manifest = null;
  for await (const line of rl) if (line.startsWith('-- BIZTRACK-MANIFEST ')) manifest = JSON.parse(line.slice('-- BIZTRACK-MANIFEST '.length));
  if (!manifest) throw new Error('This file has no closing summary — it is not a complete BizTrack backup.');
  return manifest;
};

const newestBefore = () => {
  const dir = backupDir();
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.sql.gz')).sort();     // names start with a timestamp → last = newest
  const before = all.filter((f) => f.includes('before-migration'));
  const pick = before.length ? before : all;                                       // prefer the pre-upgrade backup, else the newest of any kind
  return pick.length ? path.join(dir, pick[pick.length - 1]) : null;
};

const main = async () => {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : newestBefore();
  if (!file || !fs.existsSync(file)) { console.error('No backup file given and no backup found in the backup folder (run: npm run db:backup).'); process.exit(2); }
  console.log(`Backup: ${file}`);
  const manifest = await readManifest(file);
  console.log(`  taken ${manifest.created_at}, ${manifest.table_count} tables, ${manifest.total_rows} rows\n`);

  const [live] = await sequelize.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`);
  const liveNames = new Set(live.map((r) => r.name));

  let identical = 0, grown = 0, changed = 0, missing = 0;
  const lines = [];
  for (const [name, want] of Object.entries(manifest.tables)) {
    if (!liveNames.has(name)) { missing++; lines.push(`  ✗ ${name}: TABLE IS GONE (had ${want.rows} rows)`); continue; }
    const [[got]] = await sequelize.query(`SELECT count(*)::text AS n, ${HASH} AS h FROM ${q(name)} t`);
    const rows = Number(got.n);
    if (rows < want.rows) { missing++; lines.push(`  ✗ ${name}: ${want.rows - rows} ROW(S) MISSING (${want.rows} → ${rows})`); }
    else if (rows > want.rows) { grown++; lines.push(`  + ${name}: ${rows - want.rows} new row(s) since the backup`); }
    else if (got.h !== want.hash) { changed++; lines.push(`  ~ ${name}: same ${rows} rows, but some content or columns changed`); }
    else identical++;
  }
  console.log(lines.join('\n') || '  (every table identical)');
  console.log(`\n${identical} table(s) identical · ${grown} with new rows · ${changed} with edited content · ${missing} with LOST data`);
  const newTables = [...liveNames].filter((n) => !(n in manifest.tables) && n !== 'SequelizeMeta');
  if (newTables.length) console.log(`New tables since the backup: ${newTables.join(', ')}`);
  console.log('');
  await status();
  await sequelize.close();
  if (missing) { console.error('\n❌ DATA IS MISSING compared with the backup. Do not carry on: restore the backup (npm run db:restore -- <file> --yes).'); process.exit(1); }
  console.log('\n✅ Nothing from the backup is missing.');
};

main().catch((e) => { console.error(e.message || e); process.exit(2); });
