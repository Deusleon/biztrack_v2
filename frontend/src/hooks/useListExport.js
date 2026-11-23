// FILE PATH: frontend/src/hooks/useListExport.js
import { useMemo, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { t } from '../utils/i18n';

/** The text a table cell shows. Badges and icons carry no children, so the raw value (translated) is the fallback. */
const nodeText = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  // A name over a phone number is two elements: keep them apart. Plain text fragments stay joined ("+" then "5").
  if (Array.isArray(node)) {
    return node.reduce((out, child, i) => {
      const text = nodeText(child);
      if (!text) return out;
      const apart = out && (typeof child === 'object' || typeof node[i - 1] === 'object');
      return out + (apart ? ' ' : '') + text;
    }, '');
  }
  if (node?.props?.children !== undefined) return nodeText(node.props.children);
  return '';
};

const SKIP = new Set(['actions', 'image', 'select', 'image_url']);

/**
 * Turns the columns a page already shows in its table into what ExportMenu needs, so a PDF / Excel / print of a list
 * has exactly the columns and figures on screen, with the page's own index numbers.
 *
 *   const exp = useListExport({ columns, list, fetcher: fetchOrders });
 *   can('export_purchases_pdf') && <ExportMenu rows={exp.rows} columns={exp.columns} loadRows={exp.loadAllRows} title="purchase_orders" />
 *
 * columns  the page's DataTable columns ({ key, label, render?(row, index) })
 * list     the useServerList result (rows, pagination, filters)
 * fetcher  the page's server fetcher; when given, "export" downloads every page of the current filters, not just the visible one
 */
export default function useListExport({ columns, list, fetcher }) {
  const { lang } = useLanguage();
  const exportColumns = useMemo(
    () => [{ key: 'index', title: 'no.' }, ...columns.filter((c) => c.key && !SKIP.has(c.key)).map((c) => ({ key: c.key, title: c.label, type: c.type }))],
    [columns],
  );
  const toRows = useCallback((rows, offset = 0) => rows.map((row, i) => {
    const out = { index: `${offset + i + 1}.` };
    for (const col of columns) {
      if (!col.key || SKIP.has(col.key)) continue;
      let text = '';
      try { text = nodeText(col.render ? col.render(row, i) : row[col.key]); } catch { text = ''; }
      if (text === '' && row[col.key] !== null && row[col.key] !== undefined && typeof row[col.key] !== 'object') {
        const raw = String(row[col.key]);
        const translated = t(raw.toLowerCase(), lang);
        text = translated === raw.toLowerCase() ? raw : translated;
      }
      out[col.key] = text === '' ? '' : text;
    }
    return out;
  }), [columns, lang]);

  const offset = ((list.pagination?.currentPage || 1) - 1) * (list.pagination?.limit || 0);
  const rows = useMemo(() => toRows(list.rows || [], offset), [toRows, list.rows, offset]);

  const loadAllRows = fetcher ? async () => {
    const all = []; let page = 1; let pages = 1;
    do {
      const r = await fetcher({ ...list.filters, page, limit: 100 });
      all.push(...(r.data || []));
      pages = r.pagination?.totalPages || 1; page += 1;
    } while (page <= pages && page <= 200);
    return toRows(all);
  } : undefined;

  return { columns: exportColumns, rows, loadAllRows };
}
