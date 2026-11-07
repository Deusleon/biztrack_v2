// backend/src/utils/migrate.js
/**
 * migrate.js — a small, dependency-free migration runner.
 *
 * Why this exists: the app used to rely entirely on `sequelize.sync()` —
 * `{ alter: true }` in dev, `{ force: true }` (WIPES ALL DATA) for the
 * "production setup" script (`npm run db:empty`). Neither is safe for a
 * a real store's data: `alter` can silently make the wrong structural
 * change when it guesses at a rename/type-change, and `force` deletes
 * everything. Every other serious Node+Postgres project uses versioned,
 * one-way-forward migration FILES instead — this is that, kept as small
 * and dependency-free as possible so it's easy to read and trust.
 *
 * Each file in ../migrations/ exports `{ up(queryInterface, Sequelize),
 * down(queryInterface, Sequelize) }`. Applied migrations are recorded in
 * a `SequelizeMeta` table (one row per applied filename) so re-running
 * `migrate` is always safe — only new, not-yet-applied files run.
 *
 * Usage (from backend/):
 *   npm run db:migrate            # apply every not-yet-applied migration
 *   npm run db:migrate:status     # list applied vs pending
 *   npm run db:migrate:undo       # revert the single most recent migration
 *
 * See MIGRATIONS_GUIDE.md for how this fits into an existing installation
 * that already has its tables (created previously via sync()).
 */
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import sequelize from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const META_TABLE = 'SequelizeMeta';

const ensureMetaTable = async () => {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  const exists = tables.map((t) => (typeof t === 'string' ? t : t.tableName)).includes(META_TABLE);
  if (!exists) {
    await qi.createTable(META_TABLE, {
      name: { type: sequelize.Sequelize.DataTypes.STRING, allowNull: false, unique: true, primaryKey: true },
      applied_at: { type: sequelize.Sequelize.DataTypes.DATE, allowNull: false, defaultValue: sequelize.Sequelize.fn('NOW') },
    });
  }
};

const listMigrationFiles = () => fs.readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.js'))
  .sort(); // filenames are timestamp-prefixed, so alphabetical === chronological

const getAppliedNames = async () => {
  const [rows] = await sequelize.query(`SELECT name FROM "${META_TABLE}" ORDER BY name ASC`);
  return rows.map((r) => r.name);
};

const loadMigration = async (filename) => {
  // MUST go through pathToFileURL. A plain filesystem path happens to work
  // on Linux/macOS, but on Windows it becomes "D:\\...\\migrations\\x.js" and
  // Node's ESM loader reads the drive letter as a URL scheme:
  //   ERR_UNSUPPORTED_ESM_URL_SCHEME ... Received protocol 'd:'
  // pathToFileURL produces a proper file:// URL on every platform.
  const mod = await import(pathToFileURL(path.join(MIGRATIONS_DIR, filename)).href);
  return mod;
};

export const pendingMigrations = async () => {
  await ensureMetaTable();
  const applied = new Set(await getAppliedNames());
  return listMigrationFiles().filter((f) => !applied.has(f));
};

export const status = async () => {
  await ensureMetaTable();
  const files = listMigrationFiles();
  const applied = new Set(await getAppliedNames());
  console.log('Migration status:');
  for (const f of files) {
    console.log(`  [${applied.has(f) ? 'x' : ' '}] ${f}`);
  }
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) console.log('\nEverything is up to date.');
  else console.log(`\n${pending.length} pending migration(s).`);
  return { files, applied: [...applied], pending };
};

export const up = async () => {
  await ensureMetaTable();
  const files = listMigrationFiles();
  const applied = new Set(await getAppliedNames());
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Nothing to migrate — already up to date.');
    return;
  }

  // Safety net: a tested backup of the whole database before the structure is changed.
  // (Skip with SKIP_BACKUP=1. A fresh, empty database has nothing to protect and is skipped automatically.)
  try {
    const { quickBackupToFile } = await import('../services/backup/backupService.js');
    console.log('Taking a safety backup before migrating…');
    const b = await quickBackupToFile('before-migration');
    console.log(b ? `  ✅ Backed up ${b.tables} tables / ${b.rows} rows and tested the restore: ${b.file}` : '  (nothing to back up yet)');
  } catch (error) {
    console.error(`  ❌ Safety backup failed: ${error.message}`);
    console.error('  Nothing was migrated. Fix the problem, or run again with SKIP_BACKUP=1 if you accept the risk.');
    throw error;
  }

  for (const filename of pending) {
    console.log(`Applying ${filename} ...`);
    const migration = await loadMigration(filename);
    const t = await sequelize.transaction();
    try {
      await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize, t);
      await sequelize.query(
        `INSERT INTO "${META_TABLE}" (name, applied_at) VALUES (:name, NOW())`,
        { replacements: { name: filename }, transaction: t },
      );
      await t.commit();
      console.log(`  ✅ ${filename}`);
    } catch (error) {
      await t.rollback();
      console.error(`  ❌ ${filename} failed — rolled back. Nothing after this point ran.`);
      throw error;
    }
  }
  console.log('\nAll migrations applied.');
};

export const down = async () => {
  await ensureMetaTable();
  const applied = await getAppliedNames();
  if (applied.length === 0) {
    console.log('No migrations have been applied — nothing to undo.');
    return;
  }
  const filename = applied[applied.length - 1];
  console.log(`Reverting ${filename} ...`);
  const migration = await loadMigration(filename);
  const t = await sequelize.transaction();
  try {
    await migration.down(sequelize.getQueryInterface(), sequelize.Sequelize, t);
    await sequelize.query(
      `DELETE FROM "${META_TABLE}" WHERE name = :name`,
      { replacements: { name: filename }, transaction: t },
    );
    await t.commit();
    console.log(`  ✅ Reverted ${filename}`);
  } catch (error) {
    await t.rollback();
    console.error(`  ❌ Revert of ${filename} failed — rolled back.`);
    throw error;
  }
};

/**
 * Records migrations as applied WITHOUT running them.
 *
 * This is the path for a database whose tables were already created by the
 * old `sequelize.sync()` approach. The baseline migration would try to
 * create what is already there — and worse, would add a second set of
 * foreign-key constraints alongside the ones sync created, because sync
 * names them `<table>_<column>_fkey` while the migration names them
 * `fk_<table>_<column>`. Postgres accepts both, leaving the schema quietly
 * duplicated.
 *
 *   node src/utils/migrate.js mark-applied              # all pending
 *   node src/utils/migrate.js mark-applied <filename>   # just one
 *
 * Only use this when you have checked the database already matches what
 * the migration would have created.
 */
export const markApplied = async () => {
  await ensureMetaTable();
  const requested = process.argv[3];
  const applied = await getAppliedNames();
  const files = listMigrationFiles().filter((f) => !applied.includes(f));

  const target = requested ? files.filter((f) => f === requested) : files;

  if (requested && target.length === 0) {
    const known = listMigrationFiles();
    if (!known.includes(requested)) {
      console.error(`No migration file named "${requested}".`);
    } else {
      console.log(`${requested} is already recorded as applied.`);
    }
    return;
  }
  if (target.length === 0) {
    console.log('Nothing pending — every migration is already recorded.');
    return;
  }

  console.log('Recording as applied WITHOUT running:');
  for (const filename of target) {
    await sequelize.query(
      `INSERT INTO "${META_TABLE}" (name, applied_at) VALUES (:name, NOW())`,
      { replacements: { name: filename } },
    );
    console.log(`  ✓ ${filename}`);
  }
  console.log('\nDone. Run `npm run db:migrate:status` to confirm.');
};

// ─── CLI entry point ───────────────────────────────────────────────────────
// Compared as resolved filesystem paths on both sides. Comparing a
// file:// URL against process.argv[1] directly fails on Windows, where the
// separators and drive-letter casing differ.
const isMain = process.argv[1]
  && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  const cmd = process.argv[2] || 'up';
  const run = { up, down, status, 'mark-applied': markApplied }[cmd];
  if (!run) {
    console.error(`Unknown command "${cmd}". Use: up | down | status | mark-applied`);
    process.exit(1);
  }
  run()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}