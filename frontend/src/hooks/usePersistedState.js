import { useState } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * usePersistedState — drop-in replacement for `useState(initial)` that
 * remembers its value per-page (keyed by the current route) for the
 * lifetime of the browser tab (sessionStorage). Used for list-page
 * filters/pagination so navigating away (e.g. to a detail page) and
 * pressing "Back" restores exactly what was on screen, instead of
 * resetting to the default filters.
 *
 * `key` should be a short, page-unique string (e.g. "students-filters")
 * — the current pathname is folded in automatically so the same key used
 * on two different routes never collides.
 */
export function usePersistedState(key, initialValue) {
  const location = useLocation();
  const storageKey = `biztrack:${location.pathname}:${key}`;

  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setPersistedValue = (updater) => {
    setValue((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* e.g. storage full/disabled — non-fatal */ }
      return next;
    });
  };

  return [value, setPersistedValue];
}
