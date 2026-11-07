// FILE PATH: frontend/src/components/TableToolbar.jsx
import { useState, useEffect, useRef } from 'react';
import { t } from '../utils/i18n';
import Icon from './ui/Icon';
import ExportMenu from './ExportMenu';

/**
 * The strip above a list: search (sent to the server after a short pause), reload, and — when `exportProps` is
 * given — the export/print menu. Everything else a page needs above its table goes in `children`.
 */
export default function TableToolbar({ search = '', onSearch, onRefresh, exportProps, placeholder, children, loading = false }) {
  const [text, setText] = useState(search);
  const first = useRef(true);
  useEffect(() => { setText(search); }, [search]);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    if (text === search) return undefined;
    const id = setTimeout(() => onSearch?.(text), 400);   // wait for the typing to pause
    return () => clearTimeout(id);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onSearch && (
        <div className="relative flex-1 min-w-[12rem] max-w-md">
          <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder || t('search')}
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          {text && <button type="button" onClick={() => { setText(''); onSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear"><Icon name="x" className="w-4 h-4" /></button>}
        </div>
      )}
      {children}
      <div className="flex items-center gap-2 ml-auto">
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={loading} title={t('refresh')} className="inline-flex items-center px-3 py-2 text-sm border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Icon name="refresh" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
        {exportProps && <ExportMenu {...exportProps} />}
      </div>
    </div>
  );
}
