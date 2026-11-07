import { runCloudBackup, getDriveClient, hasSucceededForDate, isBackupRunning } from './backup.service.js';
// Same timezone policy as the notification scheduler: all decisions use the
// business timezone, never the server's local clock.
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Dar_es_Salaam";

// BACKUP_TIME="02:00" (24h HH:MM, business timezone). Default 02:00 —
// backups are heavier than notifications so run them off-hours.
function parseScheduledTime() {
  const raw = (process.env.BACKUP_TIME || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
    console.warn(`Invalid BACKUP_TIME "${raw}" (expected HH:MM, e.g. 02:00). Using default 02:00.`);
  }
  return { hour: 2, minute: 0 };
}

const RUN_TIME = parseScheduledTime();
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly checks

function getZonedClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

async function runScheduledBackup() {
  const { dateKey, hour, minute } = getZonedClock();

  // Not yet the configured time today
  if (hour * 60 + minute < RUN_TIME.hour * 60 + RUN_TIME.minute) return;

  // Skip silently when Google Drive isn't configured
  const drive = await getDriveClient();
  if (!drive) return;

  // One successful backup per business day; also don't stack on a run in flight
  if (await hasSucceededForDate(dateKey)) return;
  if (await isBackupRunning()) return;

  const result = await runCloudBackup({ triggeredBy: "scheduled", dateKey });
  if (result.success) {
    console.log(`Scheduled cloud backup completed: ${result.fileName} (${result.method}, ${result.sizeBytes} bytes)`);
  } else if (!result.skipped) {
    console.error(`Scheduled cloud backup failed: ${result.error}`);
  }
}

function startBackupScheduler() {
  if (process.env.NODE_ENV === "test" || process.env.BACKUP_SCHEDULER_ENABLED === "false") return;

  const safeRun = () =>
    runScheduledBackup().catch((error) => console.error("Backup scheduler error:", error.message));

  // Hourly checks that arm a one-shot timer for the exact HH:MM —
  // same pattern as the notification scheduler.
  let pendingTimer = null;

  const check = () => {
    const now = new Date();
    const { hour, minute } = getZonedClock(now);
    const nowMinutes = hour * 60 + minute;
    const targetMinutes = RUN_TIME.hour * 60 + RUN_TIME.minute;

    if (nowMinutes >= targetMinutes) {
      // Passed already today: acts as boot catch-up and failure retry.
      // Idempotent via the one-success-per-day check.
      safeRun();
      return;
    }

    const delayMs =
      (targetMinutes - nowMinutes) * 60 * 1000 -
      (now.getSeconds() * 1000 + now.getMilliseconds()) +
      1000;

    if (delayMs <= CHECK_INTERVAL_MS && !pendingTimer) {
      pendingTimer = setTimeout(async () => {
        pendingTimer = null;
        await safeRun();
      }, Math.max(1000, delayMs));
      pendingTimer.unref?.();
    }
  };

  const initialTimer = setTimeout(check, 15_000);
  initialTimer.unref?.();

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  interval.unref?.();
}

export { startBackupScheduler, runScheduledBackup, RUN_TIME };

