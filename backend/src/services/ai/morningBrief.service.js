import pool from '../../config/db.js';
import sendEmail from '../../utils/emailService.js';
import * as smsService from '../../utils/smsService.js';
import { emitToUser } from '../../utils/socket.js';
import { resolvePermissionSet } from './core/PermissionResolver.js';
import { loadStoreFormat } from './assistant/storeFormat.js';
import { addDays, businessToday, ZONE } from './assistant/periods.js';
import { getNotificationSettings } from '../notification.service.js';
import { briefAction, composeBrief, labelOf } from './assistant/present.js';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function productName(alias = 'p') {
  return `${alias}.name`;
}

function briefIsDue(now = new Date(), time = process.env.AI_BRIEF_TIME || '07:00') {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  const hour = match ? Number(match[1]) : 7;
  const minute = match ? Number(match[2]) : 0;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = Number(values.hour) * 60 + Number(values.minute);
  return {
    due: minutes >= (hour * 60 + minute),
    date: `${values.year}-${values.month}-${values.day}`,
  };
}

async function loadSections(storeId, permissions) {
  const today = businessToday();
  const yesterday = addDays(today, -1);
  const data = { date: yesterday, sales: null, profit: null, lowStock: [], slow: [], debts: [] };

  if (permissions.has('ai_sales_insights')) {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(subtotal - total_discount), 0)::numeric AS net, COUNT(*)::int AS count
       FROM payments
       WHERE store_id = $1 AND sales_date::date = $2::date`,
      [storeId, yesterday],
    );
    data.sales = { net: toNumber(rows[0]?.net), count: Number(rows[0]?.count) || 0 };
  }

  if (permissions.has('ai_profit_insights')) {
    const [salesRes, cogsRes, expenseRes] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(subtotal - total_discount), 0)::numeric AS net
         FROM payments WHERE store_id = $1 AND sales_date::date = $2::date`,
        [storeId, yesterday],
      ),
      pool.query(
        `SELECT COALESCE(SUM(line_cost), 0)::numeric AS cogs
         FROM v_cart_line_profit WHERE store_id = $1 AND sales_date::date = $2::date`,
        [storeId, yesterday],
      ),
      pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS expenses
         FROM expenses WHERE store_id = $1 AND expense_date::date = $2::date`,
        [storeId, yesterday],
      ),
    ]);
    const net = toNumber(salesRes.rows[0]?.net);
    data.profit = net - toNumber(cogsRes.rows[0]?.cogs) - toNumber(expenseRes.rows[0]?.expenses);
    if (!data.sales) data.sales = null;
  }

  if (permissions.has('ai_inventory_insights')) {
    const { rows } = await pool.query(
      `WITH stock AS (
         SELECT p.id, ${productName('p')} AS name,
                COALESCE(SUM(CASE WHEN im.type = 'IN' THEN im.quantity WHEN im.type = 'OUT' THEN -im.quantity ELSE 0 END), 0) AS quantity,
                COALESCE(p.minimum_stock, 0) AS minimum_stock
         FROM products p
         LEFT JOIN inventory_movements im ON im.product_id = p.id AND im.store_id = p.store_id
         WHERE p.store_id = $1
         GROUP BY p.id, p.name, p.minimum_stock
       )
       SELECT id, name, quantity, minimum_stock AS "minimumStock" FROM stock
       WHERE quantity <= minimum_stock
       ORDER BY quantity ASC
       LIMIT 8`,
      [storeId],
    );
    data.lowStock = rows.map((row) => ({
      id: row.id,
      name: labelOf(row.name),
      quantity: toNumber(row.quantity),
      minimumStock: toNumber(row.minimumStock),
    }));
  }

  if (permissions.has('ai_sales_insights') || permissions.has('ai_inventory_insights')) {
    const { rows } = await pool.query(
      `SELECT ${productName('p')} AS name
       FROM cart c
       JOIN products p ON p.id = c.product_id
       JOIN payments pay ON pay.store_id = c.store_id AND pay.cart_code = c.cart_code
       WHERE c.store_id = $1 AND c.status = 'Sold'
         AND pay.sales_date::date >= $2::date
       GROUP BY p.id, p.name
       ORDER BY SUM(c.quantity) ASC
       LIMIT 5`,
      [storeId, addDays(today, -30)],
    );
    data.slow = rows.map((row) => labelOf(row.name));
  }

  if (permissions.has('ai_customer_insights')) {
    const { rows } = await pool.query(
      `SELECT name, phone, current_balance::numeric AS balance
       FROM customers
       WHERE store_id = $1 AND current_balance > 0
       ORDER BY current_balance DESC
       LIMIT 3`,
      [storeId],
    );
    data.debts = rows.map((row) => ({ name: row.name, phone: row.phone || '', balance: toNumber(row.balance) }));
  }

  return data;
}

async function buildMorningBrief({ storeId, userId, lang }) {
  const notice = await getNotificationSettings(storeId);
  if (notice.show_daily_brief === false) return { enabled: false };
  const [permissions, format] = await Promise.all([
    resolvePermissionSet(userId, storeId),
    loadStoreFormat(storeId),
  ]);
  const sections = await loadSections(storeId, permissions);
  const brief = composeBrief(lang, format, sections);
  const step = briefAction(sections, lang, format);
  return {
    enabled: true,
    ...brief,
    action: step,
    date: sections.date,
    currency: format.currency,
    sections: {
      sales: sections.sales,
      profit: sections.profit,
      lowStock: sections.lowStock,
      slow: sections.slow,
      debts: sections.debts.map((row) => ({ name: row.name, balance: row.balance })),
    },
    generatedAt: new Date().toISOString(),
  };
}

function cleanDelivery(input) {
  return {
    bell: input?.bell === true,
    email: input?.email === true,
    sms: input?.sms === true,
  };
}

async function getDelivery({ userId, storeId }) {
  const { rows } = await pool.query(
    `SELECT morning_brief FROM ai_user_settings WHERE user_id = $1 AND store_id = $2`,
    [userId, storeId],
  );
  return cleanDelivery(rows[0]?.morning_brief || {});
}

async function saveDelivery({ userId, storeId, delivery }) {
  const clean = cleanDelivery(delivery);
  await pool.query(
    `INSERT INTO ai_user_settings (user_id, store_id, morning_brief)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, store_id)
     DO UPDATE SET morning_brief = EXCLUDED.morning_brief, updated_at = NOW()`,
    [userId, storeId, JSON.stringify(clean)],
  );
  return clean;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function deliverBrief({ user, storeId, brief, channels, lang }) {
  const title = lang === 'sw' ? 'Muhtasari wa siku' : 'Daily brief';
  const result = { bell: false, email: false, sms: false };
  if (channels.bell) {
    emitToUser(user.id, 'inAppNotification', {
      type: 'ai_morning_brief',
      title,
      message: brief.text,
      timestamp: new Date().toISOString(),
    });
    result.bell = true;
  }
  if (channels.email && user.email) {
    const sent = await sendEmail({
      to: user.email,
      subject: `BizTrack: ${title}`,
      html: `<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(brief.text)}</p>`,
    });
    result.email = sent?.success !== false;
  }
  if (channels.sms && user.phone) {
    const text = brief.text.length > 300 ? `${brief.text.slice(0, 297)}...` : brief.text;
    const sent = await smsService.send(user.phone, text, { storeId, purpose: 'system' });
    result.sms = sent?.success === true;
  }
  return result;
}

async function wasProcessed(action) {
  const { rows } = await pool.query('SELECT 1 FROM system_logs WHERE action = $1 LIMIT 1', [action]);
  return rows.length > 0;
}

async function runMorningBriefs(now = new Date()) {
  const clock = briefIsDue(now);
  if (!clock.due) return { skipped: true, date: clock.date };
  const { rows } = await pool.query(
    `SELECT s.user_id, s.store_id, s.morning_brief, u.email, u.phone, u.name, u.preferred_language
     FROM ai_user_settings s
     JOIN users u ON u.id = s.user_id
     WHERE COALESCE(s.morning_brief->>'bell', '') = 'true'
        OR COALESCE(s.morning_brief->>'email', '') = 'true'
        OR COALESCE(s.morning_brief->>'sms', '') = 'true'`,
  );
  let sent = 0;
  for (const row of rows) {
    const action = `ai_morning_brief:${clock.date}:${row.user_id}:${row.store_id}`;
    if (await wasProcessed(action)) continue;
    const lang = String(row.preferred_language || 'en').toLowerCase().startsWith('sw') ? 'sw' : 'en';
    try {
      const brief = await buildMorningBrief({ storeId: row.store_id, userId: row.user_id, lang });
      await deliverBrief({
        user: { id: row.user_id, email: row.email, phone: row.phone, name: row.name },
        storeId: row.store_id,
        brief,
        channels: cleanDelivery(row.morning_brief),
        lang,
      });
      await pool.query(
        `INSERT INTO system_logs (user_id, action, description, store_id) VALUES ($1, $2, $3, $4)`,
        [row.user_id, action, 'Morning brief sent', row.store_id],
      );
      sent += 1;
    } catch (error) {
      console.error(`Morning brief failed for ${row.user_id}:`, error.message);
    }
  }
  return { skipped: false, date: clock.date, sent };
}

function startMorningBriefScheduler() {
  if (process.env.NODE_ENV === 'test' || process.env.AI_BRIEF_SCHEDULER_ENABLED === 'false') return;
  const run = () => runMorningBriefs().catch((error) => console.error('Morning brief scheduler error:', error.message));
  const timer = setTimeout(run, 15000);
  timer.unref?.();
  const interval = setInterval(run, 60 * 60 * 1000);
  interval.unref?.();
}

export {
  briefIsDue, buildMorningBrief, getDelivery, saveDelivery, deliverBrief, runMorningBriefs, startMorningBriefScheduler,
};
