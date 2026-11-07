
/**
 * DataTable — reusable table component.
 *
 * Props
 * ─────
 * columns      {Array}   Required. Each entry: { key, label, render?, sortable?, align?, width? }
 *                          render(row, index) → ReactNode  — custom cell renderer
 *                          align: "left"|"center"|"right"  (default "left")
 * data         {Array}   Required. Array of row objects.
 * loading      {boolean} Shows spinner overlay.
 * emptyMessage {string}  Text shown when data is empty. Default: "No records found"
 * emptyIcon    {ReactNode} SVG/icon shown in empty state.
 *
 * Checkbox selection
 * selectable   {boolean}           Adds a checkbox column.
 * selectedIds  {Array<string>}     Currently selected IDs.
 * rowId        {string|Function}   Key name or fn(row)→id used for selection. Default "id".
 * onSelectAll  {Function}          (e: Event) → void
 * onSelectRow  {Function}          (id: string) → void
 *
 * Sorting
 * sortBy       {string}   Current sort column key.
 * sortOrder    {string}   "ASC"|"DESC"
 * onSort       {Function} (key: string) → void
 *
 * Actions column
 * renderActions {Function} (row, index) → ReactNode — renders the last "Actions" cell.
 *
 * Footer / totals row
 * footer       {ReactNode} A full <tr>...</tr> (or several), rendered inside
 *                          a <tfoot> below the body — e.g. a bold "Total"
 *                          row for a report. The caller writes the <td>s
 *                          itself (including any colSpan needed), since a
 *                          totals row rarely maps one-to-one onto `columns`.
 *
 * Pagination
 * pagination   { currentPage, totalPages, totalItems, limit }
 * onPageChange {Function}  (page: number) → void
 */
export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = "No records found",
  emptyIcon,
  selectable = false,
  selectedIds = [],
  rowId = "id",
  onSelectAll,
  onSelectRow,
  sortBy,
  sortOrder = "ASC",
  onSort,
  renderActions,
  footer,
  pagination,
  onPageChange,
}) {

  const getRowId = (row, idx) =>
    typeof rowId === "function" ? rowId(row, idx) : row[rowId];

  const allSelected =
    data.length > 0 && selectedIds.length === data.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  // ── helpers ──────────────────────────────────────────────────────────────

  const alignClass = (align) => {
    if (align === "center") return "text-center";
    if (align === "right") return "text-right";
    return "text-left";
  };

  const SortIcon = ({ colKey }) => {
    if (sortBy !== colKey) {
      return (
        <svg className="w-3.5 h-3.5 text-gray-300 ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 8V4m0 12l-4-4m4 4l4-4" />
        </svg>
      );
    }
    return sortOrder === "ASC" ? (
      <svg className="w-3.5 h-3.5 text-primary ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3.5 h-3.5 text-primary ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-white p-8 rounded shadow text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-sm text-gray-500 mt-2">Loading…</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white p-10 rounded shadow text-center">
        {emptyIcon ?? (
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 17v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m0 0h14m-14 0a2 2 0 002 2h10a2 2 0 002-2m0 0V9a2 2 0 00-2-2h-2a2 2 0 00-2 2v8" />
          </svg>
        )}
        <p className="text-gray-500 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Phones: one card per row (the first column is the title; the rest are label / value pairs). */}
      <div className="md:hidden space-y-2">
        {data.map((row, idx) => {
          const id = getRowId(row, idx);
          const isSelected = selectedIds.includes(id);
          const [first, ...rest] = columns;
          const cell = (col) => (col.render ? col.render(row, idx) : row[col.key] ?? <span className="text-gray-400">—</span>);
          return (
            <div key={id ?? idx} className={`bg-white rounded shadow p-3 text-left ${isSelected ? "ring-2 ring-primary" : ""}`}>
              <div className="flex items-start gap-3">
                {selectable && (
                  <input type="checkbox" checked={isSelected} onChange={() => onSelectRow?.(id)} className="mt-1 w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary" />
                )}
                <div className="min-w-0 flex-1 text-sm font-medium text-gray-900">{first && cell(first)}</div>
              </div>
              {rest.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {rest.map((col) => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-gray-400">{col.label}</dt>
                      <dd className="text-gray-700 break-words">{cell(col)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {renderActions && <div className="mt-3 pt-2 border-t border-gray-100 flex flex-wrap justify-end gap-1">{renderActions(row, idx)}</div>}
            </div>
          );
        })}
      </div>

      <div className="hidden md:block bg-white rounded shadow overflow-x-auto lg:overflow-visible">
        <table className="min-w-full divide-y divide-gray-200">
          {/* ── thead ── */}
          <thead className="bg-gray-50">
            <tr>
              {selectable && (
                <th className="px-5 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={onSelectAll}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${alignClass(col.align)} ${col.sortable && onSort ? "cursor-pointer select-none hover:text-gray-700" : ""} ${col.width ?? ""}`}
                  onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                >
                  {col.label}
                  {col.sortable && onSort && <SortIcon colKey={col.key} />}
                </th>
              ))}
              {renderActions && (
                <th className="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>

          {/* ── tbody ── */}
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row, idx) => {
              const id = getRowId(row, idx);
              const isSelected = selectedIds.includes(id);
              return (
                <tr
                  key={id ?? idx}
                  className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-primary-5" : ""}`}
                >
                  {selectable && (
                    <td className="px-5 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectRow?.(id)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-5 py-2 text-sm text-gray-700 ${alignClass(col.align)}`}
                    >
                      {col.render ? col.render(row, idx) : row[col.key] ?? <span className="text-gray-400">—</span>}
                    </td>
                  ))}
                  {renderActions && (
                    <td className="px-3 py-2 text-center whitespace-nowrap text-sm font-medium">
                      {renderActions(row, idx)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          {footer && <tfoot className="bg-gray-50 border-t-2 border-gray-200">{footer}</tfoot>}
        </table>
      </div>

      {/* ── Pagination ── */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white px-4 sm:px-5 py-3 rounded shadow text-sm text-gray-600">
          <span>
            Showing page <strong>{pagination.currentPage}</strong> of{" "}
            <strong>{pagination.totalPages}</strong>
            {pagination.totalItems != null && (
              <> &nbsp;·&nbsp; {pagination.totalItems} total records</>
            )}
          </span>
          <div className="flex items-center justify-center sm:justify-start space-x-1">
            <button
              onClick={() => onPageChange?.(1)}
              disabled={pagination.currentPage === 1}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="First page"
            >
              «
            </button>
            <button
              onClick={() => onPageChange?.(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>

            {/* Page number pills (phones keep first / previous / next / last) */}
            <span className="hidden sm:contents">
            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
              .filter((p) => {
                const cur = pagination.currentPage;
                return p === 1 || p === pagination.totalPages || Math.abs(p - cur) <= 1;
              })
              .reduce((acc, p, i, arr) => {
                if (i > 0 && p - arr[i - 1] > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 py-1 text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => onPageChange?.(p)}
                    className={`px-3 py-1 rounded border text-sm font-medium transition-colors ${
                      p === pagination.currentPage
                        ? "bg-primary text-white border-primary"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </span>

            <button
              onClick={() => onPageChange?.(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
            <button
              onClick={() => onPageChange?.(pagination.totalPages)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Last page"
            >
              »
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
