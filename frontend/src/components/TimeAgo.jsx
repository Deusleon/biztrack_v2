import { useState, useEffect } from "react";
import { timeAgo } from "../utils/timeAgo";
import { usePreferences } from "../contexts/PreferencesContext";

/**
 * <TimeAgo value={n.createdAt} /> — a relative time that keeps itself fresh.
 *
 * It ticks every second for the first minute (so "2 seconds ago" really
 * counts), then every 30 seconds. The timer lives in this small component,
 * so a tick re-renders only this text, never the page around it. The full
 * date and time (in the user's chosen format) shows on hover.
 */
export default function TimeAgo({ value, className = "" }) {
  const { formatDateTime } = usePreferences();
  const [now, setNow] = useState(() => Date.now());
  const ts = value ? new Date(value).getTime() : NaN;
  const valid = !Number.isNaN(ts);

  useEffect(() => {
    if (!valid) return undefined;
    const delay = now - ts < 60000 ? 1000 : 30000;
    const id = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(id);
  }, [now, ts, valid]);

  if (!valid) return null;
  return (
    <time dateTime={new Date(ts).toISOString()} title={formatDateTime(value)} className={className}>
      {timeAgo(ts, now)}
    </time>
  );
}
