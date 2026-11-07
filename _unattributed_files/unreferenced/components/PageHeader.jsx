// FILE PATH: frontend/src/components/PageHeader.jsx
/** Title + one-line description on the left, the page's main buttons on the right — the same on every screen. */
export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header flex items-center justify-between flex-wrap gap-3">
      <div className="text-left min-w-0">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </div>
  );
}
