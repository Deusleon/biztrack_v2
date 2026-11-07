// FILE PATH: backend/src/migrations/20261107000000-baseline-biztrack-schema.js
/**
 * BASELINE — brings ANY BizTrack database to the schema the old 48 SQL scripts describe,
 * WITHOUT touching data.
 *
 *  • Fresh, empty database → every SQL script runs, in order.
 *  • Existing database (created by the old runner, which kept a `schema_migrations` table) →
 *    only scripts that table does NOT list yet are run. A database that is already fully up to
 *    date therefore changes nothing at all: no table is created, altered or emptied.
 *
 * The old `schema_migrations` table is kept and kept up to date, so the previous runner (and any
 * tool that reads it) keeps seeing the truth. This file only ever ADDS what is missing — down()
 * is deliberately a no-op, because dropping tables to "undo" a baseline would destroy data.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.join(__dirname, 'sql');

// The old scripts sometimes carry their own BEGIN/COMMIT. Inside this migration's transaction a
// COMMIT would end it early and break rollback, so those standalone lines are removed.
const stripTx = (sql) => sql.replace(/^\s*(BEGIN|COMMIT)\s*;\s*$/gim, '');

export async function up(queryInterface, Sequelize, transaction) {
  const sequelize = queryInterface.sequelize;
  const run = (sql, opts = {}) => sequelize.query(sql, { transaction, ...opts });

  await run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    batch INTEGER NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const [done] = await run('SELECT filename FROM schema_migrations');
  const applied = new Set(done.map((r) => r.filename));
  const [[{ batch }]] = await run('SELECT COALESCE(MAX(batch), 0) + 1 AS batch FROM schema_migrations');

  const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));
  console.log(`  baseline: ${applied.size} script(s) already applied, ${pending.length} to apply`);

  for (const file of pending) {
    await run(stripTx(fs.readFileSync(path.join(SQL_DIR, file), 'utf8')));
    await run('INSERT INTO schema_migrations (filename, batch) VALUES (:file, :batch)', { replacements: { file, batch } });
    console.log(`    ✓ ${file}`);
  }
}

export async function down() {
  // Intentionally empty: see the note at the top of this file.
}
