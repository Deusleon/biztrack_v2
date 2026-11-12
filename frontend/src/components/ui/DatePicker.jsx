import { useState, useRef, useEffect, useCallback, useMemo } from "react";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Parse a YYYY-MM-DD string into { year, month (0-based), day }.
 * Returns null for empty / invalid input.
 */
function parseDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

/** Format { year, month (0-based), day } → "YYYY-MM-DD" */
function toValue(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Format { year, month, day } → e.g. "May 8, 2026" */
function toDisplay(y, m, d) {
  return `${MONTHS[m]} ${d}, ${y}`;
}

/** Build the calendar grid for a given month/year */
function buildGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = [];
  let day = 1 - firstDay;
  for (let row = 0; row < 6; row++) {
    const week = [];
    for (let col = 0; col < 7; col++, day++) {
      week.push(day > 0 && day <= daysInMonth ? day : null);
    }
    grid.push(week);
    if (day > daysInMonth) break;
  }
  return grid;
}

/**
 * DatePicker — custom calendar date picker.
 *
 * Props
 * ─────
 * name        {string}    Input name
 * value       {string}    YYYY-MM-DD value (controlled)
 * onChange    {Function}  (e: { target: { name, value } }) → void
 * label       {string}    Field label
 * placeholder {string}    Placeholder text
 * min         {string}    Min date YYYY-MM-DD
 * max         {string}    Max date YYYY-MM-DD
 * required    {boolean}
 * disabled    {boolean}
 * error       {string}    Validation error message
 * className   {string}    Extra class on wrapper div
 * align       {string}    "left" (default) or "right" — which edge the
 *                          calendar popup anchors to. Use "right" for a
 *                          field near the right edge of its container
 *                          (e.g. an "End Date" field next to "Start Date"
 *                          in a modal) so the popup doesn't overflow and
 *                          cause horizontal scrolling.
 */
export default function DatePicker({
  name,
  value,
  onChange,
  label,
  placeholder = "Select date",
  min,
  max,
  required,
  disabled,
  error,
  className = "",
  align = "left",
}) {
  const parsed = parseDate(value);

  // Calendar navigation state — defaults to current month or selected month
  const today = new Date();
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const [open, setOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);

  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const [popup, setPopup] = useState(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setYearPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // The calendar is position:fixed so a table or card with overflow does not clip it.
  useEffect(() => {
    if (!open) { setPopup(null); return undefined; }
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 288;
      let left = align === "right" ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      const height = 340;
      const top = window.innerHeight - r.bottom < height && r.top > height ? r.top - height - 4 : r.bottom + 4;
      setPopup({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  // Sync view when value changes externally
  useEffect(() => {
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- follow the value only; `parsed` is a new object on every render and would undo the month the person is browsing

  const minParsed = useMemo(() => parseDate(min), [min]);
  const maxParsed = useMemo(() => parseDate(max), [max]);

  const isDayDisabled = useCallback(
    (y, m, d) => {
      const ts = new Date(y, m, d).getTime();
      if (minParsed) {
        const minTs = new Date(minParsed.year, minParsed.month, minParsed.day).getTime();
        if (ts < minTs) return true;
      }
      if (maxParsed) {
        const maxTs = new Date(maxParsed.year, maxParsed.month, maxParsed.day).getTime();
        if (ts > maxTs) return true;
      }
      return false;
    },
    [minParsed, maxParsed]
  );

  const selectDay = (day) => {
    if (!day || isDayDisabled(viewYear, viewMonth, day)) return;
    const v = toValue(viewYear, viewMonth, day);
    onChange?.({ target: { name, value: v } });
    setOpen(false);
    setYearPickerOpen(false);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const clearValue = (e) => {
    e.stopPropagation();
    onChange?.({ target: { name, value: "" } });
  };

  // Year picker: show ±6 years around viewYear
  const yearRange = Array.from({ length: 13 }, (_, i) => viewYear - 6 + i);

  const grid = buildGrid(viewYear, viewMonth);

  const displayValue = parsed ? toDisplay(parsed.year, parsed.month, parsed.day) : "";
  const todayStr = toValue(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {/* Label */}
      {label && (
        <label className="block text-sm text-left font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Input trigger */}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((o) => !o); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!disabled) setOpen((o) => !o); } }}
        className={`
          flex items-center justify-between w-full px-3 py-2.5 border rounded text-sm
          bg-white transition-colors cursor-pointer
          ${error ? "border-red-400 focus:ring-red-400" : "border-gray-300"}
          ${open && !error ? "border-primary ring-1 ring-primary" : ""}
          ${disabled ? "opacity-50 cursor-not-allowed bg-gray-50" : "hover:border-gray-400"}
        `}
      >
        {/* Calendar icon + value */}
        <div className="flex items-center space-x-2 min-w-0">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className={displayValue ? "text-gray-900 truncate" : "text-gray-400"}>
            {displayValue || placeholder}
          </span>
        </div>

        {/* Clear / chevron */}
        <div className="flex items-center space-x-1 flex-shrink-0 ml-2">
          {displayValue && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={clearValue}
              onKeyDown={(e) => { if (e.key === "Enter") clearValue(e); }}
              className="text-gray-400 hover:text-gray-600 p-0.5 rounded"
              title="Clear"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Error */}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {/* Calendar dropdown */}
      {open && popup && (
        <div className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg p-3 w-72" style={{ top: popup.top, left: popup.left }}>
          {/* ── Month / Year header ── */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setYearPickerOpen((o) => !o)}
              className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-gray-100 text-sm font-semibold text-gray-800"
            >
              <span>{MONTHS[viewMonth]} {viewYear}</span>
              <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${yearPickerOpen ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded hover:bg-gray-100 text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* ── Year picker ── */}
          {yearPickerOpen && (
            <div className="mb-3">
              <div className="grid grid-cols-4 gap-1 max-h-36 overflow-y-auto">
                {yearRange.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => { setViewYear(y); setYearPickerOpen(false); }}
                    className={`py-1.5 text-xs rounded font-medium transition-colors
                      ${y === viewYear
                        ? "bg-primary text-white"
                        : "hover:bg-gray-100 text-gray-700"}`}
                  >
                    {y}
                  </button>
                ))}
              </div>
              {/* Month picker */}
              <div className="grid grid-cols-3 gap-1 mt-2">
                {MONTHS.map((mName, mIdx) => (
                  <button
                    key={mName}
                    type="button"
                    onClick={() => { setViewMonth(mIdx); setYearPickerOpen(false); }}
                    className={`py-1 text-xs rounded font-medium transition-colors
                      ${mIdx === viewMonth
                        ? "bg-primary text-white"
                        : "hover:bg-gray-100 text-gray-700"}`}
                  >
                    {mName.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Day headers ── */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* ── Day grid ── */}
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((day, di) => {
                if (!day) return <div key={di} />;
                const dayVal = toValue(viewYear, viewMonth, day);
                const isSelected = value === dayVal;
                const isToday = dayVal === todayStr;
                const isDisabled = isDayDisabled(viewYear, viewMonth, day);
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectDay(day)}
                    className={`
                      relative flex items-center justify-center h-8 w-full text-xs rounded transition-colors
                      ${isSelected ? "bg-primary text-white font-semibold" : ""}
                      ${!isSelected && isToday ? "text-primary font-semibold ring-1 ring-primary" : ""}
                      ${!isSelected && !isToday && !isDisabled ? "text-gray-700 hover:bg-gray-100" : ""}
                      ${isDisabled ? "text-gray-300 cursor-not-allowed" : "cursor-pointer"}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          ))}

          {/* ── Today shortcut ── */}
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => {
                const y = today.getFullYear();
                const m = today.getMonth();
                const d = today.getDate();
                setViewYear(y);
                setViewMonth(m);
                if (!isDayDisabled(y, m, d)) {
                  onChange?.({ target: { name, value: todayStr } });
                  setOpen(false);
                }
              }}
              className="text-xs text-primary hover:underline font-medium"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
