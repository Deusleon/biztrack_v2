// FILE PATH: frontend/src/hooks/useServerList.js
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { usePersistedState } from './usePersistedState';
import { useStore } from '../contexts/StoreContext';
import { useToast } from '../contexts/ToastContext';
import { useStoreSettings } from './useStoreSettings';
import { reportDates } from '../utils/dateRange';

const DATE_PAIRS = [['startDate', 'endDate'], ['from_date', 'to_date']];

function datePair(filters) {
  return DATE_PAIRS.find(([start, end]) => Object.prototype.hasOwnProperty.call(filters || {}, start) && Object.prototype.hasOwnProperty.call(filters || {}, end)) || null;
}

/**
 * The list half of every EduTrack-style page, in one place: filters and page number that survive leaving the page
 * and pressing Back, a search box that waits for the person to stop typing, loading state, and an error toast.
 *
 *   const list = useServerList({ fetcher: categoryService.getAll });
 *   list.rows · list.loading · list.pagination · list.filters · list.setFilter('search', 'x') · list.setPage(2) · list.reload()
 *
 * The page NEVER edits `rows` itself: after a save or delete it calls `reload()`, so what is on screen is always what the
 * server holds. `fetcher({ page, limit, ...filters })` must resolve with { data, pagination }.
 */
export default function useServerList({ fetcher, initialFilters = { search: '' }, limit = 25, enabled = true }) {
  const { currentStore } = useStore();
  const { settings, loading: settingsLoading } = useStoreSettings();
  const { showError } = useToast();
  const [filters, setFilters] = usePersistedState('filters', initialFilters);
  const [page, setPageState] = usePersistedState('page', 1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalItems: 0, limit });
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);   // optional totals a list endpoint sends along (credit sales, returns…)
  const [searchText, setSearchText] = useState(filters.search || '');
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  const datesEdited = useRef(false);
  useLayoutEffect(() => { fetcherRef.current = fetcher; });

  const period = settings?.defaultReportDateRange;
  const configured = reportDates(period);
  const dateKeys = datePair(initialFilters);
  const scope = `${currentStore?.id || ''}:${period || ''}`;
  const scopeRef = useRef(scope);
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    datesEdited.current = false;
  }
  const datesReady = !dateKeys || datesEdited.current || (configured
    ? filters[dateKeys[0]] === configured.startDate && filters[dateKeys[1]] === configured.endDate
    : !settingsLoading);

  useEffect(() => {
    if (!dateKeys || !configured || datesEdited.current) return;
    const [start, end] = dateKeys;
    if (filters[start] === configured.startDate && filters[end] === configured.endDate) return;
    setFilters((current) => ({ ...current, [start]: configured.startDate, [end]: configured.endDate }));
    setPageState(1);
  }, [configured?.startDate, configured?.endDate, currentStore?.id, period, dateKeys?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    if (!enabled || !datesReady) return;
    const mine = ++seq.current;                       // a slow answer for an old search must not overwrite a newer one
    try {
      setLoading(true);
      const res = await fetcherRef.current({ ...filters, page, limit });
      if (mine !== seq.current) return;
      setRows(res.data || []);
      setSummary(res.summary ?? null);
      setPagination({ ...res.pagination, limit });
      // Deleted the last row of the last page: step back one page instead of showing an empty table.
      if ((res.data || []).length === 0 && page > 1 && res.pagination?.totalPages && page > res.pagination.totalPages) setPageState(res.pagination.totalPages);
    } catch (err) {
      if (mine === seq.current) showError(err.message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [enabled, filters, page, limit, currentStore?.id, datesReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  // Search: apply 350 ms after the last keystroke, from page 1.
  useEffect(() => {
    if (searchText === (filters.search || '')) return undefined;
    const timer = setTimeout(() => { setFilters((f) => ({ ...f, search: searchText })); setPageState(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchText]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (name, value) => {
    if (name === 'search') { setSearchText(value); return; }
    if (dateKeys && (name === dateKeys[0] || name === dateKeys[1])) datesEdited.current = true;
    setFilters((f) => ({ ...f, [name]: value }));
    setPageState(1);
  };

  return { rows, loading, summary, pagination, filters, searchText, setFilter, setPage: setPageState, reload, hasFilters: Object.values(filters).some(Boolean) };
}
