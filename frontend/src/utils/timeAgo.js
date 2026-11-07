/**
 * timeAgo — "just now", "2 seconds ago", "31 minutes ago", "3 days ago".
 *
 * Accepts an ISO string, a timestamp or a Date. Returns "" for a missing or
 * unparseable value, so a bad date shows nothing rather than "NaN days ago".
 * A timestamp slightly in the future (client clock behind the server) counts
 * as "just now" instead of a negative number.
 */
const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

export function timeAgo(value, now = Date.now()) {
  if (value === null || value === undefined || value === "") return "";
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(t)) return "";

  const seconds = Math.max(0, Math.floor((now - t) / 1000));
  if (seconds < 1) return "just now";
  if (seconds < 60) return plural(seconds, "second");

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, "hour");

  const days = Math.floor(hours / 24);
  if (days < 7) return plural(days, "day");
  if (days < 30) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}
