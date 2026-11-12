// FILE PATH: frontend/src/pages/reports/catalog.js
/**
 * Every report BizTrack has (47), grouped by the page that shows it. A report is one entry:
 *   path / paths  the endpoint (paths = several, the first one the person may use is chosen — same data, different permission)
 *   perm          permission that opens it (the same the server checks)
 *   label         translation key of its name         dates:false → it has no date range
 *   filters       which extra filters it takes        chart → { x, ys } draws a line chart above the table;
 *                 chart.type 'bar' (+ top: N) draws the N biggest rows as bars. The column layout and totals live in layouts.js.
 * Adding a report = adding one line here (the screen, filters, table and export are generic).
 */
const R = (id, label, path, perm, extra = {}) => ({ id, label, path, perm, dates: true, filters: [], ...extra });

export const REPORT_GROUPS = {
  sales: {
    title: 'sales_reports', desc: 'sales_reports_description',
    reports: [
      R('summary', 'sales_summary_report', '/sales', 'view_sales_reports', { filters: ['saleType'] }),
      R('detailed', 'sales_detailed_report', '/sales/detailed', 'view_sales_detailed_report', { filters: ['saleType'] }),
      R('returns', 'sales_returns_report', '/sales/returns', 'view_sales_returns_report', { filters: ['salesReturnStatus'] }),
      R('comparison', 'sales_comparison_report', '/sales/comparison', 'view_sales_comparison_report', { chart: { x: 'sale_date', ys: ['total_amount', 'total_paid'] } }),
      R('by-product', 'sales_by_product_report', '/sales/by-product', 'view_sales_by_product_report', { filters: ['saleType'], chart: { type: 'bar', x: 'product_name', ys: ['total_revenue'], top: 10 } }),
      R('by-cashier', 'sales_by_cashier_report', '/sales/by-cashier', 'view_sales_by_cashier_report', { filters: ['saleType'], chart: { type: 'bar', x: 'cashier_name', ys: ['total_amount', 'total_paid'] } }),
      R('by-customer', 'sales_by_customer_report', '/sales/by-customer', 'view_sales_by_customer_report', { filters: ['saleType'], chart: { type: 'bar', x: 'customer_name', ys: ['total_amount', 'total_paid'], top: 10 } }),
      R('by-category', 'sales_by_category_report', '/sales/by-category', 'view_sales_by_category_report', { filters: ['saleType'], chart: { type: 'bar', x: 'category_name', ys: ['total_revenue'], top: 10 } }),
      R('by-payment', 'sales_by_payment_report', '/sales/by-payment-method', 'view_sales_by_payment_report', { chart: { type: 'bar', x: 'payment_method', ys: ['total_amount', 'total_paid'] } }),
      R('debits', 'sales_debits_report', '/sales/debits', 'view_sales_debits_report'),
    ],
  },
  purchases: {
    title: 'purchases_reports', desc: 'purchases_reports_description',
    reports: [
      R('summary', 'purchases_summary_report', '/purchases', 'view_purchase_reports', { filters: ['poStatus'], paths: [['/purchases', 'view_purchase_reports'], ['/purchases/summary', 'view_purchase_summary_reports']], perms: ['view_purchase_reports', 'view_purchase_summary_reports'] }),
      R('detailed', 'purchases_detailed_report', '/purchases/detailed', 'view_purchase_detailed_report', { filters: ['poStatus'] }),
      R('by-product', 'purchases_by_product_report', '/purchases/by-product', 'view_purchase_by_products_report', { filters: ['poStatus'], chart: { type: 'bar', x: 'product_name', ys: ['total_cost'], top: 10 } }),
      R('by-supplier', 'purchases_by_supplier_report', '/purchases/by-supplier', 'view_purchase_by_supplier_report', { chart: { type: 'bar', x: 'supplier_name', ys: ['total_amount'], top: 10 } }),
      R('supplier-payable', 'purchases_supplier_payable_report', '/purchases/supplier-payable', 'view_supplier_payable_report', { dates: false, chart: { type: 'bar', x: 'supplier_name', ys: ['total_invoiced', 'total_outstanding'], top: 10 } }),
      R('invoices', 'purchases_invoice_report', '/purchases/invoices', 'view_invoices_report', { filters: ['paymentStatus'] }),
      R('returns', 'purchases_returns_report', '/purchases/returns', 'view_purchase_returns_report', { filters: ['supplierReturnStatus'] }),
      R('trends', 'purchases_trends_report', '/purchases/trends', 'view_purchase_trends_report', { chart: { x: 'order_date', ys: ['total_amount'] } }),
      R('replenishment', 'purchases_replenishment_report', '/purchases/replenishment', 'view_purchase_replenishment_report', { dates: false }),
      R('cost-analysis', 'purchases_cost_analysis_report', '/purchases/cost-analysis', 'view_cost_analysis_report'),
      R('supplier-performance', 'purchases_supplier_performance_report', '/purchases/supplier-performance', 'view_supplier_performance_reports'),
      R('grn', 'purchases_grn_report', '/purchases/grn', 'view_grn_reports'),
    ],
  },
  inventory: {
    title: 'inventory_reports', desc: 'inventory_reports_description',
    reports: [
      R('current', 'current_stock', '/inventory', 'view_current_stock', { dates: false, filters: ['stockState'] }),
      R('stock-summary', 'inventory_stock_summary_report', '/inventory/stock-summary', 'view_stock_summary_reports', { filters: ['categoryId'], chart: { type: 'bar', x: 'product_name', ys: ['stock_value'], top: 10 } }),
      R('current-summary', 'current_stock_summary_report', '/inventory/current-summary', 'view_current_stock_summary_report', { dates: false, filters: ['stockState', 'categoryId'] }),
      R('current-detailed', 'current_stock_detailed_report', '/inventory/current-detailed', 'view_current_stock_detailed_report', { dates: false }),
      R('ledger', 'inventory_ledger_report', '/inventory/ledger', 'view_product_ledger_report', { filters: ['productId'] }),
      R('out-of-stock', 'out_of_stock_report', '/inventory/out-of-stock', 'view_out_of_stock_products_report', { dates: false }),
      R('below-alert', 'inventory_below_alert_report', '/inventory/below-alert', 'view_stock_below_minimum_report', { dates: false }),
      R('outgoing', 'outgoing_stock_report', '/inventory/outgoing', 'view_outgoing_products_report'),
      R('incoming', 'incoming_stock_report', '/inventory/incoming', 'view_incoming_products_report'),
      R('fast-moving', 'fast_moving_report', '/inventory/fast-moving', 'view_fast_moving_products_report', { chart: { type: 'bar', x: 'product_name', ys: ['total_value'], top: 10 } }),
      R('dead-stock', 'dead_stock_report', '/inventory/dead-stock', 'view_dead_stock_report', { chart: { type: 'bar', x: 'product_name', ys: ['stock_value'], top: 10 } }),
      R('adjustments', 'inventory_adjustments_report', '/inventory/adjustments', 'view_stock_adjustments_report'),
      R('transfers', 'inventory_transfers_report', '/inventory/transfers', 'view_stock_transfer_report'),
    ],
  },
  profit: {
    title: 'profit_reports', desc: 'profit_reports_description',
    reports: [
      R('summary', 'profit_summary_report', '/profit', 'view_profit_reports'),
      R('detailed', 'profit_detailed_report', '/profit/detailed', 'view_profit_detailed_report'),
      R('by-product', 'profit_by_product_report', '/profit/by-product', 'view_profit_by_product_report', { chart: { type: 'bar', x: 'product_name', ys: ['total_profit'], top: 10 } }),
      R('by-category', 'profit_by_category_report', '/profit/by-category', 'view_profit_by_category_report', { chart: { type: 'bar', x: 'category_name', ys: ['total_profit'], top: 10 } }),
      R('by-cashier', 'profit_by_cashier_report', '/profit/by-cashier', 'view_profit_by_cashier_report', { chart: { type: 'bar', x: 'cashier_name', ys: ['total_revenue', 'net_profit'] } }),
      R('by-customer', 'profit_by_customer_report', '/profit/by-customer', 'view_profit_by_customer_report', { chart: { type: 'bar', x: 'customer_name', ys: ['total_profit'], top: 10 } }),
      R('margins', 'profit_margins_report', '/profit/margins', 'view_profit_margins_report', { filters: ['sortBy'], chart: { type: 'bar', x: 'product_name', ys: ['total_profit'], top: 10 } }),
      R('trends', 'profit_trends_report', '/profit/trends', 'view_profit_trends_report', { filters: ['groupBy'], chart: { x: 'period', ys: ['total_revenue', 'total_profit'] } }),
    ],
  },
  expenses: {
    title: 'expenses_reports', desc: 'expenses_reports_description',
    reports: [R('payments', 'expenses_reports', '/expenses', 'view_supplier_payments', { filters: ['paymentMethod'] })],
  },
};

/** Option lists for the extra filters. value '' = all. */
export const FILTER_OPTIONS = {
  saleType: { label: 'sale_type', options: ['cash', 'credit'] },
  salesReturnStatus: { param: 'status', label: 'status', options: ['pending', 'approved', 'completed', 'rejected'] },
  poStatus: { param: 'status', label: 'status', options: ['draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled'] },
  supplierReturnStatus: { param: 'status', label: 'status', options: ['draft', 'pending_approval', 'approved', 'credited', 'cancelled'] },
  paymentStatus: { label: 'payment_status', options: ['unpaid', 'partial', 'paid'] },
  paymentMethod: { label: 'payment_method', options: ['cash', 'bank_transfer', 'cheque', 'mobile_money', 'credit_note'] },
  stockState: { label: 'stock_state', options: ['in-stock', 'low-stock', 'out-of-stock'] },
  groupBy: { label: 'group_by', options: ['day', 'week', 'month', 'year'], required: true, default: 'day' },
  sortBy: { label: 'sort_by', options: ['margin_desc', 'margin_asc', 'profit_desc', 'revenue_desc'], required: true, default: 'margin_desc' },
};
