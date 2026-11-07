// FILE PATH: backend/src/services/backup/backupService.js
/**
 * Backup helpers used by the command line tools (migrations, restore) and, in later phases, by the
 * Settings → Backup screen. quickBackupToFile() makes a full, TESTED backup file without needing any
 * history table, so it works even on a database that has not been upgraded yet.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDump, verifyBackupFile, databaseHasData } from './dumpEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const backupDir = () => {
  const dir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', '..', 'backups'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const runningUnderTests = () =>
  (process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT)) && process.env.BACKUP_FORCE_IN_TESTS !== '1';

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

/**
 * Returns { file, tables, rows, bytes }, or null when there is nothing to back up.
 * Throws if the backup cannot be made or fails its restore test — callers must then stop.
 */
export const quickBackupToFile = async (label) => {
  if (process.env.SKIP_BACKUP === '1' || runningUnderTests()) return null;
  if (!(await databaseHasData())) return null;
  const file = path.join(backupDir(), `biztrack-backup-${stamp()}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.sql.gz`);
  const d = await createDump(file, { label });
  const v = await verifyBackupFile(file, { expectedSha256: d.sha256 });
  if (!v.ok) throw new Error(`The safety backup failed its restore test (${v.problems[0] || 'unknown'}). Nothing was changed.`);
  return { file, tables: d.manifest.table_count, rows: d.manifest.total_rows, bytes: d.bytes };
};
