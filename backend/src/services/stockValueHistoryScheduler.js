// path: backend/services/stockValueHistoryScheduler.js
//
// Same pattern as services/backupScheduler.js and
// services/notificationScheduler.js: a configurable daily time (business
// timezone), an hourly check that arms a precise one-shot timer, and a
// per-day dedup so a server restart never creates two snapshots the same
// day.
//
// Runs for EVERY store (this app is multi-tenant — many businesses share
// this backend), using each store's configured default price category
// (store_settings.settings.operations.defaultPriceCategory — the same
// field products/reports already use) to value the stock.

import pool from '../config/db.js';
import { createStockValueSnapshot } from './stockValueSnapshot.service.js';
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Dar_es_Salaam";

// STOCK_SNAPSHOT_TIME="23:55" (24h HH:MM, business timezone). Defaults to
// just before midnight so the snapshot reflects the full day's activity —
// same idea as end-of-day stock takes.
function parseScheduledTime() {
  const raw = (process.env.STOCK_SNAPSHOT_TIME || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
    console.warn(
      `Invalid STOCK_SNAPSHOT_TIME "${raw}" (expected HH:MM, e.g. 23:55). Using default 23:55.`,
    );
  }
  return { hour: 23, minute: 55 };
}

const RUN_TIME = parseScheduledTime();
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly checks, same as the other schedulers

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

async function alreadySnapshottedToday(storeId, dateKey) {
  const result = await pool.query(
    `SELECT 1 FROM stock_value_history
     WHERE store_id = $1 AND snapshot_date::date = $2::date
     LIMIT 1`,
    [storeId, dateKey],
  );
  return result.rows.length > 0;
}

async function runForStore(storeId, settings, dateKey) {
  if (await alreadySnapshottedToday(storeId, dateKey)) return;

  const priceCategoryId = settings?.operations?.defaultPriceCategory;
  if (!priceCategoryId) {
    // Store hasn't configured a default price category yet — nothing to
    // value against. Skip quietly; this isn't an error, just not set up.
    return;
  }

  const result = await createStockValueSnapshot({
    storeId,
    priceCategoryId,
    createdBy: null, // null = system/scheduled, distinguishable from manual saves
    notes: "Auto-saved daily snapshot",
  });

  if (result.skipped) {
    // e.g. store has zero products with stock right now — normal, not an error
    return;
  }

  console.log(
    `Stock value snapshot saved for store ${storeId}: ${result.data.total_products} products, worth ${result.data.total_stock_worth}`,
  );
}

async function runScheduledStockValueSnapshot() {
  const { dateKey, hour, minute } = getZonedClock();

  // Not yet the configured time today
  if (hour * 60 + minute < RUN_TIME.hour * 60 + RUN_TIME.minute) return;

  const stores = await pool.query("SELECT store_id, settings FROM store_settings");
  for (const row of stores.rows) {
    try {
      await runForStore(row.store_id, row.settings, dateKey);
    } catch (error) {
      // One store's failure must never block the rest.
      console.error(
        `Stock value snapshot failed for store ${row.store_id}:`,
        error.message,
      );
    }
  }
}

function startStockValueHistoryScheduler() {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.STOCK_SNAPSHOT_SCHEDULER_ENABLED === "false"
  )
    return;

  const safeRun = () =>
    runScheduledStockValueSnapshot().catch((error) =>
      console.error("Stock value snapshot scheduler error:", error.message),
    );

  let pendingTimer = null;

  const check = () => {
    const now = new Date();
    const { hour, minute } = getZonedClock(now);
    const nowMinutes = hour * 60 + minute;
    const targetMinutes = RUN_TIME.hour * 60 + RUN_TIME.minute;

    if (nowMinutes >= targetMinutes) {
      // Passed already today: acts as boot catch-up and failure retry.
      // Idempotent via the one-snapshot-per-store-per-day check.
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

  const initialTimer = setTimeout(check, 20_000); // stagger slightly after backup/notification boot checks
  initialTimer.unref?.();

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  interval.unref?.();
}

export { startStockValueHistoryScheduler, runScheduledStockValueSnapshot, RUN_TIME };

