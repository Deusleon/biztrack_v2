// FILE PATH: frontend/src/config/navigation.js
/**
 * ONE list of every screen in BizTrack: where it lives, what the person needs to open it, and whether it
 * has been moved to the new app yet (`ready`). The menu, the route table and the "what is left" checklist
 * all read this — a screen is never in one and forgotten in another.
 *
 *   to        the route                         labelKey  the translation key (src/lang/*.json)
 *   any       permissions — holding ANY opens it (the same permission names the server checks)
 *   ready     false → the route shows a "coming soon" page instead of the screen
 *   everyone  true  → no permission needed (just be signed in)
 *   developer true  → only for developer accounts (see hooks/useDeveloperAccess in the old app)
 */
export const ICONS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  bag: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
  cube: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  tag: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  cash: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  building: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  sliders: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 10v6m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  card: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  sparkles: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  user: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
};

export const NAVIGATION = [
  { section: 'main', items: [
    { labelKey: 'dashboard', to: '/dashboard', icon: 'home', everyone: true, ready: true },
  ] },
  { section: 'sales', items: [
    { labelKey: 'invoice_sale', to: '/sales/invoice', icon: 'cart', any: ['create_invoice'] },
    { labelKey: 'pending_orders', to: '/sales/pending', icon: 'cart', any: ['view_pending_invoices', 'view_sales'] },
    { labelKey: 'sales_history', to: '/sales/history', icon: 'cart', any: ['view_sales_records'] },
    { labelKey: 'sales_returns', to: '/sales/returns', icon: 'cart', any: ['view_sales_returns'] },
    { labelKey: 'debits', to: '/sales/debits', icon: 'cart', any: ['view_debits', 'view_credit_sales'] },
    { labelKey: 'customers', to: '/sales/customers', icon: 'users', any: ['view_customers'], ready: true },
  ] },
  { section: 'purchases', items: [
    { labelKey: 'purchase_orders', to: '/purchases/orders', icon: 'bag', any: ['view_purchase_orders'] },
    { labelKey: 'goods_received', to: '/purchases/goods-received', icon: 'bag', any: ['view_grn'] },
    { labelKey: 'suppliers', to: '/purchases/suppliers', icon: 'bag', any: ['view_suppliers'] },
    { labelKey: 'supplier_invoices', to: '/purchases/invoices', icon: 'bag', any: ['view_supplier_invoices'] },
    { labelKey: 'supplier_payments', to: '/purchases/payments', icon: 'bag', any: ['view_supplier_payments'] },
    { labelKey: 'supplier_returns', to: '/purchases/returns', icon: 'bag', any: ['view_supplier_returns'] },
  ] },
  { section: 'inventory', items: [
    { labelKey: 'products', to: '/inventory/products', icon: 'cube', any: ['view_products'], ready: true },
    { labelKey: 'current_stock', to: '/inventory/current-stock', icon: 'cube', any: ['view_current_stock'] },
    { labelKey: 'current_stock_value', to: '/inventory/stock-value', icon: 'cube', any: ['view_current_stock_value'] },
    { labelKey: 'stock_value_history', to: '/inventory/stock-value-history', icon: 'cube', any: ['view_stock_value_history'] },
    { labelKey: 'price_list', to: '/inventory/pricelist', icon: 'cube', any: ['view_price_list'] },
    { labelKey: 'stock_adjustment', to: '/inventory/adjustment', icon: 'cube', any: ['view_stock_adjustment'] },
    { labelKey: 'stock_count', to: '/inventory/stock-count', icon: 'cube', any: ['view_stock_count'] },
    { labelKey: 'stock_transfer', to: '/inventory/stock-transfer', icon: 'cube', any: ['view_stock_transfer'] },
    { labelKey: 'import_export', to: '/inventory/import-export', icon: 'cube', any: ['view_imports_exports', 'view_products'] },
  ] },
  { section: 'categories', items: [
    { labelKey: 'product_categories', to: '/categories/products', icon: 'tag', any: ['view_product_categories'], ready: true },
    { labelKey: 'price_categories', to: '/categories/prices', icon: 'tag', any: ['view_price_categories'] },
  ] },
  { section: 'reports', items: [
    { labelKey: 'sales_reports', to: '/reports/sales', icon: 'chart', any: ['view_sales_reports'] },
    { labelKey: 'day_report', to: '/reports/day-report', icon: 'chart', any: ['view_sales_reports'] },
    { labelKey: 'expenses_reports', to: '/reports/expenses', icon: 'chart', any: ['view_expense_reports', 'view_supplier_payments'] },
    { labelKey: 'purchases_reports', to: '/reports/purchases', icon: 'chart', any: ['view_purchase_reports'] },
    { labelKey: 'profit_reports', to: '/reports/profit', icon: 'chart', any: ['view_profit_reports'] },
    { labelKey: 'net_profit_reports', to: '/reports/net-profit', icon: 'chart', any: ['view_profit_reports'] },
    { labelKey: 'inventory_reports', to: '/reports/inventory', icon: 'chart', any: ['view_inventory_reports', 'view_current_stock'] },
  ] },
  { section: 'expenses', items: [
    { labelKey: 'expenses', to: '/expenses', icon: 'cash', any: ['view_expenses'] },
  ] },
  { section: 'users', items: [
    { labelKey: 'users', to: '/users/all', icon: 'users', any: ['view_users'] },
    { labelKey: 'roles', to: '/users/roles', icon: 'users', any: ['view_roles'] },
    { labelKey: 'permissions', to: '/users/permissions', icon: 'users', any: ['manage_permissions', 'view_permissions'] },
    { labelKey: 'stores', to: '/stores', icon: 'building', any: ['view_stores'] },
  ] },
  { section: 'messaging', items: [
    { labelKey: 'recently_sent', to: '/messaging/recent', icon: 'chat', any: ['view_messaging', 'manage_messaging'] },
    { labelKey: 'all_contacts', to: '/messaging/contacts', icon: 'chat', any: ['view_messaging', 'manage_contacts'] },
    { labelKey: 'groups', to: '/messaging/groups', icon: 'chat', any: ['view_messaging', 'manage_groups'] },
    { labelKey: 'templates', to: '/messaging/templates', icon: 'chat', any: ['view_messaging', 'manage_templates'] },
    { labelKey: 'account_and_topup', to: '/messaging/account', icon: 'chat', any: ['view_messaging', 'manage_messaging_account'] },
  ] },
  { section: 'settings', items: [
    { labelKey: 'configurations', to: '/settings/configurations', icon: 'sliders', any: ['view_configurations'] },
    { labelKey: 'uploads', to: '/settings/uploads', icon: 'sliders', any: ['view_uploads'] },
    { labelKey: 'bulk_operations', to: '/settings/bulk-operations', icon: 'sliders', any: ['view_bulk_operations'] },
    { labelKey: 'integration', to: '/settings/integration', icon: 'sliders', any: ['view_integration'], developer: true },
    { labelKey: 'security', to: '/settings/security', icon: 'sliders', any: ['view_security'] },
    { labelKey: 'tools', to: '/settings/tools', icon: 'sliders', any: ['view_tools'] },
    { labelKey: 'notifications', to: '/settings/notifications', icon: 'sliders', any: ['view_notifications'] },
    { labelKey: 'appearance', to: '/settings/appearance', icon: 'sliders', any: ['view_appearance'] },
  ] },
  { section: 'account', items: [
    { labelKey: 'subscription', to: '/subscription', icon: 'card', any: ['view_subscription'] },
    { labelKey: 'biztrack_ai', to: '/biztrack-ai', icon: 'sparkles', any: ['ai_access'] },
    { labelKey: 'user_manual', to: '/user-manual', icon: 'book', everyone: true },
    { labelKey: 'profile', to: '/profile', icon: 'user', everyone: true, ready: true, hidden: true },
  ] },
];

/** Every screen, flat. */
export const ALL_ITEMS = NAVIGATION.flatMap((s) => s.items.map((i) => ({ ...i, section: s.section })));

/** Permissions that open a path (longest matching route wins). */
export const itemForPath = (pathname) => [...ALL_ITEMS].sort((a, b) => b.to.length - a.to.length)
  .find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
