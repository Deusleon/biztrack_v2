import { useMemo, useState } from 'react';
import { t } from '../../utils/i18n';

/** Tick saved contacts instead of typing their numbers. Selection is by id, so a search does not clear it. */
export default function ContactPicker({ contacts = [], selectedIds = [], onChange, loading = false, lang }) {
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (!c.phone) return false;
      if (selectedOnly && !selected.has(c.id)) return false;
      if (!q) return true;
      return `${c.name || ''} ${c.phone}`.toLowerCase().includes(q);
    });
  }, [contacts, search, selectedOnly, selected]);

  const allVisible = visible.length > 0 && visible.every((c) => selected.has(c.id));
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisible) visible.forEach((c) => next.delete(c.id));
    else visible.forEach((c) => next.add(c.id));
    onChange([...next]);
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('ui_search_placeholder', lang)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={allVisible} disabled={visible.length === 0} onChange={toggleAll} />
            {t('select_all_shown', lang)} ({visible.length})
          </label>
          <label className="flex items-center gap-1.5 text-gray-700 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={selectedOnly} onChange={(e) => setSelectedOnly(e.target.checked)} />
            {t('selected_only', lang)}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-primary">{t('n_selected', lang, { count: selectedIds.length })}</span>
          {selectedIds.length > 0 && <button type="button" className="text-gray-500 hover:text-red-600 underline" onClick={() => onChange([])}>{t('clear_selection', lang)}</button>}
        </div>
      </div>
      <div className="border border-gray-200 rounded max-h-64 overflow-y-auto divide-y divide-gray-100">
        {loading && <p className="p-4 text-sm text-gray-400 text-center">{t('loading_data', lang)}</p>}
        {!loading && visible.length === 0 && <p className="p-4 text-sm text-gray-400 text-center">{contacts.length === 0 ? t('no_contacts_yet', lang) : t('ui_nothing_matches', lang)}</p>}
        {visible.map((c) => (
          <label key={c.id} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${selected.has(c.id) ? 'bg-primary-5' : ''}`}>
            <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
            <span className="min-w-0 flex-1">
              <span className="block text-gray-900 truncate">{c.name || c.phone}</span>
              {c.name && <span className="block text-xs text-gray-500 truncate">{c.phone}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
