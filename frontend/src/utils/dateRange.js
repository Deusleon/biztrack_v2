/**
 * Convert a defaultReportDateRange period key to local ISO-like boundary strings.
 * Start dates are set to 00:00:00 and end dates to 23:59:00.
 * Period values: today, yesterday, last7days, thismonth, lastmonth, thisyear, custom
 */
const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toBoundaryDateTime = (d, hours, minutes) => {
  const date = toISODate(d);
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `${date}T${hh}:${mm}:00`;
};

export const getDateRangeFromPeriod = (period) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const toStart = (date) => toBoundaryDateTime(date, 0, 0);
  const toEnd = (date) => toBoundaryDateTime(date, 23, 59);

  switch (period) {
    case "today":
      return { startDate: toStart(today), endDate: toEnd(today) };

    case "yesterday": {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return { startDate: toStart(d), endDate: toEnd(d) };
    }

    case "last7days": {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { startDate: toStart(d), endDate: toEnd(today) };
    }

    case "thismonth": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: toStart(s), endDate: toEnd(today) };
    }

    case "lastmonth": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { startDate: toStart(s), endDate: toEnd(e) };
    }

    case "thisyear": {
      const s = new Date(today.getFullYear(), 0, 1);
      const e = new Date(today.getFullYear(), 11, 31);
      return { startDate: toStart(s), endDate: toEnd(e) };
    }

    default:
      return { startDate: toStart(today), endDate: toEnd(today) };
  }
};
