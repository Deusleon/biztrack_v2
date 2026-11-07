import * as _n70 from 'express';
const express = _n70.default ?? _n70;
import * as reportController from '../controllers/report.controller.js';
import verifyToken from '../middlewares/authMiddleware.js';
import { checkPermission } from '../middlewares/checkPermission.js';
const router = express.Router();

router.get(
  '/sales',
  verifyToken,
  checkPermission('view_sales_reports'),
  reportController.getSalesReport,
);

router.get(
  '/sales/detailed',
  verifyToken,
  checkPermission('view_sales_detailed_report'),
  reportController.getSalesDetailedReport,
);

router.get(
  '/sales/returns',
  verifyToken,
  checkPermission('view_sales_returns_report'),
  reportController.getSalesReturnsReport,
);

router.get(
  '/sales/comparison',
  verifyToken,
  checkPermission('view_sales_comparison_report'),
  reportController.getSalesComparisonReport,
);

router.get(
  '/sales/by-product',
  verifyToken,
  checkPermission('view_sales_by_product_report'),
  reportController.getSalesByProductReport,
);

router.get(
  '/sales/by-cashier',
  verifyToken,
  checkPermission('view_sales_by_cashier_report'),
  reportController.getSalesByCashierReport,
);

router.get(
  '/sales/by-customer',
  verifyToken,
  checkPermission('view_sales_by_customer_report'),
  reportController.getSalesByCustomerReport,
);

router.get(
  '/sales/by-category',
  verifyToken,
  checkPermission('view_sales_by_category_report'),
  reportController.getSalesByCategoryReport,
);

router.get(
  '/sales/by-payment-method',
  verifyToken,
  checkPermission('view_sales_by_payment_report'),
  reportController.getSalesByPaymentMethodReport,
);

router.get(
  '/sales/debits',
  verifyToken,
  checkPermission('view_sales_debits_report'),
  reportController.getSalesDebitsReport,
);

router.get('/purchases', verifyToken, checkPermission('view_purchase_reports'), reportController.getPurchasesReport);
router.get('/purchases/summary', verifyToken, checkPermission('view_purchase_summary_reports'), reportController.getPurchasesReport);
router.get('/purchases/detailed', verifyToken, checkPermission('view_purchase_detailed_report'), reportController.getPurchasesDetailedReport);
router.get('/purchases/by-product', verifyToken, checkPermission('view_purchase_by_products_report'), reportController.getPurchasesByProductReport);
router.get('/purchases/by-supplier', verifyToken, checkPermission('view_purchase_by_supplier_report'), reportController.getPurchasesBySupplierReport);
router.get('/purchases/supplier-payable', verifyToken, checkPermission('view_supplier_payable_report'), reportController.getSupplierPayableReport);
router.get('/purchases/invoices', verifyToken, checkPermission('view_invoices_report'), reportController.getPurchaseInvoiceReport);
router.get('/purchases/returns', verifyToken, checkPermission('view_purchase_returns_report'), reportController.getPurchaseReturnsReport);
router.get('/purchases/trends', verifyToken, checkPermission('view_purchase_trends_report'), reportController.getPurchaseTrendsReport);
router.get('/purchases/replenishment', verifyToken, checkPermission('view_purchase_replenishment_report'), reportController.getStockReplenishmentReport);
router.get('/purchases/cost-analysis', verifyToken, checkPermission('view_cost_analysis_report'), reportController.getPurchaseCostAnalysisReport);
router.get('/purchases/supplier-performance', verifyToken, checkPermission('view_supplier_performance_reports'), reportController.getSupplierPerformanceReport);
router.get('/purchases/grn', verifyToken, checkPermission('view_grn_reports'), reportController.getGrnReport);

// Inventory reports
router.get(
  '/inventory',
  verifyToken,
  checkPermission('view_current_stock'),
  reportController.getInventoryReport,
);
router.get('/inventory/stock-summary', verifyToken, checkPermission('view_stock_summary_reports'), reportController.getStockSummaryReport);
router.get('/inventory/current-summary', verifyToken, checkPermission('view_current_stock_summary_report'), reportController.getCurrentStockSummaryReport);
router.get('/inventory/current-detailed', verifyToken, checkPermission('view_current_stock_detailed_report'), reportController.getCurrentStockDetailedReport);
router.get('/inventory/ledger', verifyToken, checkPermission('view_product_ledger_report'), reportController.getProductLedgerReport);
router.get('/inventory/out-of-stock', verifyToken, checkPermission('view_out_of_stock_products_report'), reportController.getOutOfStockReport);
router.get('/inventory/outgoing', verifyToken, checkPermission('view_outgoing_products_report'), reportController.getOutgoingStockReport);
router.get('/inventory/incoming', verifyToken, checkPermission('view_incoming_products_report'), reportController.getIncomingStockReport);
router.get('/inventory/fast-moving', verifyToken, checkPermission('view_fast_moving_products_report'), reportController.getFastMovingProductsReport);
router.get('/inventory/dead-stock', verifyToken, checkPermission('view_dead_stock_report'), reportController.getDeadStockReport);
router.get('/inventory/adjustments', verifyToken, checkPermission('view_stock_adjustments_report'), reportController.getStockAdjustmentReport);
router.get('/inventory/transfers', verifyToken, checkPermission('view_stock_transfer_report'), reportController.getStockTransferReport);
router.get('/inventory/below-alert', verifyToken, checkPermission('view_stock_below_minimum_report'), reportController.getStockBelowAlertReport);


router.get(
  '/expenses',
  verifyToken,
  checkPermission('view_supplier_payments'),
  reportController.getExpensesReport,
);

// Profit reports
router.get(
  '/profit',
  verifyToken,
  checkPermission('view_profit_reports'),
  reportController.getProfitReport,
);

router.get(
  '/profit/detailed',
  verifyToken,
  checkPermission('view_profit_detailed_report'),
  reportController.getProfitDetailedReport,
);

router.get(
  '/profit/by-product',
  verifyToken,
  checkPermission('view_profit_by_product_report'),
  reportController.getProfitByProductReport,
);

router.get(
  '/profit/by-category',
  verifyToken,
  checkPermission('view_profit_by_category_report'),
  reportController.getProfitByCategoryReport,
);

router.get(
  '/profit/by-cashier',
  verifyToken,
  checkPermission('view_profit_by_cashier_report'),
  reportController.getProfitByCashierReport,
);

router.get(
  '/profit/by-customer',
  verifyToken,
  checkPermission('view_profit_by_customer_report'),
  reportController.getProfitByCustomerReport,
);

router.get(
  '/profit/margins',
  verifyToken,
  checkPermission('view_profit_margins_report'),
  reportController.getProfitMarginsReport,
);

router.get(
  '/profit/trends',
  verifyToken,
  checkPermission('view_profit_trends_report'),
  reportController.getProfitTrendsReport,
);

// Day Report (Sales Manifest) — full transaction list + totals/profit for one day
router.get(
  '/day-report',
  verifyToken,
  checkPermission('view_sales_reports'),
  reportController.getDayReport,
);

// Net Profit Report — Total income - Purchases - All other expenses
router.get(
  '/net-profit',
  verifyToken,
  checkPermission('view_profit_reports'),
  reportController.getNetProfitReport,
);

export default router;