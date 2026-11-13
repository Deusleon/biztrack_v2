import { t } from '../utils/i18n';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const SKIP = new Set(['id', 'store_id', 'updated_at', 'created_at', 'password', 'password_hash', 'token', 'secret', 'api_key']);

function parse(d) {
  try { return typeof d === 'string' ? JSON.parse(d) : (d || {}); } catch { return { note: String(d ?? '') }; }
}

function isPair(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && (('old' in v && 'new' in v) || ('before' in v && 'after' in v));
}

function changed(a, b) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

function diff(before, after) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  return keys
    .filter((field) => !SKIP.has(field) && changed(before?.[field], after?.[field]))
    .map((field) => ({ field, before: before?.[field] ?? null, after: after?.[field] ?? null }));
}

function nounKey(action) {
  return String(action || 'record').replace(/^(create|update|delete|add|remove|insert)_/, '') || 'record';
}

/** Turn a stored description into EduTrack-style change sections. */
export function describeActivity(raw, action) {
  const data = parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { changes: [], legacy: true, submitted: { note: String(raw ?? '') } };
  }
  if (Array.isArray(data.changes) && data.changes.length) return { changes: data.changes, legacy: false };

  if (data.old && data.new && typeof data.old === 'object' && typeof data.new === 'object' && !Array.isArray(data.old)) {
    const extra = { ...data };
    delete extra.old;
    delete extra.new;
    return { changes: [{ op: 'update', label: nounKey(action), fields: diff(data.old, data.new) }], extra, legacy: false };
  }

  const pairs = Object.entries(data).filter(([, v]) => isPair(v));
  if (pairs.length > 0 && pairs.length >= Math.ceil(Object.keys(data).length / 2)) {
    return {
      changes: [{
        op: 'update',
        label: nounKey(action),
        fields: pairs.map(([field, v]) => ({ field, before: v.before ?? v.old ?? null, after: v.after ?? v.new ?? null })),
      }],
      legacy: false,
    };
  }

  if (/delete|remove/.test(action || '')) return { changes: [{ op: 'delete', label: nounKey(action), data }], legacy: false };
  if (/create|add|insert/.test(action || '')) return { changes: [{ op: 'create', label: nounKey(action), data }], legacy: false };
  return { changes: [], legacy: true, submitted: data };
}

function Value({ value, lang, tone }) {
  if (value === null || value === undefined || value === '') return <span className="text-gray-400 italic">{t('empty_value', lang)}</span>;
  if (value === '[hidden]') return <span className="text-gray-500 italic">{t('hidden_for_security', lang)}</span>;
  if (typeof value === 'boolean') return <span className={tone}>{t(value ? 'yes' : 'no', lang)}</span>;
  if (typeof value === 'object') return <code className={`text-xs break-all ${tone}`}>{JSON.stringify(value)}</code>;
  if (typeof value === 'string' && UUID_RE.test(value)) return <span className={`${tone} font-mono text-xs`} title={value}>{value.slice(0, 8)}…</span>;
  if (typeof value === 'string' && ISO_DATETIME.test(value)) return <span className={tone}>{new Date(value).toLocaleString()}</span>;
  return <span className={`${tone} break-words`}>{String(value)}</span>;
}

function KeyValueList({ data, lang }) {
  const entries = Object.entries(data || {}).filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return <p className="text-sm text-gray-400 italic">{t('nothing_recorded', lang)}</p>;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
      {entries.map(([field, value]) => (
        <div key={field} className="min-w-0">
          <dt className="text-xs text-gray-500">{t(field, lang)}</dt>
          <dd className="text-sm text-gray-900"><Value value={value} lang={lang} tone="" /></dd>
        </div>
      ))}
    </dl>
  );
}

const OP = { create: 'log_created', update: 'log_updated', delete: 'log_deleted' };

function ChangeSection({ change, lang }) {
  const kind = change.op === 'create' ? 'create' : String(change.op || '').includes('delete') ? 'delete' : 'update';
  const heading = `${t(OP[kind] || 'log_updated', lang)} ${t(change.label || 'record', lang)}`;
  return (
    <section className="border border-gray-200 rounded">
      <header className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <h4 className="text-sm font-semibold text-gray-900">{heading}</h4>
      </header>
      <div className="px-4 py-3">
        {kind === 'update' && (
          (change.fields || []).length === 0
            ? <p className="text-sm text-gray-400">{t('no_field_changed', lang)}</p>
            : (
              <div className="overflow-x-auto">
                <table className="table-cards w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 text-left">
                      <th className="py-1.5 pr-4 font-medium w-1/4">{t('field', lang)}</th>
                      <th className="py-1.5 pr-4 font-medium">{t('before', lang)}</th>
                      <th className="py-1.5 font-medium">{t('after', lang)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(change.fields || []).map((f) => (
                      <tr key={f.field} className="border-t border-gray-100 align-top">
                        <td className="py-2 pr-4 text-gray-600">{t(f.field, lang)}</td>
                        <td className="py-2 pr-4"><span className="inline-block rounded bg-red-50 px-2 py-0.5"><Value value={f.before} lang={lang} tone="text-red-800" /></span></td>
                        <td className="py-2"><span className="inline-block rounded bg-green-50 px-2 py-0.5"><Value value={f.after} lang={lang} tone="text-green-800" /></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        )}
        {kind === 'create' && (
          <>
            <p className="text-xs text-gray-500 mb-2">{t('created_with_these_details', lang)}</p>
            <KeyValueList data={change.data} lang={lang} />
          </>
        )}
        {kind === 'delete' && (
          <>
            <p className="text-xs text-gray-500 mb-2">{t('deleted_record_looked_like', lang)}</p>
            <KeyValueList data={change.data} lang={lang} />
          </>
        )}
      </div>
    </section>
  );
}

/** Before/after view for one activity-log row. */
export default function ActivityLogView({ entry, lang, showTechnical, onToggleTechnical }) {
  const view = describeActivity(entry?.description, entry?.action);
  const when = entry?.created_at ? new Date(entry.created_at).toLocaleString() : '—';
  return (
    <div className="space-y-4 text-left">
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 border border-gray-200 rounded px-4 py-3">
        <div><dt className="text-xs text-gray-500">{t('done_by', lang)}</dt><dd className="text-sm text-gray-900">{entry?.user_name || t('system', lang)}</dd>{entry?.user_email && <dd className="text-xs text-gray-500 break-all">{entry.user_email}</dd>}</div>
        <div><dt className="text-xs text-gray-500">{t('when', lang)}</dt><dd className="text-sm text-gray-900">{when}</dd></div>
        <div><dt className="text-xs text-gray-500">{t('action', lang)}</dt><dd className="text-sm text-gray-900">{t(entry?.action || 'record', lang)}</dd></div>
        <div><dt className="text-xs text-gray-500">{t('from', lang)}</dt><dd className="text-sm text-gray-900">{entry?.ip_address || '—'}</dd></div>
      </dl>

      {view.legacy && (
        <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-sm text-amber-800">{t('log_recorded_before_history', lang)}</div>
      )}

      {view.changes.map((change, i) => <ChangeSection key={`${change.op}-${i}`} change={change} lang={lang} />)}
      {view.extra && Object.keys(view.extra).length > 0 && <KeyValueList data={view.extra} lang={lang} />}

      {view.changes.length === 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">{view.legacy ? t('submitted_data', lang) : t('no_record_changed', lang)}</p>
          {view.submitted && <KeyValueList data={view.submitted} lang={lang} />}
        </div>
      )}

      <div className="border-t border-gray-100 pt-3">
        <button type="button" onClick={onToggleTechnical} className="text-xs text-gray-500 hover:text-gray-700">{showTechnical ? '▾' : '▸'} {t('technical_details', lang)}</button>
        {showTechnical && (
          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
            <div><dt className="text-gray-500">{t('entry_id', lang)}</dt><dd className="font-mono text-gray-800 break-all">{entry?.id || '—'}</dd></div>
            <div><dt className="text-gray-500">IP</dt><dd className="font-mono text-gray-800 break-all">{entry?.ip_address || '—'}</dd></div>
          </dl>
        )}
      </div>
    </div>
  );
}
