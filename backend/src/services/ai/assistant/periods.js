const ZONE = process.env.BUSINESS_TIMEZONE || 'Africa/Dar_es_Salaam';

function businessToday(now = new Date(), timeZone = ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(iso, days) {
  const [year, month, day] = String(iso).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthBounds(iso, offset) {
  const [year, month] = String(iso).split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1 + offset, 1));
  const end = new Date(Date.UTC(year, month + offset, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** A date range named in the question. "today" stays on the existing today tools. */
function periodFromMessage(message, today = businessToday()) {
  const text = String(message || '');
  if (/compare|linganisha/i.test(text) && /week|wiki/i.test(text)) return null;
  if (/last month|mwezi uliopita/i.test(text)) return { ...monthBounds(today, -1), kind: 'last_month' };
  if (/this month|mwezi huu/i.test(text)) {
    const bounds = monthBounds(today, 0);
    return { from: bounds.from, to: today, kind: 'this_month' };
  }
  if (/last week|wiki iliyopita/i.test(text)) return { from: addDays(today, -7), to: addDays(today, -1), kind: 'last_week' };
  if (/\byesterday\b|\bjana\b/i.test(text)) {
    const day = addDays(today, -1);
    return { from: day, to: day, kind: 'yesterday' };
  }
  if (/\btoday\b|\bleo\b/i.test(text)) return { from: today, to: today, kind: 'today' };
  return null;
}

function rangeOf(args = {}, period, today = businessToday()) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let from = iso.test(args.from) ? args.from : period?.from;
  let to = iso.test(args.to) ? args.to : period?.to;
  if (!iso.test(from) || !iso.test(to)) return { from: today, to: today };
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export { businessToday, addDays, periodFromMessage, rangeOf, ZONE };
