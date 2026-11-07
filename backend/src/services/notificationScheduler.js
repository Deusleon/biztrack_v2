// path: backend/services/notificationScheduler.js
import pool from '../config/db.js';
import { t } from '../utils/translate.js';
import { notifyStore, DEFAULT_NOTIFICATION_SETTINGS } from './notification.service.js';
// All schedule decisions use THIS timezone, never the server's local clock.
// The server can be in the US, Australia, anywhere — notifications still go
// out at the configured Tanzania time.
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Africa/Dar_es_Salaam";

// Preferred: NOTIFICATION_SCHEDULER_TIME="22:25" (hour AND minutes, 24h format).
// Falls back to the legacy NOTIFICATION_SCHEDULER_HOUR (hour only) if not set.
function parseScheduledTime() {
  const raw = (process.env.NOTIFICATION_SCHEDULER_TIME || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute };
    }
    console.warn(
      `Invalid NOTIFICATION_SCHEDULER_TIME "${raw}" (expected HH:MM, e.g. 22:25). Falling back.`,
    );
  }
  const legacyHour = Number.parseInt(process.env.NOTIFICATION_SCHEDULER_HOUR || "8", 10);
  return {
    hour: Math.min(23, Math.max(0, Number.isNaN(legacyHour) ? 8 : legacyHour)),
    minute: 0,
  };
}

const RUN_TIME = parseScheduledTime();
const RUN_TIME_SQL = `${String(RUN_TIME.hour).padStart(2, "0")}:${String(RUN_TIME.minute).padStart(2, "0")}`;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // checks stay hourly, like before

// How many hours the daily summary looks back, ending at RUN_TIME.
// NOTIFICATION_SUMMARY_WINDOW_HOURS=11 -> "last 11 hours ending at RUN_TIME"
// instead of the default trailing 24 hours. Low stock / payment due are
// point-in-time checks and are NOT affected by this -- only the daily
// summary (sales/profit/expenses) uses a time window.
function parseSummaryWindowHours() {
  const raw = Number.parseInt(process.env.NOTIFICATION_SUMMARY_WINDOW_HOURS || "24", 10);
  if (Number.isNaN(raw) || raw <= 0) {
    console.warn(
      `Invalid NOTIFICATION_SUMMARY_WINDOW_HOURS "${process.env.NOTIFICATION_SUMMARY_WINDOW_HOURS}" (expected a positive number of hours). Falling back to 24.`,
    );
    return 24;
  }
  return raw;
}

const SUMMARY_WINDOW_HOURS = parseSummaryWindowHours();

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

async function wasProcessed(storeId, action) {
  const result = await pool.query(
    "SELECT 1 FROM system_logs WHERE store_id = $1 AND action = $2 LIMIT 1",
    [storeId, action],
  );
  return result.rows.length > 0;
}

async function markProcessed(storeId, action, description) {
  await pool.query(
    `INSERT INTO system_logs (user_id, action, description, store_id)
     VALUES (NULL, $1, $2, $3)`,
    [action, JSON.stringify(description), storeId],
  );
}

async function getLowStockSummary(storeId) {
  const result = await pool.query(
    `WITH product_stock AS (
       SELECT p.id, p.name, p.minimum_stock,
              COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE 0 END), 0) AS current_stock
       FROM products p
       LEFT JOIN inventory_movements im
         ON im.product_id = p.id AND im.store_id = p.store_id
       WHERE p.store_id = $1
         AND LOWER(COALESCE(p.status, 'active')) = 'active'
       GROUP BY p.id, p.name, p.minimum_stock
     ), low_items AS (
       SELECT * FROM product_stock
       WHERE current_stock <= COALESCE(minimum_stock, 0)
       ORDER BY (COALESCE(minimum_stock, 0) - current_stock) DESC, name
     )
     SELECT
       (SELECT COUNT(*)::int FROM low_items) AS count,
       COALESCE((
         SELECT json_agg(json_build_object(
           'name', name,
           'current_stock', current_stock,
           'minimum_stock', minimum_stock
         ))
         FROM (SELECT * FROM low_items LIMIT 5) ranked
       ), '[]'::json) AS items`,
    [storeId],
  );
  return result.rows[0] || { count: 0, items: [] };
}

async function getPaymentDueSummary(storeId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(SUM(amount_due), 0) AS total_due
     FROM credit_sales
     WHERE store_id = $1
       AND status NOT IN ('paid', 'cancelled')
       AND amount_due > 0
       AND due_date IS NOT NULL
       AND due_date <= NOW()`,
    [storeId],
  );
  return result.rows[0] || { count: 0, total_due: 0 };
}


async function getDailySummary(storeId, dateKey, endOverride = null) {
  const result = await pool.query(
    `
    WITH bounds AS (
      SELECT
        COALESCE(
          $5::timestamptz,
          ($2::date + $4::time)::timestamp AT TIME ZONE $3
        ) - (INTERVAL '1 hour' * $6::numeric) AS start_at,

        COALESCE(
          $5::timestamptz,
          ($2::date + $4::time)::timestamp AT TIME ZONE $3
        ) AS end_at
    ),

    invoice_profit AS (
      SELECT
        p.invoice_number,

        COALESCE(
          SUM(
            pricing.final_selling_price * c.quantity
          ),
          0
        ) AS revenue,

        COALESCE(
          SUM(
            COALESCE(ib.cost_price, 0) * c.quantity
          ),
          0
        ) AS total_cost,

        COALESCE(
          SUM(
            (
              pricing.final_selling_price
              - COALESCE(ib.cost_price, 0)
            ) * c.quantity
          ),
          0
        ) AS gross_profit

      FROM payments p

      JOIN cart c
        ON c.cart_code = p.cart_code
       AND c.status = 'Sold'

      CROSS JOIN bounds b

      CROSS JOIN LATERAL (
        SELECT
          CASE
            WHEN c.discount_mode = 'percentage'
              THEN (
                c.price
                - (
                    c.price
                    * COALESCE(c.discount, 0)
                    / 100.0
                  )
              )

            WHEN c.discount_mode = 'amount'
              THEN (
                c.price
                - COALESCE(c.discount, 0)
              )

            ELSE c.price
          END AS final_selling_price
      ) pricing

      LEFT JOIN inventory_movements im
        ON im.transaction_date = p.sales_date
       AND im.product_id = c.product_id
       AND im.store_id = p.store_id
       AND im.type = 'OUT'

      LEFT JOIN inventory_batches ib
        ON ib.id = im.batch_id

      WHERE p.store_id = $1
        AND p.sales_date >= b.start_at
        AND p.sales_date < b.end_at

      GROUP BY p.invoice_number
    ),

    sales AS (
      SELECT
        COUNT(*)::int AS sales_count,
        COALESCE(SUM(revenue), 0) AS revenue,
        COALESCE(SUM(total_cost), 0) AS total_cost,
        COALESCE(SUM(gross_profit), 0) AS gross_profit,

        CASE
          WHEN COALESCE(SUM(revenue), 0) <> 0
            THEN (
              COALESCE(SUM(gross_profit), 0)
              / SUM(revenue)
            ) * 100
          ELSE 0
        END AS profit_margin_percentage

      FROM invoice_profit
    ),

    returns AS (
      SELECT
        COUNT(*)::int AS returns_count,

        COALESCE(
          SUM(sr.refund_amount),
          0
        ) AS returned_amount

      FROM sales_returns sr
      CROSS JOIN bounds b

      WHERE sr.store_id = $1
        AND sr.created_at >= b.start_at
        AND sr.created_at < b.end_at
    ),

    expense_totals AS (
      SELECT
        COALESCE(SUM(e.amount), 0) AS total_expenses
      FROM expenses e
      CROSS JOIN bounds b
      WHERE e.store_id = $1
        AND e.expense_date >= b.start_at
        AND e.expense_date < b.end_at
    )

    SELECT
      sales.sales_count,
      sales.revenue,
      sales.total_cost,
      sales.gross_profit,
      expense_totals.total_expenses AS expenses,
      (sales.gross_profit - expense_totals.total_expenses) AS net_profit,
      sales.profit_margin_percentage,
      returns.returns_count,
      returns.returned_amount,
      bounds.start_at AS window_start,
      bounds.end_at AS window_end

    FROM sales
    CROSS JOIN returns
    CROSS JOIN expense_totals
    CROSS JOIN bounds
    `,
    [storeId, dateKey, BUSINESS_TIMEZONE, RUN_TIME_SQL, endOverride, SUMMARY_WINDOW_HOURS],
  );

  const row = result.rows[0];

  return {
    sales_count: Number(row?.sales_count ?? 0),
    revenue: Number(row?.revenue ?? 0),
    total_cost: Number(row?.total_cost ?? 0),
    gross_profit: Number(row?.gross_profit ?? 0),
    expenses: Number(row?.expenses ?? 0),
    net_profit: Number(row?.net_profit ?? 0),
    profit_margin_percentage: Number(
      row?.profit_margin_percentage ?? 0,
    ),
    returns_count: Number(row?.returns_count ?? 0),
    returned_amount: Number(row?.returned_amount ?? 0),
    window_start: row?.window_start ?? null,
    window_end: row?.window_end ?? null,
  };
}

// "2026-07-23T22:25:00.000Z" -> "2026-07-23 22:25" in BUSINESS_TIMEZONE.
// Used to label report_period with the window's real start/end, whatever
// length NOTIFICATION_SUMMARY_WINDOW_HOURS is set to.
function formatBusinessTime(date) {
  if (!date) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(date));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function channelEnabled(settings, type) {
  return ["inapp", "email", "sms"].some((channel) => settings[`${channel}_${type}`] === true);
}

async function processStore(storeId, rawSettings, dateKey, options = {}) {
  const { endOverride = null } = options;
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(rawSettings || {}) };

  if (channelEnabled(settings, "low_stock")) {
    const action = `scheduled_low_stock_${dateKey}`;
    if (!(await wasProcessed(storeId, action))) {
      const lowStock = await getLowStockSummary(storeId);
      if (Number(lowStock.count) > 0) {
        const formattedValue = new Intl.NumberFormat("en-US").format(
          Number(lowStock.count)
        );
        await notifyStore({
          storeId,
          type: "low_stock",
          title: "Low stock alert",
          message: t("product_low_stock_msg", { count: formattedValue }),
          meta: { low_stock_products: Number(lowStock.count), items: lowStock.items.map((item) => item.name).join(", ") },
        });
      }
      await markProcessed(storeId, action, { date: dateKey, count: Number(lowStock.count) });
    }
  }

  if (channelEnabled(settings, "payment_due")) {
    const action = `scheduled_payment_due_${dateKey}`;
    if (!(await wasProcessed(storeId, action))) {
      const due = await getPaymentDueSummary(storeId);
      if (Number(due.count) > 0) {
        await notifyStore({
          storeId,
          type: "payment_due",
          title: "Customer payments due",
          message: t("credit_sale_payment_due_msg", { count: due.count }),
          meta: { payments_due: due.count, total_due: Number(due.total_due).toLocaleString('en-US') },
        });
      }
      await markProcessed(storeId, action, { date: dateKey, count: Number(due.count), total_due: due.total_due });
    }
  }

  if (channelEnabled(settings, "daily_summary")) {
    const action = `scheduled_daily_summary_${dateKey}`;
    if (!(await wasProcessed(storeId, action))) {
      const summary = await getDailySummary(storeId, dateKey, endOverride);
      await notifyStore({
        storeId,
        type: "daily_summary",
        title: "Daily business summary",
        message: t("daily_summary_msg", { sales_count: summary.sales_count, revenue: Number(summary.revenue).toLocaleString('en-US'), profit: Number(summary.gross_profit).toLocaleString('en-US'), expenses: Number(summary.expenses).toLocaleString('en-US'), net_profit: Number(summary.net_profit).toLocaleString('en-US') }),
        meta: {
          report_period: `${formatBusinessTime(summary.window_start)} - ${formatBusinessTime(summary.window_end)}`,
          sales_count: summary.sales_count,
          revenue: Number(summary.revenue).toLocaleString('en-US'),
          sales_returns: summary.returns_count,
          returned_amount: Number(summary.returned_amount).toLocaleString('en-US'),
          gross_profit: Number(summary.gross_profit).toLocaleString('en-US'),
          expenses: Number(summary.expenses).toLocaleString('en-US'),
          net_profit: Number(summary.net_profit).toLocaleString('en-US'),
        },
        channels: ["email", "sms"],
      });
      await markProcessed(storeId, action, { date: dateKey, ...summary });
    }
  }
}

async function runNotificationsForStoreNow(storeId, { force = false } = {}) {
  const { dateKey } = getZonedClock();

  if (force) {
    await pool.query(
      `DELETE FROM system_logs
       WHERE store_id = $1
         AND action IN ($2, $3, $4)`,
      [
        storeId,
        `scheduled_low_stock_${dateKey}`,
        `scheduled_payment_due_${dateKey}`,
        `scheduled_daily_summary_${dateKey}`,
      ],
    );
  }

  const storeResult = await pool.query(
    "SELECT settings FROM store_settings WHERE store_id = $1",
    [storeId],
  );
  const rawSettings = storeResult.rows[0]?.settings?.notifications;

  await processStore(storeId, rawSettings, dateKey, { endOverride: new Date() });
  return { dateKey };
}

async function runScheduledNotifications() {
  const { dateKey, hour, minute } = getZonedClock();

  // Not yet the configured Tanzania time today -> do nothing.
  // (Uses hour AND minutes, e.g. 22:25 or 10:16.)
  if (hour * 60 + minute < RUN_TIME.hour * 60 + RUN_TIME.minute) return;

  const stores = await pool.query("SELECT store_id, settings FROM store_settings");
  for (const row of stores.rows) {
    try {
      await processStore(row.store_id, row.settings?.notifications, dateKey);
    } catch (error) {
      console.error(`Notification scheduler failed for store ${row.store_id}:`, error.message);
    }
  }
}

function startNotificationScheduler() {
  if (process.env.NODE_ENV === "test" || process.env.NOTIFICATION_SCHEDULER_ENABLED === "false") return;

  const safeRun = () =>
    runScheduledNotifications().catch((error) =>
      console.error("Notification scheduler error:", error.message),
    );

  // One-shot timer armed by the hourly check below, so the send lands
  // exactly on HH:MM without checking every minute.
  let pendingTimer = null;

  const check = () => {
    const now = new Date();
    const { hour, minute } = getZonedClock(now);
    const nowMinutes = hour * 60 + minute;
    const targetMinutes = RUN_TIME.hour * 60 + RUN_TIME.minute;

    if (nowMinutes >= targetMinutes) {
      // Target already passed today: run now. Acts as the catch-up after a
      // restart AND the retry for stores that failed earlier — the per-day
      // dedup in system_logs prevents any duplicates.
      safeRun();
      return;
    }

    // Target is still ahead. If it lands before the next hourly check,
    // arm a one-shot timer for the exact HH:MM.
    const delayMs =
      (targetMinutes - nowMinutes) * 60 * 1000 -
      (now.getSeconds() * 1000 + now.getMilliseconds()) +
      1000; // land just inside the target minute

    if (delayMs <= CHECK_INTERVAL_MS && !pendingTimer) {
      pendingTimer = setTimeout(async () => {
        pendingTimer = null;
        await safeRun();
      }, Math.max(1000, delayMs));
      pendingTimer.unref?.();
    }
  };

  // First check shortly after boot, then hourly — same rhythm as before.
  const initialTimer = setTimeout(check, 10_000);
  initialTimer.unref?.();

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  interval.unref?.();
}

export { startNotificationScheduler, runScheduledNotifications, runNotificationsForStoreNow };

