/**
 * BizTrack — Canonical Permissions List
 *
 * Each entry: { name, description, module, submodule, display_no }
 *
 * HOW TO USE:
 *   - Add a new permission entry here (or edit description/module/submodule)
 *   - Run:  node DB/seeds/syncPermissions.js
 *
 * The sync script performs an UPSERT:
 *   - New permissions are INSERTED
 *   - Existing permissions have their description, module, submodule, and display_no UPDATED
 *   - No permissions are deleted (to preserve existing role assignments)
 *
 * ─── Fixes applied (2026-06-16) ──────────────────────────────────────────────
 *   - Removed duplicate display_no 64 (export_products_pdf and view_suppliers both had 64)
 *     → export_products_pdf moved to 64, view_suppliers starts at 65 (unchanged)
 *   - Removed duplicate display_no 84 (view_imports_exports and delete_stock_transfer both had 84)
 *     → view_imports_exports moved to 84.5 → renumbered to 89
 *   - Removed duplicate display_no 86 (import_stock and export_products both had 86)
 *     → export_products renumbered to 90
 *   - Removed duplicate display_no 87 (import_prices and export_stock both had 87)
 *     → export_stock renumbered to 91
 *   - view_debits (display_no 18) submodule corrected: 'Credit Sales' (was already correct but
 *     description updated to 'View debit / credit sales records' for clarity)
 *   - Reports display_no renumbered for consistent ascending order (85→100, 86→101, 87→102, 88→103)
 */

const permissions = [
  // ─── DASHBOARD ──────────────────────────────────────────────────────────────
  { name: 'view_dashboard',           description: 'Access the main dashboard',                          module: 'Dashboard',    submodule: '',                   display_no: 1   },

  // ─── SALES ──────────────────────────────────────────────────────────────────
  { name: 'create_invoice',           description: 'Create a new sales invoice',                         module: 'Sales',        submodule: 'Invoices',           display_no: 10  },
  { name: 'apply_discount',           description: 'Apply a discount on a sale',                         module: 'Sales',        submodule: 'Invoices',           display_no: 11  },
  { name: 'view_pending_invoices',    description: 'View pending sales invoices',                        module: 'Sales',        submodule: 'Pending Invoices',   display_no: 12  },
  { name: 'manage_pending_invoices',  description: 'Edit or manage a pending sale',                      module: 'Sales',        submodule: 'Pending Invoices',   display_no: 13  },
  { name: 'view_sales_records',       description: 'View sales orders and history',                      module: 'Sales',        submodule: 'Sales History',      display_no: 14  },
  { name: 'delete_sales',             description: 'Delete a sale record',                               module: 'Sales',        submodule: 'Sales History',      display_no: 15  },
  { name: 'view_sales_returns',       description: 'View sales return records',                          module: 'Sales',        submodule: 'Sales Returns',      display_no: 16  },
  { name: 'create_sales_return',      description: 'Create a sales return',                              module: 'Sales',        submodule: 'Sales Returns',      display_no: 17  },
  { name: 'view_debits',              description: 'View debit / credit sales records',                  module: 'Sales',        submodule: 'Credit Sales',       display_no: 18  },
  { name: 'view_customers',           description: 'View customer list',                                 module: 'Sales',        submodule: 'Customers',          display_no: 20  },
  { name: 'create_customers',         description: 'Add a new customer',                                 module: 'Sales',        submodule: 'Customers',          display_no: 21  },
  { name: 'update_customers',         description: 'Edit customer information',                          module: 'Sales',        submodule: 'Customers',          display_no: 22  },
  { name: 'delete_customers',         description: 'Delete a customer record',                           module: 'Sales',        submodule: 'Customers',          display_no: 23  },
  { name: 'view_credit_sales',        description: 'View credit / debit sales',                          module: 'Sales',        submodule: 'Credit Sales',       display_no: 24  },
  { name: 'manage_credit_sales',      description: 'Manage and settle credit sales',                     module: 'Sales',        submodule: 'Credit Sales',       display_no: 25  },

  // ─── PURCHASES ──────────────────────────────────────────────────────────────
  { name: 'view_purchase_orders',     description: 'View purchase orders',                               module: 'Purchases',    submodule: 'Purchase Orders',    display_no: 30  },
  { name: 'create_purchase_orders',   description: 'Create a new purchase order',                        module: 'Purchases',    submodule: 'Purchase Orders',    display_no: 31  },
  { name: 'update_purchase_orders',   description: 'Edit a purchase order',                              module: 'Purchases',    submodule: 'Purchase Orders',    display_no: 32  },
  { name: 'approve_purchase_orders',  description: 'Approve a purchase order',                           module: 'Purchases',    submodule: 'Purchase Orders',    display_no: 33  },
  { name: 'delete_purchase_orders',   description: 'Delete a purchase order',                            module: 'Purchases',    submodule: 'Purchase Orders',    display_no: 34  },

  { name: 'view_grn',                 description: 'View Goods Received Notes',                          module: 'Purchases',    submodule: 'GRN',                display_no: 35  },
  { name: 'create_grn',               description: 'Create a Goods Received Note',                       module: 'Purchases',    submodule: 'GRN',                display_no: 36  },
  { name: 'approve_grn',              description: 'Approve a Goods Received Note',                      module: 'Purchases',    submodule: 'GRN',                display_no: 37  },
  { name: 'delete_grn',               description: 'Delete a Goods Received Note',                       module: 'Purchases',    submodule: 'GRN',                display_no: 38  },

  { name: 'view_suppliers',           description: 'View supplier list',                                 module: 'Purchases',    submodule: 'Suppliers',          display_no: 65  },
  { name: 'create_suppliers',         description: 'Add a new supplier',                                 module: 'Purchases',    submodule: 'Suppliers',          display_no: 66  },
  { name: 'update_suppliers',         description: 'Edit supplier information',                          module: 'Purchases',    submodule: 'Suppliers',          display_no: 67  },
  { name: 'delete_suppliers',         description: 'Delete a supplier',                                  module: 'Purchases',    submodule: 'Suppliers',          display_no: 68  },

  { name: 'view_supplier_invoices',   description: 'View supplier invoices',                             module: 'Purchases',    submodule: 'Supplier Invoices',  display_no: 40  },
  { name: 'create_supplier_invoices', description: 'Create a supplier invoice',                          module: 'Purchases',    submodule: 'Supplier Invoices',  display_no: 41  },
  { name: 'update_supplier_invoices', description: 'Update a supplier invoice',                          module: 'Purchases',    submodule: 'Supplier Invoices',  display_no: 42  },
  { name: 'delete_supplier_invoices', description: 'Delete a supplier invoice',                          module: 'Purchases',    submodule: 'Supplier Invoices',  display_no: 43  },

  { name: 'view_supplier_payments',   description: 'View supplier payments',                             module: 'Purchases',    submodule: 'Supplier Payments',  display_no: 44  },
  { name: 'create_supplier_payments', description: 'Create a supplier payment',                          module: 'Purchases',    submodule: 'Supplier Payments',  display_no: 45  },
  { name: 'delete_supplier_payments', description: 'Delete a supplier payment',                          module: 'Purchases',    submodule: 'Supplier Payments',  display_no: 46  },

  { name: 'view_supplier_returns',    description: 'View supplier returns',                              module: 'Purchases',    submodule: 'Supplier Returns',   display_no: 47  },
  { name: 'create_supplier_returns',  description: 'Create a supplier return',                           module: 'Purchases',    submodule: 'Supplier Returns',   display_no: 48  },
  { name: 'approve_supplier_returns', description: 'Approve a supplier return',                          module: 'Purchases',    submodule: 'Supplier Returns',   display_no: 49  },
  { name: 'delete_supplier_returns',  description: 'Delete a supplier return',                           module: 'Purchases',    submodule: 'Supplier Returns',   display_no: 50  },

  // ─── EXPENSES ──────────────────────────────────────────────────────────────
  { name: 'view_expenses',            description: 'View expense records',                               module: 'Expenses',     submodule: 'Expenses',           display_no: 55  },
  { name: 'create_expenses',          description: 'Add a new expense record',                           module: 'Expenses',     submodule: 'Expenses',           display_no: 56  },
  { name: 'update_expenses',          description: 'Edit an existing expense record',                    module: 'Expenses',     submodule: 'Expenses',           display_no: 57  },
  { name: 'delete_expenses',          description: 'Delete an expense record',                           module: 'Expenses',     submodule: 'Expenses',           display_no: 58  },

  // ─── INVENTORY ──────────────────────────────────────────────────────────────
  { name: 'view_products',            description: 'View product list',                                  module: 'Inventory',    submodule: 'Products',           display_no: 60  },
  { name: 'create_products',          description: 'Add a new product',                                  module: 'Inventory',    submodule: 'Products',           display_no: 61  },
  { name: 'update_products',          description: 'Edit product information',                           module: 'Inventory',    submodule: 'Products',           display_no: 62  },
  { name: 'delete_products',          description: 'Delete a product',                                   module: 'Inventory',    submodule: 'Products',           display_no: 63  },
  { name: 'export_products_pdf',      description: 'Export product list to PDF',                         module: 'Inventory',    submodule: 'Products',           display_no: 64  },

  { name: 'view_inventory',           description: 'View inventory movements',                           module: 'Inventory',    submodule: 'Stock',              display_no: 69  },
  { name: 'view_current_stock',       description: 'View current stock levels',                          module: 'Inventory',    submodule: 'Stock',              display_no: 70  },
  { name: 'view_current_stock_value', description: 'View current stock monetary value',                  module: 'Inventory',    submodule: 'Stock',              display_no: 71  },
  { name: 'view_stock_value_history', description: 'View historical stock valuation',                    module: 'Inventory',    submodule: 'Stock',              display_no: 72  },
  { name: 'save_stock_value_history',   description: 'Save a stock valuation snapshot',                    module: 'Inventory',    submodule: 'Stock',              display_no: 209 },
  { name: 'delete_stock_value_history', description: 'Delete a saved stock valuation snapshot',            module: 'Inventory',    submodule: 'Stock',              display_no: 210 },
  { name: 'edit_batch',               description: 'Edit inventory batch details',                       module: 'Inventory',    submodule: 'Stock',              display_no: 73  },
  { name: 'export_inventory_pdf',     description: 'Export inventory reports to PDF',                    module: 'Inventory',    submodule: 'Stock',              display_no: 74  },

  { name: 'view_price_list',         description: 'View price list',                                    module: 'Inventory',    submodule: 'Price List',         display_no: 75  },
  { name: 'manage_price_list',        description: 'Add or update prices in price list',                 module: 'Inventory',    submodule: 'Price List',         display_no: 76  },

  { name: 'view_stock_adjustment',   description: 'View stock adjustments',                             module: 'Inventory',    submodule: 'Stock Adjustment',   display_no: 77  },
  { name: 'create_stock_adjustment',  description: 'Create a stock adjustment entry',                    module: 'Inventory',    submodule: 'Stock Adjustment',   display_no: 78  },

  { name: 'view_stock_count',        description: 'View stock count sessions',                          module: 'Inventory',    submodule: 'Stock Count',        display_no: 79  },
  { name: 'create_stock_count',       description: 'Start a stock count session',                        module: 'Inventory',    submodule: 'Stock Count',        display_no: 80  },
  { name: 'approve_stock_count',      description: 'Approve and apply a stock count',                    module: 'Inventory',    submodule: 'Stock Count',        display_no: 81  },

  { name: 'view_stock_transfer',     description: 'View stock transfer records',                        module: 'Inventory',    submodule: 'Stock Transfer',     display_no: 82  },
  { name: 'create_stock_transfer',    description: 'Create a stock transfer',                            module: 'Inventory',    submodule: 'Stock Transfer',     display_no: 83  },
  { name: 'approve_stock_transfer',   description: 'Approve a stock transfer',                           module: 'Inventory',    submodule: 'Stock Transfer',     display_no: 84  },
  { name: 'delete_stock_transfer',    description: 'Delete a stock transfer',                            module: 'Inventory',    submodule: 'Stock Transfer',     display_no: 85  },

  { name: 'view_imports_exports',     description: 'View import and export options',                     module: 'Inventory',    submodule: 'Import/Export',      display_no: 86  },
  { name: 'import_products',          description: 'Import products in bulk via Excel/CSV',              module: 'Inventory',    submodule: 'Import/Export',      display_no: 87  },
  { name: 'import_stock',             description: 'Import stock details in bulk via Excel/CSV',         module: 'Inventory',    submodule: 'Import/Export',      display_no: 88  },
  { name: 'import_prices',            description: 'Import price list in bulk via Excel/CSV',            module: 'Inventory',    submodule: 'Import/Export',      display_no: 89  },
  { name: 'export_products',          description: 'Export products in bulk via Excel/CSV',              module: 'Inventory',    submodule: 'Import/Export',      display_no: 90  },
  { name: 'export_stock',             description: 'Export stock details in bulk via Excel/CSV',         module: 'Inventory',    submodule: 'Import/Export',      display_no: 91  },
  { name: 'export_prices',            description: 'Export price list in bulk via Excel/CSV',            module: 'Inventory',    submodule: 'Import/Export',      display_no: 92  },

  // ─── REPORTS ────────────────────────────────────────────────────────────────
  { name: 'view_sales_reports',             description: 'View sales-related reports',                   module: 'Reports',      submodule: 'Sales Reports',            display_no: 100 },
  { name: 'view_sales_summary_report',     description: 'View sales summary report',                     module: 'Reports',      submodule: 'Sales Reports',            display_no: 101 },
  { name: 'view_sales_detailed_report',    description: 'View sales detailed report',                    module: 'Reports',      submodule: 'Sales Reports',            display_no: 102 },
  { name: 'view_sales_returns_report',     description: 'View sales returns report',                     module: 'Reports',      submodule: 'Sales Reports',            display_no: 103 },
  { name: 'view_sales_comparison_report',  description: 'View sales comparison report',                  module: 'Reports',      submodule: 'Sales Reports',            display_no: 104 },
  { name: 'view_sales_by_product_report',   description: 'View sales by product report',                 module: 'Reports',      submodule: 'Sales Reports',            display_no: 105 },
  { name: 'view_sales_by_cashier_report',   description: 'View sales by cashier report',                 module: 'Reports',      submodule: 'Sales Reports',            display_no: 106 },
  { name: 'view_sales_by_customer_report',  description: 'View sales by customer report',                module: 'Reports',      submodule: 'Sales Reports',            display_no: 107 },
  { name: 'view_sales_by_category_report',  description: 'View sales by category report',                module: 'Reports',      submodule: 'Sales Reports',            display_no: 108 },
  { name: 'view_sales_by_payment_report',   description: 'View sales by payment report',                 module: 'Reports',      submodule: 'Sales Reports',            display_no: 109 },
  { name: 'view_sales_debits_report',       description: 'View sales debits report',                     module: 'Reports',      submodule: 'Sales Reports',            display_no: 110 },
  
  { name: 'view_profit_reports',             description: 'View profit-related reports',                  module: 'Reports',      submodule: 'Profit Reports',           display_no: 111 },
  { name: 'view_profit_detailed_report',     description: 'View profit detailed report',                  module: 'Reports',      submodule: 'Profit Reports',           display_no: 112 },
  { name: 'view_profit_by_product_report',   description: 'View profit by product report',                module: 'Reports',      submodule: 'Profit Reports',           display_no: 113 },
  { name: 'view_profit_by_category_report',  description: 'View profit by category report',               module: 'Reports',      submodule: 'Profit Reports',           display_no: 114 },
  { name: 'view_profit_by_cashier_report',   description: 'View profit by cashier report',                module: 'Reports',      submodule: 'Profit Reports',           display_no: 115 },
  { name: 'view_profit_by_customer_report',  description: 'View profit by customer report',               module: 'Reports',      submodule: 'Profit Reports',           display_no: 116 },
  { name: 'view_profit_margins_report',      description: 'View profit margins report',                   module: 'Reports',      submodule: 'Profit Reports',           display_no: 117 },
  { name: 'view_profit_trends_report',       description: 'View profit trends report',                    module: 'Reports',      submodule: 'Profit Reports',           display_no: 118 },
  
  { name: 'view_inventory_reports',                     description: 'View inventory-related reports',                module: 'Reports',      submodule: 'Inventory Reports',            display_no: 101 },
  { name: 'view_stock_summary_reports',                 description: 'View stock summary reports',                    module: 'Reports',      submodule: 'Inventory Reports',            display_no: 103 },
  { name: 'view_current_stock_summary_report',          description: 'View current stock summary report',             module: 'Reports',      submodule: 'Inventory Reports',            display_no: 104 },
  { name: 'view_current_stock_detailed_report',         description: 'View current stock detailed report',            module: 'Reports',      submodule: 'Inventory Reports',            display_no: 105 },
  { name: 'view_product_ledger_report',                 description: 'View product ledger report',                    module: 'Reports',      submodule: 'Inventory Reports',            display_no: 106 },
  { name: 'view_out_of_stock_products_report',          description: 'View out-of-stock products report',             module: 'Reports',      submodule: 'Inventory Reports',            display_no: 107 },
  { name: 'view_outgoing_products_report',              description: 'View outgoing products report',                 module: 'Reports',      submodule: 'Inventory Reports',            display_no: 108 },
  { name: 'view_incoming_products_report',              description: 'View incoming products report',                 module: 'Reports',      submodule: 'Inventory Reports',            display_no: 109 },
  { name: 'view_fast_moving_products_report',           description: 'View fast-moving products report',              module: 'Reports',      submodule: 'Inventory Reports',            display_no: 110 },
  { name: 'view_dead_stock_report',                     description: 'View dead stock report',                        module: 'Reports',      submodule: 'Inventory Reports',            display_no: 111 },
  { name: 'view_stock_adjustments_report',              description: 'View stock adjustments report',                 module: 'Reports',      submodule: 'Inventory Reports',            display_no: 112 },
  { name: 'view_stock_transfer_report',                 description: 'View stock transfer report',                    module: 'Reports',      submodule: 'Inventory Reports',            display_no: 113 },
  { name: 'view_stock_below_minimum_report',            description: 'View stock below minimum report',               module: 'Reports',      submodule: 'Inventory Reports',            display_no: 114 },

  { name: 'view_purchase_reports',                  description: 'View purchase-related reports',                module: 'Reports',      submodule: 'Purchases Reports',            display_no: 102 },
  { name: 'view_purchase_summary_reports',          description: 'View purchase summary reports',                module: 'Reports',      submodule: 'Purchases Reports',            display_no: 103 },
  { name: 'view_purchase_detailed_report',          description: 'View purchase detailed report',                module: 'Reports',      submodule: 'Purchases Reports',            display_no: 104 },
  { name: 'view_purchase_by_products_report',       description: 'View purchase by products report',             module: 'Reports',      submodule: 'Purchases Reports',            display_no: 105 },
  { name: 'view_purchase_by_supplier_report',       description: 'View purchase by supplier report',             module: 'Reports',      submodule: 'Purchases Reports',            display_no: 106 },
  { name: 'view_supplier_payable_report',           description: 'View supplier payable report',                 module: 'Reports',      submodule: 'Purchases Reports',            display_no: 107 },
  { name: 'view_invoices_report',                   description: 'View invoices report',                         module: 'Reports',      submodule: 'Purchases Reports',            display_no: 108 },
  { name: 'view_purchase_returns_report',           description: 'View purchase returns report',                 module: 'Reports',      submodule: 'Purchases Reports',            display_no: 109 },
  { name: 'view_purchase_trends_report',            description: 'View purchase trends report',                  module: 'Reports',      submodule: 'Purchases Reports',            display_no: 110 },
  { name: 'view_purchase_replenishment_report',     description: 'View stock replenishment report',              module: 'Reports',      submodule: 'Purchases Reports',            display_no: 111 },
  { name: 'view_cost_analysis_report',              description: 'View purchase cost analysis report',           module: 'Reports',      submodule: 'Purchases Reports',            display_no: 112 },
  { name: 'view_supplier_performance_reports',      description: 'View supplier performance reports',            module: 'Reports',      submodule: 'Purchases Reports',            display_no: 113 },
  { name: 'view_grn_reports',                       description: 'View GRN reports',                             module: 'Reports',      submodule: 'Purchases Reports',            display_no: 114 },
  
  { name: 'view_expense_reports',           description: 'View expense-related reports',                 module: 'Reports',      submodule: 'Reports',            display_no: 103 },

  // ─── CATEGORIES ─────────────────────────────────────────────────────────────
  { name: 'view_product_categories',   description: 'View product categories',                           module: 'Categories',   submodule: 'Product Categories', display_no: 110 },
  { name: 'create_product_categories', description: 'Add a product category',                            module: 'Categories',   submodule: 'Product Categories', display_no: 111 },
  { name: 'update_product_categories', description: 'Edit a product category',                           module: 'Categories',   submodule: 'Product Categories', display_no: 112 },
  { name: 'delete_product_categories', description: 'Delete a product category',                         module: 'Categories',   submodule: 'Product Categories', display_no: 113 },
  { name: 'product_categories_pdf',    description: 'Export product categories to PDF',                  module: 'Categories',   submodule: 'Product Categories', display_no: 114 },

  { name: 'view_price_categories',    description: 'View price categories',                              module: 'Categories',   submodule: 'Price Categories',   display_no: 115 },
  { name: 'create_price_categories',  description: 'Add a price category',                               module: 'Categories',   submodule: 'Price Categories',   display_no: 116 },
  { name: 'update_price_categories',  description: 'Edit a price category',                              module: 'Categories',   submodule: 'Price Categories',   display_no: 117 },
  { name: 'delete_price_categories',  description: 'Delete a price category',                            module: 'Categories',   submodule: 'Price Categories',   display_no: 118 },
  { name: 'price_categories_pdf',     description: 'Export price categories to PDF',                     module: 'Categories',   submodule: 'Price Categories',   display_no: 119 },

  // ─── USERS & ROLES ──────────────────────────────────────────────────────────
  { name: 'view_users',               description: 'View store users',                                   module: 'Users',        submodule: 'Users',              display_no: 120 },
  { name: 'edit_users',               description: 'Edit user profile/status',                           module: 'Users',        submodule: 'Users',              display_no: 121 },
  { name: 'delete_users',             description: 'Remove a user from the store',                       module: 'Users',        submodule: 'Users',              display_no: 122 },
  { name: 'export_users_pdf',         description: 'Export user list to PDF',                            module: 'Users',        submodule: 'Users',              display_no: 123 },

  { name: 'view_roles',               description: 'View roles',                                         module: 'Users',        submodule: 'Roles',              display_no: 124 },
  { name: 'create_roles',             description: 'Create a new role',                                  module: 'Users',        submodule: 'Roles',              display_no: 125 },
  { name: 'edit_roles',               description: 'Edit role name/description',                         module: 'Users',        submodule: 'Roles',              display_no: 126 },
  { name: 'delete_roles',             description: 'Delete a role',                                      module: 'Users',        submodule: 'Roles',              display_no: 127 },
  { name: 'export_roles_pdf',         description: 'Export role list to PDF',                            module: 'Users',        submodule: 'Roles',              display_no: 128 },

  { name: 'view_permissions',         description: 'View role permissions',                              module: 'Users',        submodule: 'Permissions',        display_no: 129 },
  { name: 'manage_permissions',       description: 'Update role permissions',                            module: 'Users',        submodule: 'Permissions',        display_no: 130 },

  // ─── STORES ─────────────────────────────────────────────────────────────────
  { name: 'view_stores',              description: 'View store details',                                  module: 'Stores',       submodule: 'Stores',             display_no: 131 },
  { name: 'create_stores',            description: 'Add a new store',                                     module: 'Stores',       submodule: 'Stores',             display_no: 132 },
  { name: 'edit_stores',              description: 'Edit store information',                              module: 'Stores',       submodule: 'Stores',             display_no: 132 },
  { name: 'delete_stores',            description: 'Delete a store',                                      module: 'Stores',       submodule: 'Stores',             display_no: 133 },

  // ─── MESSAGING ──────────────────────────────────────────────────────────────
  { name: 'view_messaging',           description: 'View messaging',                                     module: 'Messaging',    submodule: 'Messaging',          display_no: 134 },
  { name: 'manage_messaging',         description: 'Manage messaging',                                   module: 'Messaging',    submodule: 'Messaging',          display_no: 135 },
  { name: 'manage_contacts',          description: 'Manage contacts',                                    module: 'Messaging',    submodule: 'Contacts',           display_no: 136 },
  { name: 'manage_groups',            description: 'Manage groups',                                      module: 'Messaging',    submodule: 'Groups',             display_no: 137 },
  { name: 'manage_templates',         description: 'Manage templates',                                   module: 'Messaging',    submodule: 'Templates',          display_no: 138 },
  { name: 'manage_messaging_account', description: 'Manage messaging account settings',                  module: 'Messaging',    submodule: 'Account',            display_no: 139 },

  // ─── SETTINGS ───────────────────────────────────────────────────────────────
  { name: 'view_configurations',      description: 'View system configurations',                         module: 'Settings',     submodule: 'Configurations',     display_no: 140 },
  { name: 'view_business_info',       description: 'View business information',                          module: 'Settings',     submodule: 'Configurations',     display_no: 141 },
  { name: 'view_system_defaults',     description: 'View system default settings',                       module: 'Settings',     submodule: 'Configurations',     display_no: 142 },
  { name: 'view_system_operations',   description: 'View system operations settings',                    module: 'Settings',     submodule: 'Configurations',     display_no: 143 },
  { name: 'edit_configurations',      description: 'Edit system configurations',                         module: 'Settings',     submodule: 'Configurations',     display_no: 144 },
  { name: 'view_uploads',             description: 'View uploads',                                       module: 'Settings',     submodule: 'Uploads',            display_no: 145 },
  { name: 'manage_uploads',           description: 'Manage uploads',                                     module: 'Settings',     submodule: 'Uploads',            display_no: 146 },
  { name: 'view_bulk_operations',     description: 'View bulk operations',                               module: 'Settings',     submodule: 'Bulk Operations',    display_no: 148 },
  { name: 'view_tools',               description: 'Access admin tools',                                 module: 'Settings',     submodule: 'Tools',              display_no: 146 },
  { name: 'view_integration',         description: 'View third-party integrations',                      module: 'Settings',     submodule: 'Integration',        display_no: 147 },
  { name: 'manage_integration',       description: 'Manage third-party integrations',                    module: 'Settings',     submodule: 'Integration',        display_no: 148 },
  { name: 'view_security',            description: 'View security settings',                             module: 'Settings',     submodule: 'Security',           display_no: 149 },
  { name: 'view_notifications',       description: 'View notification settings',                         module: 'Settings',     submodule: 'Notifications',      display_no: 150 },
  { name: 'manage_notifications',     description: 'Manage notification settings',                       module: 'Settings',     submodule: 'Notifications',      display_no: 151 },
  { name: 'view_appearance',          description: 'View appearance settings',                           module: 'Settings',     submodule: 'Appearance',         display_no: 152 },
  { name: 'view_subscription',        description: 'View subscription status and billing history',        module: 'Settings',     submodule: 'Subscription',       display_no: 153 },
  { name: 'manage_subscription',      description: 'Create and manage subscription payments',             module: 'Settings',     submodule: 'Subscription',       display_no: 154 },
  // ─── BIZTRACK AI ───────────────────────────────────────────────────────────
  { name: 'ai_access', description: 'Access BizTrack AI workspace', module: 'BizTrack AI', submodule: 'General', display_no: 200 },
  { name: 'ai_chat', description: 'Ask questions in BizTrack AI', module: 'BizTrack AI', submodule: 'General', display_no: 201 },
  { name: 'ai_sales_insights', description: 'Access AI sales insights', module: 'BizTrack AI', submodule: 'Insights', display_no: 202 },
  { name: 'ai_profit_insights', description: 'Access AI profit insights', module: 'BizTrack AI', submodule: 'Insights', display_no: 203 },
  { name: 'ai_inventory_insights', description: 'Access AI inventory insights', module: 'BizTrack AI', submodule: 'Insights', display_no: 204 },
  { name: 'ai_customer_insights', description: 'Access AI customer and debt insights', module: 'BizTrack AI', submodule: 'Insights', display_no: 205 },
  { name: 'ai_expense_insights', description: 'Access AI expense insights', module: 'BizTrack AI', submodule: 'Insights', display_no: 206 },
  { name: 'ai_explain_reports', description: 'Use AI to explain verified reports', module: 'BizTrack AI', submodule: 'Actions', display_no: 207 },
  { name: 'ai_view_audit', description: 'View BizTrack AI audit activity', module: 'BizTrack AI', submodule: 'Administration', display_no: 208 },

];

export default permissions;