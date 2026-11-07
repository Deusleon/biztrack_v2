// FILE PATH: backend/src/services/backup/dumpEngine.js
/**
 * dumpEngine.js — a FULL logical backup of the whole database, with no external tools.
 *
 * Why not pg_dump: on shared hosting (cPanel) the pg_dump program is often missing or not on the
 * app's PATH. This engine needs nothing but the `pg` driver the app already uses.
 *
 * "Full" means EVERY table in the database, found by asking Postgres itself (not a list of models),
 * so a table added next year is included automatically. The dump holds:
 *   enum types → sequences → tables → ALL rows → primary/unique/check constraints → indexes →
 *   foreign keys → sequence positions.
 *
 * Everything is read inside ONE repeatable-read snapshot, so the file is consistent even while
 * people are using the app.
 *
 * File format: plain SQL, gzip-compressed, ONE STATEMENT PER LINE (string values use E'…' escapes so no
 * statement ever spans lines). That makes it restorable by this app's tool line by line, and still
 * readable / runnable with psql if ever needed. Lines starting with "--" are comments; the last line
 * is "-- BIZTRACK-MANIFEST {json}" with the table list, row counts and content checksums — a file
 * without it was cut short and is rejected.
 *
 * Restore test (verifyBackupFile): replays the real file into a scratch schema inside a transaction
 * that is ALWAYS rolled back, then compares every table's row count and content checksum with the
 * snapshot. Nothing is left behind and live data is never touched.
 */
import fs from 'fs';
import zlib from 'zlib';
import readline from 'readline';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import pg from 'pg';
import sequelize from '../../config/database.js';

export const FORMAT_VERSION = 1;
const SCRATCH_SCHEMA = 'biztrack_restore_test';
const BATCH_ROWS = 500;
const FETCH_ROWS = 1000;

/** SQL: this catalog object belongs to an installed extension (PostGIS's own tables, types and functions) — never ours to back up. */
const NOT_EXTENSION = (alias) => `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = ${alias}.oid AND d.deptype = 'e')`;

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** A value as a single-line SQL literal. Untyped, so Postgres reads it as the column's own type. */
export const literal = (v) => {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v)
    .replace(/\\/g, '\\\\').replace(/'/g, "''")
    .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return `E'${s}'`;
};

export const newClient = async () => {
  const c = sequelize.config;
  const client = new pg.Client({
    host: c.host, port: c.port, user: c.username, password: c.password, database: c.database,
    application_name: 'biztrack-backup',
    ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await client.connect();
  await client.query('SET statement_timeout = 0');
  return client;
};

const ROW_HASH = (alias = 't') =>
  `COALESCE(SUM(((('x' || substr(md5(${alias}::text), 1, 15))::bit(60))::bigint)::numeric), 0)::text`;

/** Row count + order-independent content checksum of one table, as the given client sees it. */
const fingerprint = async (client, table) => {
  const { rows } = await client.query(`SELECT count(*)::text AS n, ${ROW_HASH('t')} AS h FROM ${q(table)} t`);
  return { rows: Number(rows[0].n), hash: rows[0].h };
};

// ───────────────────────────── reading the catalog ─────────────────────────────

const catalog = async (client) => {
  const tables = (await client.query(`
    SELECT c.oid, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relname`)).rows;

  const unsupported = [];
  for (const t of tables) if (t.relkind !== 'r' && t.relkind !== 'v') unsupported.push(`${{ p: 'partitioned table', v: 'view', m: 'materialized view', f: 'foreign table' }[t.relkind]} "${t.relname}"`);

  // Functions, triggers and views ARE backed up (BizTrack keeps its updated_at triggers and a profit view in the database).
  const routines = (await client.query(`
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    ORDER BY p.proname`)).rows;
  const triggers = (await client.query(`
    SELECT t.tgname, c.relname AS tbl, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relkind = 'r' ORDER BY c.relname, t.tgname`)).rows;
  const views = (await client.query(`
    SELECT v.viewname, v.definition FROM pg_views v JOIN pg_class c ON c.relname = v.viewname AND c.relnamespace = 'public'::regnamespace
    WHERE v.schemaname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
    ORDER BY v.viewname`)).rows;
  const otherSchemas = (await client.query(`
    SELECT DISTINCT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname NOT IN ('public','pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname <> '${SCRATCH_SCHEMA}'`)).rows;
  otherSchemas.forEach((s) => unsupported.push(`tables in schema "${s.nspname}"`));

  const baseTables = tables.filter((t) => t.relkind === 'r');

  const enums = (await client.query(`
    SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND ${NOT_EXTENSION('t')} GROUP BY t.typname ORDER BY t.typname`)).rows;

  // Only extensions the app's own tables truly depend on (a column type or a default such as uuid_generate_v4()).
  // An extension merely installed in the database (PostGIS, say) is not part of this app and may not be creatable on a
  // shared host, so it must never be required to restore.
  const oids = baseTables.map((t) => t.oid);
  const extensions = oids.length === 0 ? [] : (await client.query(`
    SELECT DISTINCT e.extname FROM (
      SELECT t.oid AS obj, 'pg_type'::regclass AS cls FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid
        WHERE a.attrelid = ANY($1::oid[]) AND a.attnum > 0 AND NOT a.attisdropped
      UNION
      SELECT p.oid, 'pg_proc'::regclass FROM pg_attrdef ad
        JOIN pg_depend dd ON dd.classid = 'pg_attrdef'::regclass AND dd.objid = ad.oid AND dd.refclassid = 'pg_proc'::regclass
        JOIN pg_proc p ON p.oid = dd.refobjid WHERE ad.adrelid = ANY($1::oid[])
    ) x
    JOIN pg_depend d ON d.objid = x.obj AND d.classid = x.cls AND d.deptype = 'e' AND d.refclassid = 'pg_extension'::regclass
    JOIN pg_extension e ON e.oid = d.refobjid
    WHERE e.extname <> 'plpgsql' ORDER BY 1`, [oids])).rows.map((r) => r.extname);

  const sequences = (await client.query(`
    SELECT s.sequencename, s.start_value, s.min_value, s.max_value, s.increment_by, s.cycle, s.cache_size, s.last_value,
           (SELECT 1 FROM pg_depend d JOIN pg_class sc ON sc.oid = d.objid
              WHERE sc.relname = s.sequencename AND sc.relkind = 'S' AND d.deptype = 'i' LIMIT 1) AS is_identity
    FROM pg_sequences s
    WHERE s.schemaname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_class xc JOIN pg_depend xd ON xd.objid = xc.oid AND xd.deptype = 'e'
                      WHERE xc.relname = s.sequencename AND xc.relkind = 'S' AND xc.relnamespace = 'public'::regnamespace)
    ORDER BY s.sequencename`)).rows;

  return { baseTables, unsupported, enums, extensions, sequences, routines, triggers, views };
};

const columnsOf = async (client, oid) => (await client.query(`
  SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS notnull,
         pg_get_expr(d.adbin, d.adrelid) AS def, a.attidentity AS identity, a.attgenerated AS generated
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`, [oid])).rows;

const constraintsOf = async (client, names) => (await client.query(`
  SELECT c.conname, c.contype, cl.relname AS tbl, pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
  WHERE n.nspname = 'public' AND cl.relname = ANY($1::text[]) ORDER BY cl.relname, c.conname`, [names])).rows;

const indexesOf = async (client, names) => (await client.query(`
  SELECT i.indexname, i.tablename, i.indexdef FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.tablename = ANY($1::text[])
    AND NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class ic ON ic.oid = c.conindid
                    WHERE ic.relname = i.indexname AND c.contype IN ('p','u','x'))
  ORDER BY i.tablename, i.indexname`, [names])).rows;

// ───────────────────────────── the dump ─────────────────────────────

/**
 * Writes a full backup to `filePath` (a .sql.gz). Returns { manifest, bytes, sha256 }.
 * Never leaves a half-written file at filePath: it writes to a temp name and renames at the end.
 */
export const createDump = async (filePath, { label = 'backup' } = {}) => {
  const client = await newClient();
  const tmp = `${filePath}.partial`;
  const gz = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(tmp);
  const done = pipeline(gz, out);
  const write = (line) => (gz.write(`${line}\n`) ? Promise.resolve() : new Promise((r) => gz.once('drain', r)));

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL search_path TO public");
    const cat = await catalog(client);
    const started = new Date();
    const ver = (await client.query('SHOW server_version')).rows[0].server_version;

    await write(`-- BizTrack full database backup (format ${FORMAT_VERSION})`);
    await write(`-- Created: ${started.toISOString()}   Reason: ${String(label).replace(/\s+/g, ' ')}`);
    await write(`-- Source: PostgreSQL ${ver}, database "${sequelize.config.database}"`);
    await write('SET standard_conforming_strings = on;');
    await write('SET client_min_messages = warning;');

    for (const e of cat.extensions) await write(`CREATE EXTENSION IF NOT EXISTS ${q(e)};`);
    for (const e of cat.enums) await write(`CREATE TYPE ${q(e.typname)} AS ENUM (${e.labels.map(literal).join(', ')});`);
    for (const s of cat.sequences.filter((x) => !x.is_identity)) {
      await write(`CREATE SEQUENCE ${q(s.sequencename)} INCREMENT BY ${s.increment_by} MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START WITH ${s.start_value} CACHE ${s.cache_size}${s.cycle ? ' CYCLE' : ' NO CYCLE'};`);
    }

    const tableInfo = [];
    for (const t of cat.baseTables) {
      const cols = await columnsOf(client, t.oid);
      const parts = cols.map((c) => {
        let s = `${q(c.name)} ${c.type}`;
        if (c.generated === 's') s += ` GENERATED ALWAYS AS (${c.def}) STORED`;
        else if (c.identity) s += ' GENERATED BY DEFAULT AS IDENTITY';
        else if (c.def !== null) s += ` DEFAULT ${c.def}`;
        if (c.notnull) s += ' NOT NULL';
        return s;
      });
      await write(`CREATE TABLE ${q(t.relname)} (${parts.join(', ')});`);
      tableInfo.push({ name: t.relname, cols: cols.filter((c) => c.generated !== 's').map((c) => c.name) });
    }

    // Fingerprints and rows come from the same snapshot, so they always agree.
    const manifest = { format: FORMAT_VERSION, created_at: started.toISOString(), source_version: ver, database: sequelize.config.database, tables: {}, warnings: cat.unsupported };
    let totalRows = 0;
    for (const t of tableInfo) {
      manifest.tables[t.name] = await fingerprint(client, t.name);
      totalRows += manifest.tables[t.name].rows;
      if (manifest.tables[t.name].rows === 0 || t.cols.length === 0) continue;

      const colList = t.cols.map(q).join(', ');
      const selectList = t.cols.map((c) => `${q(c)}::text`).join(', ');
      const cursor = `bk_${crypto.randomBytes(4).toString('hex')}`;
      await client.query(`DECLARE ${cursor} NO SCROLL CURSOR FOR SELECT ${selectList} FROM ${q(t.name)}`);
      try {
        for (;;) {
          const { rows } = await client.query({ text: `FETCH ${FETCH_ROWS} FROM ${cursor}`, rowMode: 'array' });
          if (rows.length === 0) break;
          for (let i = 0; i < rows.length; i += BATCH_ROWS) {
            const chunk = rows.slice(i, i + BATCH_ROWS).map((r) => `(${r.map(literal).join(',')})`).join(',');
            await write(`INSERT INTO ${q(t.name)} (${colList}) VALUES ${chunk};`);
          }
        }
      } finally { await client.query(`CLOSE ${cursor}`); }
    }

    const names = cat.baseTables.map((t) => t.relname);
    const cons = await constraintsOf(client, names);
    const order = { p: 0, u: 1, x: 2, c: 3, f: 9 };
    for (const c of cons.filter((x) => x.contype !== 'f').sort((a, b) => (order[a.contype] ?? 5) - (order[b.contype] ?? 5))) {
      await write(`ALTER TABLE ${q(c.tbl)} ADD CONSTRAINT ${q(c.conname)} ${c.def.replace(/\s*\n\s*/g, ' ')};`);
    }
    for (const i of await indexesOf(client, names)) {
      // Postgres writes "ON public.table"; drop the schema so the file works in any schema (and the restore test stays in its scratch one).
      await write(`${i.indexdef.replace(/\s*\n\s*/g, ' ').replace(/ ON (ONLY )?public\./, ' ON $1')};`);
    }
    for (const c of cons.filter((x) => x.contype === 'f')) {
      await write(`ALTER TABLE ${q(c.tbl)} ADD CONSTRAINT ${q(c.conname)} ${c.def.replace(/\s*\n\s*/g, ' ')};`);
    }
    for (const s of cat.sequences) {
      if (s.last_value === null) await write(`SELECT setval(${literal(q(s.sequencename))}, ${s.start_value}, false);`);
      else await write(`SELECT setval(${literal(q(s.sequencename))}, ${s.last_value}, true);`);
    }

    // Functions, triggers and views last (after the data, so no trigger can fire while rows are loaded). Each is written as
    // ONE line (base64) because a function body spans many lines; the file stays "one statement per line".
    const unqualified = (sql) => sql.replace(/\bpublic\./g, '');
    const stmt = (sql) => write(`-- B64 ${Buffer.from(unqualified(sql), 'utf8').toString('base64')}`);
    for (const f of cat.routines) await stmt(f.def);
    for (const t of cat.triggers) await stmt(t.def);
    for (const v of cat.views) await stmt(`CREATE VIEW ${q(v.viewname)} AS ${v.definition.trim().replace(/;$/, '')}`);
    manifest.objects = { functions: cat.routines.length, triggers: cat.triggers.length, views: cat.views.length };

    manifest.total_rows = totalRows;
    manifest.table_count = tableInfo.length;
    manifest.finished_at = new Date().toISOString();
    await client.query('COMMIT');
    await write(`-- BIZTRACK-MANIFEST ${JSON.stringify(manifest)}`);
    gz.end();
    await done;
    fs.renameSync(tmp, filePath);

    const sha256 = await hashFile(filePath);
    return { manifest, bytes: fs.statSync(filePath).size, sha256 };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection may be gone */ }
    gz.destroy(); out.destroy();
    try { fs.unlinkSync(tmp); } catch { /* nothing written */ }
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
};

export const hashFile = (filePath) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(filePath).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
});

// ───────────────────────────── reading a backup back ─────────────────────────────

/**
 * Every statement that changes a table must be about a table THIS FILE creates. Without this, a line naming some other
 * table would silently act on the live one (the restore test shares the database with the live data).
 */
const unq = (v) => String(v).replace(/""/g, '"');
const TABLE_REFS = [
  /^ALTER TABLE (?:ONLY )?"((?:[^"]|"")+)"/,
  /^INSERT INTO "((?:[^"]|"")+)"/,
  /^CREATE (?:CONSTRAINT )?TRIGGER [\s\S]*? ON (?:"((?:[^"]|"")+)"|([A-Za-z0-9_$]+))/,
  /^CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?\S+ ON (?:ONLY )?(?:"((?:[^"]|"")+)"|([A-Za-z0-9_$]+))/,
];
const guardStatement = (stmt, created) => {
  if (!stmt.startsWith('INSERT INTO') && /\bpublic\./i.test(stmt)) throw new Error(`Refusing to run a statement that names the live schema: ${stmt.slice(0, 120)}`);
  const made = /^CREATE TABLE "((?:[^"]|"")+)"/.exec(stmt);
  if (made) { created.add(unq(made[1])); return; }
  for (const re of TABLE_REFS) {
    const m = re.exec(stmt);
    const name = m && (m[1] ?? m[2]);
    if (name && !created.has(unq(name))) throw new Error(`The backup file changes the table "${unq(name)}" but never creates it. Refusing to run it.`);
  }
};

/** Calls onStatement(line) for each SQL statement, and returns the manifest found on the last line. */
const readBackup = async (filePath, onStatement) => {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let manifest = null;
  let first = true;
  for await (const raw of rl) {
    const line = raw.trim();
    if (!line) continue;
    if (first) {
      first = false;
      if (!/^-- (BizTrack|EduTrack) full database backup/.test(line)) throw new Error('This is not a BizTrack backup file.');
    }
    if (line.startsWith('-- BIZTRACK-MANIFEST ')) { manifest = JSON.parse(line.slice('-- BIZTRACK-MANIFEST '.length)); continue; }
    if (line.startsWith('-- B64 ')) { await onStatement(Buffer.from(line.slice(7), 'base64').toString('utf8')); continue; }
    if (line.startsWith('--')) continue;
    await onStatement(line);
  }
  if (!manifest) throw new Error('The backup file is incomplete (its closing summary is missing). It was probably cut short.');
  return manifest;
};

const compare = async (client, manifest, schemaLabel) => {
  const problems = [];
  const { rows: present } = await client.query(
    `SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${literal(schemaLabel)} AND c.relkind = 'r'`);
  const have = new Set(present.map((r) => r.relname));
  const expected = Object.keys(manifest.tables);
  const missing = expected.filter((t) => !have.has(t));
  if (missing.length) problems.push(`Tables missing after restore: ${missing.join(', ')}`);
  if (manifest.objects) {
    const lbl = literal(schemaLabel);
    const one = async (sql) => (await client.query(sql)).rows[0].n;
    const f = await one(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = ${lbl} AND p.prokind = 'f'`);
    const tr = await one(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${lbl} AND NOT t.tgisinternal`);
    const v = await one(`SELECT count(*)::int AS n FROM pg_views WHERE schemaname = ${lbl}`);
    if (f < manifest.objects.functions) problems.push(`Functions: ${manifest.objects.functions} expected, ${f} restored`);
    if (tr < manifest.objects.triggers) problems.push(`Triggers: ${manifest.objects.triggers} expected, ${tr} restored`);
    if (v < manifest.objects.views) problems.push(`Views: ${manifest.objects.views} expected, ${v} restored`);
  }
  const perTable = {};
  for (const t of expected.filter((x) => have.has(x))) {
    const got = await (async () => {
      const { rows } = await client.query(`SELECT count(*)::text AS n, ${ROW_HASH('t')} AS h FROM ${q(schemaLabel)}.${q(t)} t`);
      return { rows: Number(rows[0].n), hash: rows[0].h };
    })();
    const want = manifest.tables[t];
    const ok = got.rows === want.rows && got.hash === want.hash;
    perTable[t] = { expected_rows: want.rows, restored_rows: got.rows, ok };
    if (!ok) problems.push(`"${t}": ${want.rows} rows expected, ${got.rows} restored${got.rows === want.rows ? ' (contents differ)' : ''}`);
  }
  return { problems, perTable };
};

/**
 * THE RESTORE TEST. Replays the backup file into a scratch schema inside a transaction that is always
 * rolled back, and checks every table. Returns { ok, tables, rows, problems, perTable, seconds }.
 * Live data is never touched and nothing is left behind.
 */
export const verifyBackupFile = async (filePath, { expectedSha256 = null } = {}) => {
  const t0 = Date.now();
  const result = { ok: false, tables: 0, rows: 0, problems: [], perTable: {}, seconds: 0 };
  try {
    if (!fs.existsSync(filePath)) throw new Error('The backup file is missing from the server.');
    if (expectedSha256 && (await hashFile(filePath)) !== expectedSha256) throw new Error('The backup file has changed since it was made (checksum mismatch).');
  } catch (e) { result.problems.push(e.message); result.seconds = (Date.now() - t0) / 1000; return result; }

  const client = await newClient();
  try {
    await client.query('BEGIN');
    await client.query(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SCRATCH_SCHEMA}`);
    // Scratch first so every table lands there; public stays on the path only so extension functions resolve.
    await client.query(`SET LOCAL search_path TO ${SCRATCH_SCHEMA}, public`);
    const created = new Set();
    const manifest = await readBackup(filePath, (stmt) => { guardStatement(stmt, created); return client.query(stmt); });
    const { problems, perTable } = await compare(client, manifest, SCRATCH_SCHEMA);
    result.problems = problems; result.perTable = perTable;
    result.tables = manifest.table_count; result.rows = manifest.total_rows;
    result.ok = problems.length === 0;
    if (manifest.warnings?.length) result.warnings = manifest.warnings;
  } catch (err) {
    result.problems.push(`Restore test failed: ${err.message}`);
  } finally {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    await client.end().catch(() => {});
  }
  result.seconds = Math.round((Date.now() - t0) / 100) / 10;
  return result;
};

/**
 * Removes the app's own tables, sequences and enum types so a backup can be restored over them. It deliberately does NOT
 * drop the whole schema: that would also destroy extensions living in it (PostGIS and its spatial_ref_sys table, for one)
 * and the schema's permissions. If the database holds other objects of its own (views, functions, triggers) that a backup
 * does not cover, it refuses rather than lose them. All inside the caller's transaction, so a failure changes nothing.
 */
const wipeAppObjects = async (client) => {
  const cat = await catalog(client);
  if (cat.unsupported.length) {
    throw new Error(`This database holds objects a backup does not cover (${cat.unsupported.slice(0, 5).join(', ')}), so replacing everything could lose them. Restore into an empty database instead.`);
  }
  for (const v of cat.views) await client.query(`DROP VIEW IF EXISTS ${q(v.viewname)} CASCADE`);
  for (const t of cat.baseTables) await client.query(`DROP TABLE IF EXISTS ${q(t.relname)} CASCADE`);   // also drops their triggers
  for (const f of cat.routines) await client.query(`DROP FUNCTION IF EXISTS ${q(f.proname)}(${f.args}) CASCADE`);
  for (const sq of cat.sequences) await client.query(`DROP SEQUENCE IF EXISTS ${q(sq.sequencename)} CASCADE`);
  for (const e of cat.enums) await client.query(`DROP TYPE IF EXISTS ${q(e.typname)} CASCADE`);
};

/**
 * A REAL restore into the live database (disaster recovery — used by the command-line tool only, never
 * from the web). With wipe=true it replaces the app's tables in the "public" schema (extensions such as PostGIS are left alone); all in ONE transaction,
 * so if anything fails the database is exactly as it was.
 */
export const restoreBackupFile = async (filePath, { wipe = false } = {}) => {
  const client = await newClient();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path TO public');
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND ${NOT_EXTENSION('c')}`);
    if (rows[0].n > 0 && !wipe) throw new Error(`The database already has ${rows[0].n} tables. Restore into an empty database, or add --wipe to replace everything.`);
    if (wipe) await wipeAppObjects(client);
    const created = new Set();
    const manifest = await readBackup(filePath, (stmt) => { guardStatement(stmt, created); return client.query(stmt); });
    const { problems } = await compare(client, manifest, 'public');
    if (problems.length) throw new Error(`The restored data does not match the backup, so nothing was changed:\n  ${problems.join('\n  ')}`);
    await client.query('COMMIT');
    return { tables: manifest.table_count, rows: manifest.total_rows };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally { await client.end().catch(() => {}); }
};

/** True when the public schema holds any application tables (used to skip pointless backups of an empty database). */
export const databaseHasData = async () => {
  const [rows] = await sequelize.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'SequelizeMeta' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')`);
  return rows[0].n > 0;
};
