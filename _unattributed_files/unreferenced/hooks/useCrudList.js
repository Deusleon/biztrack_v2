// FILE PATH: frontend/src/hooks/useCrudList.js
import { useState, useEffect, useCallback, useRef } from 'react';
import { usePersistedState } from './usePersistedState';
import { useToast } from '../contexts/ToastContext';
import { useStore } from '../contexts/StoreContext';
import useLiveRefresh from './useLiveRefresh';
import { t } from '../utils/i18n';

/**
 * The way EVERY list screen in the system works — EduTrack's flow, written once:
 *
 *   load      the page asks the server for exactly the rows on screen (search + page), shows a spinner, and on
 *             failure shows the reason in a toast and a retry-able empty table;
 *   change    add / edit / delete go to the server first; only when it says yes does the page show a success toast,
 *             close the dialog and LOAD THE LIST AGAIN — the screen never edits its own copy of the data, so what
 *             you see is what the server holds;
 *   remember  search text and page are kept for the tab, so "back" returns to the same place;
 *   live      when someone else changes the same records, the list reloads by itself (socket events, optional).
 *
 *   const list = useCrudList({ key: 'categories', service: categoryService, live: ['categoryCreated', ...] });
 *
 * Returned: rows, loading, filters / setFilter(name, value) / resetFilters, pagination / setPage / setLimit, reload,
 * and for the add/edit dialog + delete confirmation: modal, openCreate, openEdit(row), closeModal, saving, save(payload),
 * confirm, askDelete(row), doDelete(), deleting.
 *
 * `service` needs getAll(params), create(data), update(id, data), remove(id) — each answering the contract in services/api.js.
 */
export default function useCrudList({
  key,
  service,
  defaults = { search: '' },
  limit = 25,
  live = [],
  mapParams,                 // (filters, pagination) => params, when the server wants other names
  messages = {},             // { created, updated, deleted, loadFailed } — overrides of the toast texts
  enabled = true,
}) {
  const { showSuccess, showError } = useToast();
  const { currentStore } = useStore();
  const storeId = currentStore?.id;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filters, setFilters] = usePersistedState(`${key}-filters`, defaults);
  const [pagination, setPagination] = usePersistedState(`${key}-pagination`, { currentPage: 1, totalPages: 1, totalItems: 0, limit });
  const [extra, setExtra] = useState({});                       // anything else the server sends with the list (totals…)

  const [modal, setModal] = useState({ isOpen: false, mode: 'create', row: null });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({ isOpen: false, row: null });
  const [deleting, setDeleting] = useState(false);

  // Only the answer to the LATEST request may update the screen (a slow earlier answer must not overwrite a newer one).
  const requestId = useRef(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled || !storeId) return;
    const id = ++requestId.current;
    try {
      if (!silent) setLoading(true);
      setLoadError(null);
      const base = { ...filters, page: pagination.currentPage, limit: pagination.limit };
      const res = await service.getAll(mapParams ? mapParams(filters, pagination) : base);
      if (id !== requestId.current) return;
      setRows(res.data || []);
      setPagination((p) => ({ ...p, ...res.pagination }));
      const { data, pagination: _p, success, message, raw, ...rest } = res; // eslint-disable-line no-unused-vars
      setExtra(rest);
    } catch (err) {
      if (id !== requestId.current) return;
      setLoadError(err);
      showError(err.message || messages.loadFailed || t('something_went_wrong'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storeId, JSON.stringify(filters), pagination.currentPage, pagination.limit]);

  useEffect(() => { load(); }, [load]);

  // A different store has different data: go back to the first page of it.
  const firstStore = useRef(storeId);
  useEffect(() => {
    if (firstStore.current === storeId) return;
    firstStore.current = storeId;
    setPagination((p) => ({ ...p, currentPage: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useLiveRefresh(live, () => load({ silent: true }));

  const setFilter = (name, value) => {
    setFilters((f) => ({ ...f, [name]: value }));
    setPagination((p) => ({ ...p, currentPage: 1 }));
  };
  const resetFilters = () => { setFilters(defaults); setPagination((p) => ({ ...p, currentPage: 1 })); };
  const setPage = (page) => setPagination((p) => ({ ...p, currentPage: page }));
  const setLimit = (n) => setPagination((p) => ({ ...p, limit: n, currentPage: 1 }));

  // ── add / edit ──────────────────────────────────────────────────────────────────────────────────
  const openCreate = () => setModal({ isOpen: true, mode: 'create', row: null });
  const openEdit = (row) => setModal({ isOpen: true, mode: 'edit', row });
  const closeModal = () => setModal((m) => ({ ...m, isOpen: false }));

  /** Sends the form. Returns true when the server accepted it (the dialog is then closed and the list reloaded). */
  const save = async (payload) => {
    try {
      setSaving(true);
      const res = modal.mode === 'edit' ? await service.update(modal.row.id, payload) : await service.create(payload);
      showSuccess(res.message || (modal.mode === 'edit' ? messages.updated : messages.created) || t('saved_successfully'));
      closeModal();
      await load({ silent: true });
      return true;
    } catch (err) {
      showError(err.message || t('something_went_wrong'));
      return false;
    } finally { setSaving(false); }
  };

  // ── delete ──────────────────────────────────────────────────────────────────────────────────────
  const askDelete = (row) => setConfirm({ isOpen: true, row });
  const cancelDelete = () => setConfirm({ isOpen: false, row: null });
  const doDelete = async () => {
    if (deleting) return;                   // a second click while the first is still on its way
    const row = confirm.row;
    try {
      setDeleting(true);
      const res = await service.remove(row.id);
      showSuccess(res.message || messages.deleted || t('deleted_successfully'));
      cancelDelete();
      // Deleting the last row of the last page: step back one page instead of showing an empty one.
      if (rows.length === 1 && pagination.currentPage > 1) setPage(pagination.currentPage - 1);
      else await load({ silent: true });
    } catch (err) {
      showError(err.message || t('something_went_wrong'));
      cancelDelete();
    } finally { setDeleting(false); }
  };

  return {
    rows, loading, loadError, extra, reload: load,
    filters, setFilter, resetFilters, setFilters,
    pagination, setPage, setLimit,
    modal, openCreate, openEdit, closeModal, saving, save,
    confirm, askDelete, cancelDelete, doDelete, deleting,
  };
}
