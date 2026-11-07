// FILE PATH: backend/src/utils/backupCli.js
/**
 * Command-line backups.
 *   npm run db:backup                         full backup, restore-tested, into BACKUP_DIR (default ./backups)
 *   npm run db:backup:list                    the backup files that exist
 *   npm run db:restore -- <file> --yes        REPLACES the whole database with the backup (asks for --yes)
 */
import fs from 'fs';
import path from 'path';
import sequelize from '../config/database.js';
import { backupDir, quickBackupToFile } from '../services/backup/backupService.js';
import { restoreBackupFile, verifyBackupFile } from '../services/backup/dumpEngine.js';

const [cmd = 'run', arg] = process.argv.slice(2);
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

const run = async () => {
  if (cmd === 'run') {
    const prev = process.env.SKIP_BACKUP; delete process.env.SKIP_BACKUP;
    const b = await quickBackupToFile('manual');
    if (prev !== undefined) process.env.SKIP_BACKUP = prev;
    console.log(b ? `✅ ${b.tables} tables / ${b.rows} rows (${mb(b.bytes)}), restore tested:\n   ${b.file}` : 'Nothing to back up (the database is empty).');
  } else if (cmd === 'list') {
    const dir = backupDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql.gz')).sort();
    console.log(files.length ? files.map((f) => `${f}  ${mb(fs.statSync(path.join(dir, f)).size)}`).join('\n') : `No backups in ${dir}`);
  } else if (cmd === 'restore') {
    if (!arg || !fs.existsSync(arg)) throw new Error('Give the backup file: npm run db:restore -- backups/<file>.sql.gz --yes');
    if (!process.argv.includes('--yes')) throw new Error('This REPLACES everything in the database with the backup. Run again with --yes to confirm.');
    const check = await verifyBackupFile(arg);
    if (!check.ok) throw new Error(`The backup file failed its check: ${check.problems[0]}`);
    const r = await restoreBackupFile(arg, { wipe: true });
    console.log(`✅ Restored ${r.tables} tables / ${r.rows} rows.`);
  } else throw new Error(`Unknown command "${cmd}". Use: run | list | restore`);
};

run().then(() => sequelize.close()).catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });
