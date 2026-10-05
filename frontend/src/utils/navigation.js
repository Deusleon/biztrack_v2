// FILE PATH: frontend/src/utils/navigation.js
/**
 * The whole menu in one place — every page of BizTrack, with the permission(s) that open it.
 * (Paths and permission names are exactly the ones BizTrack has always used, so nobody's access changes.)
 *
 *   permission      one permission opens it
 *   anyPermissions  holding ANY of these opens it
 *   (neither)       every signed-in person
 */
export const NAV_SECTIONS = [
  { key: 'main', items: [
    { label: 'dashboard', to: '/dashboard', icon: 'home' },
  ] },
  { key: 'sales', title: 'sales', items: [
    { label: 'invoice_sale', to: '/sales/invoice', icon: 'cart', permission: 'create_invoice' },
    { label: 'pending_orders', to: '/sales/pending', icon: 'clock', permission: 'view_pending_invoices' },
    { label: 'sales_history', to: '/sales/history', icon: 'receipt', permission: 'view_sales_records' },
    { label: 'sales_returns', to: '/sales/returns', icon: 'undo', permission: 'view_sales_returns' },
    { label: 'debits', to: '/sales/debits', icon: 'cash', permission: 'view_debits' },
    { label: 'customers', to: '/sales/customers', icon: 'users', permission: 'view_customers' },
  ] },
  { key: 'purchases', title: 'purchases', items: [
    { label: 'purchase_orders', to: '/purchases/orders', icon: 'receipt', permission: 'view_purchase_orders' },
    { label: 'goods_received', to: '/purchases/goods-received', icon: 'truck', permission: 'view_grn' },
    { label: 'suppliers', to: '/purchases/suppliers', icon: 'truck', permission: 'view_suppliers' },
    { label: 'supplier_invoices', to: '/purchases/invoices', icon: 'document', permission: 'view_supplier_invoices' },
    { label: 'supplier_payments', to: '/purchases/payments', icon: 'cash', permission: 'view_supplier_payments' },
    { label: 'supplier_returns', to: '/purchases/returns', icon: 'undo', permission: 'view_supplier_returns' },
  ] },
  { key: 'inventory', title: 'inventory', items: [
    { label: 'products', to: '/inventory/products', icon: 'box', permission: 'view_products' },
    { label: 'current_stock', to: '/inventory/current-stock', icon: 'layers', permission: 'view_current_stock' },
    { label: 'current_stock_value', to: '/inventory/stock-value', icon: 'cash', permission: 'view_current_stock_value' },
    { label: 'stock_value_history', to: '/inventory/stock-value-history', icon: 'chart', permission: 'view_stock_value_history' },
    { label: 'price_list', to: '/inventory/pricelist', icon: 'tag', permission: 'view_price_list' },
    { label: 'stock_adjustment', to: '/inventory/adjustment', icon: 'sliders', permission: 'view_stock_adjustment' },
    { label: 'stock_count', to: '/inventory/stock-count', icon: 'check', permission: 'view_stock_count' },
    { label: 'stock_transfer', to: '/inventory/stock-transfer', icon: 'swap', permission: 'view_stock_transfer' },
    { label: 'import_export', to: '/inventory/import-export', icon: 'upload', permission: 'view_imports_exports' },
  ] },
  { key: 'categories', title: 'categories', items: [
    { label: 'product_categories', to: '/categories/products', icon: 'tag', permission: 'view_product_categories' },
    { label: 'price_categories', to: '/categories/prices', icon: 'cash', permission: 'view_price_categories' },
  ] },
  { key: 'expenses', title: 'expenses', items: [
    { label: 'expenses', to: '/expenses', icon: 'wallet', permission: 'view_expenses' },
  ] },
  { key: 'reports', title: 'reports', items: [
    { label: 'sales_reports', to: '/reports/sales', icon: 'chart', permission: 'view_sales_reports' },
    { label: 'day_report', to: '/reports/day-report', icon: 'chart', permission: 'view_sales_reports' },
    { label: 'purchases_reports', to: '/reports/purchases', icon: 'chart', permission: 'view_purchase_reports' },
    { label: 'expenses_reports', to: '/reports/expenses', icon: 'chart', permission: 'view_supplier_payments' },
    { label: 'profit_reports', to: '/reports/profit', icon: 'chart', permission: 'view_profit_reports' },
    { label: 'net_profit_reports', to: '/reports/net-profit', icon: 'chart', permission: 'view_profit_reports' },
    { label: 'inventory_reports', to: '/reports/inventory', icon: 'chart', permission: 'view_current_stock' },
  ] },
  { key: 'people', title: 'users', items: [
    { label: 'users', to: '/users/all', icon: 'users', permission: 'view_users' },
    { label: 'roles', to: '/users/roles', icon: 'shield', permission: 'view_roles' },
    { label: 'permissions', to: '/users/permissions', icon: 'key', permission: 'manage_permissions' },
    { label: 'stores', to: '/stores', icon: 'store', permission: 'view_stores' },
  ] },
  { key: 'messaging', title: 'messaging', items: [
    { label: 'recently_sent', to: '/messaging/recent', icon: 'chat', anyPermissions: ['view_messaging', 'manage_messaging'] },
    { label: 'all_contacts', to: '/messaging/contacts', icon: 'users', anyPermissions: ['view_messaging', 'manage_contacts'] },
    { label: 'groups', to: '/messaging/groups', icon: 'users', anyPermissions: ['view_messaging', 'manage_groups'] },
    { label: 'templates', to: '/messaging/templates', icon: 'document', anyPermissions: ['view_messaging', 'manage_templates'] },
    { label: 'account_and_topup', to: '/messaging/account', icon: 'cash', anyPermissions: ['view_messaging', 'manage_messaging_account'] },
  ] },
  { key: 'settings', title: 'settings', items: [
    { label: 'configurations', to: '/settings/configurations', icon: 'cog', permission: 'view_configurations' },
    { label: 'uploads', to: '/settings/uploads', icon: 'upload', permission: 'view_uploads' },
    { label: 'bulk_operations', to: '/settings/bulk-operations', icon: 'layers', permission: 'view_bulk_operations' },
    { label: 'integration', to: '/settings/integration', icon: 'link', permission: 'view_integration' },
    { label: 'security', to: '/settings/security', icon: 'shield', permission: 'view_security' },
    { label: 'tools', to: '/settings/tools', icon: 'cog', permission: 'view_tools' },
    { label: 'notifications', to: '/settings/notifications', icon: 'bell', permission: 'view_notifications' },
    { label: 'appearance', to: '/settings/appearance', icon: 'palette', permission: 'view_appearance' },
  ] },
  { key: 'account', title: 'account', items: [
    { label: 'subscription', to: '/subscription', icon: 'card', permission: 'view_subscription' },
    { label: 'biztrack_ai', to: '/biztrack-ai', icon: 'sparkle', permission: 'ai_access' },
    { label: 'user_manual', to: '/user-manual', icon: 'book' },
  ] },
];

export const canOpen = (item, can, extras = {}) => {
  if (item.developerOnly && !extras.developer) return false;
  if (item.anyPermissions) return item.anyPermissions.some(can);
  if (item.permission) return can(item.permission);
  return true;
};

/** The permission(s) that open a page, found from its path (longest matching menu entry). */
export const itemForPath = (pathname) => {
  let best = null;
  for (const s of NAV_SECTIONS) for (const it of s.items) {
    if (pathname === it.to || pathname.startsWith(`${it.to}/`)) { if (!best || it.to.length > best.to.length) best = it; }
  }
  return best;
};

export const ICON_PATHS = {
  home: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10',
  cart: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3a1 1 0 00.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  receipt: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z',
  undo: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
  cash: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  truck: 'M8 17a2 2 0 11-4 0 2 2 0 014 0zm12 0a2 2 0 11-4 0 2 2 0 014 0zM13 16V6H3v10h1m9 0h2m0-7h3l3 3v4h-2M13 16h2',
  document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  box: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  layers: 'M12 2l9 5-9 5-9-5 9-5zm-9 10l9 5 9-5M3 17l9 5 9-5',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  tag: 'M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z',
  sliders: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 10v6m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  swap: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  upload: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M16 8l-4-4m0 0L8 8m4-4v12',
  wallet: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  key: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
  store: 'M3 9l1-5h16l1 5M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0M5 21V12m14 9V12M3 21h18',
  chat: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  cog: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  link: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  palette: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
  card: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  sparkle: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  book: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
};
