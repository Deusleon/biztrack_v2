# ORIGINAL_MAP — where everything lives in the ORIGINAL BizTrack (`biztrack-ai-integrated.zip`)

Paths are inside `biztrack_frontend_review/` and `biztrack_backend_review/` of that zip (ask the user to upload it again). Use this to find the original page or controller to port.

## Frontend routes → original page file (from the original `src/App.jsx`)

| Route | Page component | Original file | Lines | Route permission(s) |
|---|---|---|---|---|
| `/testpage` | TestPage | `src/pages/TestPage.jsx` | 2653 |  |
| `/login` | Login | `src/pages/auth/Login.jsx` | 157 |  |
| `/register` | Register | `src/pages/auth/Register.jsx` | 157 |  |
| `/verify-email` | VerifyEmail | `src/pages/auth/VerifyEmail.jsx` | 218 |  |
| `/forgot-password` | ForgotPassword | `src/pages/auth/ForgotPassword.jsx` | 118 |  |
| `/new-password` | NewPassword | `src/pages/auth/NewPassword.jsx` | 190 |  |
| `/lock` | LockedScreen | `src/pages/LockScreen.jsx` | 41 |  |
| `/support/admin` | SupportAdminPage | `src/pages/support/SupportAdminPage.jsx` | 422 |  |
| `/dashboard` | Dashboard | `src/pages/Dashboard.jsx` | 916 | ["view_dashboard"] |
| `/user-manual` | UserManualPage | `src/pages/UserManualPage.jsx` | 98 |  |
| `/biztrack-ai` | BizTrackAIPage | `src/pages/ai/BizTrackAIPage.jsx` | 188 | ["ai_access"] |
| `/sales/invoice` | InvoiceSalePage | `src/pages/sales/InvoiceSalePage.jsx` | 1630 | ["create_invoice","view_sales"] |
| `/sales/pending` | PendingSales | `src/pages/sales/PendingSales.jsx` | 275 | ["view_sales","create_invoice"] |
| `/sales/pending/preview` | OrderPreviewPage | `src/pages/sales/OrderPreviewPage.jsx` | 964 | ["view_sales","create_invoice"] |
| `/sales/history` | SalesHistoryPage | `src/pages/sales/SalesHistoryPage.jsx` | 821 | ["view_sales_records"] |
| `/sales/receipt` | ReceiptPage | `src/pages/sales/ReceiptPage.jsx` | 273 | ["create_invoice","view_sales"] |
| `/sales/returns` | SalesReturnsPage | `src/pages/sales/SalesReturnsPage.jsx` | 527 | ["view_sales_returns","create_sales_return"] |
| `/sales/debits` | DebitsPage | `src/pages/sales/DebitsPage.jsx` | 653 | ["view_credit_sales","manage_credit_sales"] |
| `/sales/customers` | CustomersPage | `src/pages/sales/CustomersPage.jsx` | 322 | ["view_customers","create_customers","update_customers","delete_customers"] |
| `/purchases/orders` | PurchasesPage | `src/pages/purchases/PurchasesPage.jsx` | 1313 | ["view_purchase_orders","create_purchase_orders","update_purchase_orders","approve_purchase_orders","delete_purchase_orders"] |
| `/purchases/goods-received` | GoodsReceivedPage | `src/pages/purchases/GoodsReceivedPage.jsx` | 956 | ["view_grn","create_grn","approve_grn","delete_grn"] |
| `/purchases/suppliers` | SuppliersPage | `src/pages/purchases/SuppliersPage.jsx` | 388 | ["view_suppliers","create_suppliers","update_suppliers","delete_suppliers"] |
| `/purchases/invoices` | SupplierInvoicesPage | `src/pages/purchases/SupplierInvoicesPage.jsx` | 1098 | ["view_supplier_invoices","create_supplier_invoices","update_supplier_invoices","delete_supplier_invoices"] |
| `/purchases/payments` | SupplierPaymentsPage | `src/pages/purchases/SupplierPaymentsPage.jsx` | 1010 | ["view_supplier_payments","create_supplier_payments","delete_supplier_payments"] |
| `/purchases/returns` | SupplierReturnsPage | `src/pages/purchases/SupplierReturnsPage.jsx` | 1430 | ["view_supplier_returns","create_supplier_returns","approve_supplier_returns","delete_supplier_returns"] |
| `/inventory/products` | ProductsPage | `src/pages/inventory/ProductsPage.jsx` | 615 | ["view_products","create_products","update_products","delete_products"] |
| `/inventory/current-stock` | CurrentStockPage | `src/pages/inventory/CurrentStockPage.jsx` | 313 | ["view_current_stock"] |
| `/inventory/stock-value` | CurrentStockValuePage | `src/pages/inventory/CurrentStockValuePage.jsx` | 449 | ["view_current_stock_value"] |
| `/inventory/pricelist` | PricelistPage | `src/pages/inventory/PricelistPage.jsx` | 345 | ["view_price_list","manage_price_list"] |
| `/inventory/stock-value-history` | StockValueHistoryPage | `src/pages/inventory/StockValueHistoryPage.jsx` | 618 | ["view_stock_value_history"] |
| `/inventory/adjustment` | StockAdjustmentPage | `src/pages/inventory/StockAdjustmentPage.jsx` | 837 | ["view_stock_adjustment","create_stock_adjustment"] |
| `/inventory/stock-count` | StockCountPage | `src/pages/inventory/StockCountPage.jsx` | 816 | ["view_stock_count","create_stock_count","approve_stock_count"] |
| `/inventory/stock-transfer` | StockTransferPage | `src/pages/inventory/StockTransferPage.jsx` | 1224 | ["view_stock_transfer","create_stock_transfer","approve_stock_transfer"] |
| `/reports/sales` | SalesReportsPage | `src/pages/reports/SalesReportsPage.jsx` | 2276 | ["view_sales_reports"] |
| `/reports/expenses` | ExpensesReportsPage | `src/pages/reports/ExpensesReportsPage.jsx` | 232 | ["view_expense_reports"] |
| `/reports/purchases` | PurchasesReportsPage | `src/pages/reports/PurchasesReportsPage.jsx` | 1087 | ["view_purchase_reports"] |
| `/reports/profit` | ProfitReportsPage | `src/pages/reports/ProfitReportsPage.jsx` | 1511 | ["view_profit_reports"] |
| `/reports/net-profit` | NetProfitReportsPage | `src/pages/reports/NetProfitReportsPage.jsx` | 242 | ["view_profit_reports"] |
| `/reports/day-report` | DayReportPage | `src/pages/reports/DayReportPage.jsx` | 215 | ["view_sales_reports"] |
| `/reports/inventory` | InventoryReportsPage | `src/pages/reports/InventoryReportsPage.jsx` | 989 | ["view_inventory_reports"] |
| `/categories/products` | ProductCategoriesPage | `src/pages/categories/ProductCategoriesPage.jsx` | 294 | ["view_product_categories","create_product_categories","update_product_categories","delete_product_categories"] |
| `/categories/prices` | PriceCategoriesPage | `src/pages/categories/PriceCategoriesPage.jsx` | 279 | ["view_price_categories","create_price_categories","update_price_categories","delete_price_categories"] |
| `/users/all` | UsersPage | `src/pages/users/UsersPage.jsx` | 401 | ["view_users","edit_users","delete_users"] |
| `/users/roles` | RolesPage | `src/pages/users/RolesPage.jsx` | 301 | ["view_roles","create_roles","edit_roles","delete_roles"] |
| `/users/permissions` | PermissionsPage | `src/pages/users/PermissionsPage.jsx` | 475 | ["manage_permissions"] |
| `/stores` | StorePage | `src/pages/store/StorePage.jsx` | 302 | ["view_stores","edit_stores","delete_stores"] |
| `/settings/configurations` | ConfigurationPage | `src/pages/settings/ConfigurationPage.jsx` | 747 | ["view_configurations","edit_configurations"] |
| `/settings/uploads` | UploadsPage | `src/pages/settings/UploadsPage.jsx` | 255 | ["view_uploads","manage_uploads"] |
| `/settings/bulk-operations` | BulkOperationsPage | `src/pages/settings/BulkOperationsPage.jsx` | 463 | ["view_bulk_operations","manage_inventory"] |
| `/settings/integration` | IntegrationsPage | `src/pages/settings/IntegrationsPage.jsx` | 674 | ["view_integration","manage_integration"] |
| `/messaging/recent` | SendMessagePage | `src/pages/messaging/SendMessagePage.jsx` | 161 | ["view_messaging","manage_messaging"] |
| `/messaging/contacts` | AllContactsPage | `src/pages/messaging/AllContactsPage.jsx` | 151 | ["view_messaging","manage_contacts"] |
| `/messaging/groups` | GroupsPage | `src/pages/messaging/GroupsPage.jsx` | 219 | ["view_messaging","manage_groups"] |
| `/messaging/templates` | TemplatesPage | `src/pages/messaging/TemplatesPage.jsx` | 152 | ["view_messaging","manage_templates"] |
| `/messaging/account` | MessagingAccountPage | `src/pages/messaging/AccountPage.jsx` | 369 | ["view_messaging","manage_messaging_account"] |
| `/messaging` | → redirect /messaging/recent | `-` | 0 |  |
| `/settings/security` | SecurityPage | `src/pages/settings/SecurityPage.jsx` | 340 | ["view_security","manage_security"] |
| `/settings/tools` | ToolsPage | `src/pages/settings/ToolsPage.jsx` | 738 | ["view_tools","manage_tools"] |
| `/settings/notifications` | NotificationsPage | `src/pages/settings/NotificationsPage.jsx` | 256 | ["view_notifications","manage_notifications"] |
| `/settings/appearance` | AppearancePage | `src/pages/settings/AppearancePage.jsx` | 358 | ["view_appearance","manage_appearance"] |
| `/subscription` | SubscriptionPage | `src/pages/subscription/SubscriptionPage.jsx` | 468 |  |
| `/profile` | ProfilePage | `src/pages/profile/ProfilePage.jsx` | 485 |  |
| `/inventory/import-export` | ImportExportPage | `src/pages/inventory/ImportExportPage.jsx` | 530 | ["view_products","create_products","update_products"] |
| `/expenses` | ExpensesPage | `src/pages/expenses/ExpensesPage.jsx` | 309 |  |
| `/` | Dashboard | `src/pages/Dashboard.jsx` | 916 | ["view_dashboard"] |
| `*` | NotFound | `src/components/auth/NotFound.jsx` | 79 |  |

Sub-components of each page (forms, modals, hooks) sit next to it: `forms/`, `modals/`, `hooks/` folders under the page's folder.

## Frontend building blocks: original → BizTrack 2

| Original (`src/…`) | New BizTrack 2 equivalent |
|---|---|
| `components/ui/AdvancedDataTable.jsx` (1606 lines: search, sort, columns toggle, selection, export, mobile cards) | `components/ui/DataTable.jsx` + `components/ExportMenu.jsx` + `hooks/useServerList.js`; export engine `utils/exportUtils.js` kept verbatim |
| `components/ui/ModalForm`, `Modal.jsx` | `components/ui/FormModal.jsx` |
| `components/ui/AlertDialog.jsx` | `components/ui/ConfirmModal.jsx` |
| `components/ui/ImageUpload.jsx` | `components/ImageInput.jsx` |
| `components/ui/QrScanner.jsx` | `components/BarcodeScanner.jsx` (zxing, no extra dependency) |
| `context/AuthContext.jsx` + `PermissionContext.jsx` | `contexts/AuthContext.jsx` → `can('perm')`, `canAny(...)` |
| `context/StoreContext.jsx` | `contexts/StoreContext.jsx` (switches without page reload) |
| `context/StoreSettingsContext.jsx`, `hooks/useStoreSettings.js` | same names under `contexts/`, `hooks/` |
| `context/IdleLockContext.jsx`, `pages/LockScreen.jsx` | NOT PORTED (Phase 5) |
| `context/NotificationContext.jsx` | NOT PORTED (Phase 5) |
| `components/Sidebar.jsx`, `SubNavMap.jsx`, `TopNavbar.jsx`, `layout/MainLayout.jsx` | `components/Sidebar.jsx`, `components/MainLayout.jsx`, `utils/navigation.js` (single flat menu, sections) |
| `lib/axios.js`, `services/*.js` | `utils/api.js` + `services/api.js` (one object per module, normalized replies) |
| `utils/exportUtils.js`, `numberUtils.js`, `receiptPdf.js`, `purchaseOrderPdf.js`, `deliveryNotePdf.js`, `subscriptionReceiptPdf.js`, `barcodeUtils.js`, `formatDateLocalized.js`, `storageUtils.js`, `imageHelpers.js`, `cloudinary.js`, `dateRange.js` | copied unchanged into `utils/` (the PDF look must stay BizTrack's) |
| `utils/qzPrint.js` + `assets/qz-tray-cert/` | NOT PORTED (Phase 2) |
| `lang/en.json`, `lang/sw.json` (~2,780 keys) | same files in `src/lang/` plus new `ui_*` keys |

## Backend: every route → permission → controller function (ORIGINAL; the converted files are in `backend/src/`)

| Route file | Method | Path | Permission(s) | Controller |
|---|---|---|---|---|
| `routes/ai.routes.js` | GET | `'/capabilities'` |  | aiController.getCapabilities |
| `routes/ai.routes.js` | GET | `'/audit-logs'` |  | aiController.getAuditLogs |
| `routes/ai.routes.js` | GET | `'/provider-status'` |  | aiController.getProviderStatus |
| `routes/ai.routes.js` | GET | `'/business-summary'` |  | aiController.getBusinessSummary |
| `routes/ai.routes.js` | GET | `'/conversations'` |  | aiController.listConversations |
| `routes/ai.routes.js` | GET | `'/conversations/:id'` |  | aiController.getConversation |
| `routes/ai.routes.js` | DELETE | `'/conversations/:id'` |  | aiController.deleteConversation |
| `routes/ai.routes.js` | POST | `'/chat'` |  | aiController.chat |
| `routes/ai.routes.js` | POST | `'/explain'` |  | aiController.explainReport |
| `routes/auth/authRoutes.js` | POST | `'/register'` |  | authController.register |
| `routes/auth/authRoutes.js` | POST | `'/login'` |  | authController.login |
| `routes/auth/authRoutes.js` | POST | `'/verify-password'` |  | authController.verifyPassword |
| `routes/auth/authRoutes.js` | POST | `'/logout'` |  | authController.logout |
| `routes/auth/authRoutes.js` | POST | `'/resend-email'` |  | authController.resendEmail |
| `routes/auth/authRoutes.js` | POST | `'/switch-store'` |  | authController.switchStore |
| `routes/auth/forgotPasswordRoutes.js` | POST | `'/'` |  |  |
| `routes/auth/resetPasswordRoutes.js` | POST | `'/'` |  |  |
| `routes/auth/resetPasswordRoutes.js` | GET | `'/verify'` |  |  |
| `routes/auth/verifyEmailRoutes.js` | POST | `'/'` |  | verifyEmailController.verifyEmail |
| `routes/backup.routes.js` | GET | `"/"` |  | backupController.getBackups |
| `routes/backup.routes.js` | GET | `"/status"` |  | backupController.getBackupStatus |
| `routes/backup.routes.js` | POST | `"/test"` |  | backupController.testConnection |
| `routes/backup.routes.js` | POST | `"/run"` |  | backupController.runBackupNow |
| `routes/backup.routes.js` | POST | `"/restore/drive/:driveFileId"` |  | backupController.restoreFromDrive |
| `routes/backup.routes.js` | POST | `"/restore/upload"` |  | backupController.restoreFromUpload |
| `routes/category.routes.js` | GET | `'/:storeId'` |  | categoryController.getCategories |
| `routes/category.routes.js` | POST | `'/'` | ['create_product_categories'] | categoryController.addCategory |
| `routes/category.routes.js` | PUT | `'/:id'` | ['update_product_categories'] | categoryController.updateCategory |
| `routes/category.routes.js` | DELETE | `'/:id'` | ['delete_product_categories'] | categoryController.deleteCategory |
| `routes/customer.routes.js` | GET | `'/:storeId'` | ['view_customers','create_invoice','view_debits','create_sales_return'] | customerController.getStoreCustomers |
| `routes/customer.routes.js` | POST | `'/'` | ['create_customers','create_invoice'] | customerController.createCustomer |
| `routes/customer.routes.js` | PUT | `'/:id'` | ['update_customers'] | customerController.updateCustomer |
| `routes/customer.routes.js` | DELETE | `'/:id'` | ['delete_customers'] | customerController.deleteCustomer |
| `routes/dashboard.routes.js` | GET | `'/stats'` |  | dashboardController.getDashboardStats |
| `routes/expense.routes.js` | GET | `'/'` |  | expenseController.getExpenses |
| `routes/expense.routes.js` | GET | `'/categories'` |  | expenseController.getExpenseCategories |
| `routes/expense.routes.js` | POST | `'/'` | ['create_expenses'] | expenseController.createExpense |
| `routes/expense.routes.js` | PUT | `'/:id'` | ['update_expenses'] | expenseController.updateExpense |
| `routes/expense.routes.js` | DELETE | `'/:id'` | ['delete_expenses'] | expenseController.deleteExpense |
| `routes/images.routes.js` | DELETE | `"/:publicId"` |  |  |
| `routes/importExport.routes.js` | GET | `"/template/:type"` |  | importExportController.downloadTemplate |
| `routes/importExport.routes.js` | POST | `"/products"` | ["manage_products","edit_products"] | importExportController.importProducts |
| `routes/importExport.routes.js` | POST | `"/stock"` | ["manage_inventory","manage_stock"] | importExportController.importStock |
| `routes/importExport.routes.js` | POST | `"/prices"` | ["manage_products","manage_prices"] | importExportController.importPrices |
| `routes/importExport.routes.js` | POST | `"/full"` | ["view_products","manage_inventory"] | importExportController.importFull |
| `routes/importExport.routes.js` | POST | `"/contacts"` | ["manage_integration","view_integration"] | importExportController.importContacts |
| `routes/importExport.routes.js` | GET | `"/export/:type"` |  | importExportController.exportData |
| `routes/integrations.routes.js` | GET | `"/access"` |  | integrationController.checkAccess |
| `routes/integrations.routes.js` | GET | `"/"` |  | integrationController.getIntegrations |
| `routes/integrations.routes.js` | PUT | `"/:provider"` |  | integrationController.saveIntegration |
| `routes/integrations.routes.js` | POST | `"/cloud_backup/run"` |  | integrationController.runCloudBackup |
| `routes/integrations.routes.js` | POST | `"/:provider/verify"` |  | integrationController.verifyIntegration |
| `routes/integrations.routes.js` | POST | `"/:provider/test"` |  | integrationController.testIntegration |
| `routes/inventory.routes.js` | POST | `'/in'` | ['create_stock_adjustment','create_grn'] | inventoryController.addStock |
| `routes/inventory.routes.js` | GET | `'/stock'` | ['view_inventory','view_current_stock','view_products','create_invoice'] | inventoryController.getStock |
| `routes/inventory.routes.js` | GET | `'/store-stock'` | ['view_inventory','view_current_stock','create_invoice','view_stock_transfer','create_stock_transfer','view_stock_adjustment','create_stock_adjustment','view_stock_count','create_stock_count'] | inventoryController.getStoreWideStock |
| `routes/inventory.routes.js` | GET | `'/batch-details'` | ['view_inventory','view_current_stock','create_invoice','view_stock_adjustment','create_stock_adjustment'] | inventoryController.getBatchDetails |
| `routes/inventory.routes.js` | GET | `'/low-stock'` | ['view_inventory','view_current_stock','view_products','create_invoice','view_stock_below_minimum_report'] | inventoryController.getLowStock |
| `routes/inventory.routes.js` | POST | `//     '/out'` |  |  |
| `routes/inventory.routes.js` | GET | `'/movements'` | ['view_inventory','view_current_stock','view_inventory_reports','view_stock_count'] | inventoryController.getStockMovements |
| `routes/inventory.routes.js` | GET | `'/check-expiry'` | ['view_inventory','view_current_stock','view_products','create_invoice'] | inventoryController.getExpiryRiskReport |
| `routes/inventory.routes.js` | GET | `'/stock-value'` | ['view_current_stock_value','view_inventory'] | inventoryController.getStockValue |
| `routes/inventory.routes.js` | POST | `'/stock-value-history'` | ['save_stock_value_history'] | inventoryController.saveStockValueHistory |
| `routes/inventory.routes.js` | GET | `'/stock-value-history'` | ['view_stock_value_history'] | inventoryController.getStockValueHistoryList |
| `routes/inventory.routes.js` | GET | `'/stock-value-history/:historyId'` | ['view_stock_value_history'] | inventoryController.getStockValueHistoryDetail |
| `routes/inventory.routes.js` | DELETE | `'/stock-value-history/:historyId'` | ['delete_stock_value_history'] | inventoryController.deleteStockValueHistory |
| `routes/inventory.routes.js` | PUT | `'/batch'` | ['edit_batch'] | inventoryController.updateBatch |
| `routes/inventory.routes.js` | POST | `'/adjustment'` | ['create_stock_adjustment'] | inventoryController.createStockAdjustment |
| `routes/inventory.routes.js` | GET | `'/adjustments'` | ['view_stock_adjustment'] | inventoryController.getStockAdjustments |
| `routes/inventory.routes.js` | GET | `'/adjustment/:adjustmentId'` | ['view_stock_adjustment'] | inventoryController.getStockAdjustmentDetail |
| `routes/inventory.routes.js` | GET | `'/batchwise-stock'` | ['view_stock_adjustment','create_stock_adjustment','view_inventory'] | inventoryController.getBatchwiseStock |
| `routes/inventory.routes.js` | POST | `'/adjustment-batchwise'` | ['create_stock_adjustment'] | inventoryController.createBatchwiseStockAdjustment |
| `routes/messaging.routes.js` | POST | `"/send"` |  | messagingController.sendMessage |
| `routes/messaging.routes.js` | GET | `"/batches/:batchId/stats"` |  | messagingController.getBatchStats |
| `routes/messaging.routes.js` | GET | `"/gateway-info"` |  | messagingController.getGatewayInfo |
| `routes/messaging.routes.js` | GET | `"/account-stats"` |  | messagingController.getAccountStats |
| `routes/messaging.routes.js` | POST | `"/topup/request"` |  | messagingController.requestTopup |
| `routes/messaging.routes.js` | GET | `"/history"` |  | messagingController.getMessageHistory |
| `routes/messaging.routes.js` | GET | `"/history/:batchId"` |  | messagingController.getMessageBatchDetail |
| `routes/messaging.routes.js` | GET | `"/sender-ids"` |  | messagingController.listSenderIds |
| `routes/messaging.routes.js` | POST | `"/sender-ids"` |  | messagingController.requestSenderId |
| `routes/messaging.routes.js` | POST | `"/topup/ussd"` |  | messagingController.buyCreditsUssd |
| `routes/messaging.routes.js` | POST | `"/topup/zenopay"` |  | messagingController.createZenoPayOrder |
| `routes/messaging.routes.js` | GET | `"/topup/zenopay/status"` |  | messagingController.checkZenoPayStatus |
| `routes/messaging.routes.js` | GET | `"/groups"` |  | messagingController.listGroups |
| `routes/messaging.routes.js` | POST | `"/groups"` |  | messagingController.createGroup |
| `routes/messaging.routes.js` | PUT | `"/groups/:id"` |  | messagingController.updateGroup |
| `routes/messaging.routes.js` | DELETE | `"/groups/:id"` |  | messagingController.deleteGroup |
| `routes/messaging.routes.js` | GET | `"/contacts"` |  | messagingController.listAllContacts |
| `routes/messaging.routes.js` | POST | `"/contacts"` |  | messagingController.createContact |
| `routes/messaging.routes.js` | PUT | `"/contacts/:id"` |  | messagingController.updateContact |
| `routes/messaging.routes.js` | PUT | `"/contacts/:id/groups"` |  | messagingController.setContactGroups |
| `routes/messaging.routes.js` | DELETE | `"/contacts/:id"` |  | messagingController.deleteContact |
| `routes/messaging.routes.js` | GET | `"/groups/:id/contacts"` |  | messagingController.listGroupContacts |
| `routes/messaging.routes.js` | POST | `"/groups/:id/contacts"` |  | messagingController.addContacts |
| `routes/messaging.routes.js` | POST | `"/groups/:id/assign"` |  | messagingController.assignContactsToGroup |
| `routes/messaging.routes.js` | DELETE | `"/groups/:groupId/contacts/:contactId"` |  | messagingController.removeContactFromGroup |
| `routes/messaging.routes.js` | POST | `"/groups/:id/send"` |  | messagingController.sendToGroup |
| `routes/messaging.routes.js` | GET | `"/templates"` |  | messagingController.listTemplates |
| `routes/messaging.routes.js` | POST | `"/templates"` |  | messagingController.createTemplate |
| `routes/messaging.routes.js` | PUT | `"/templates/:id"` |  | messagingController.updateTemplate |
| `routes/messaging.routes.js` | DELETE | `"/templates/:id"` |  | messagingController.deleteTemplate |
| `routes/permission.routes.js` | GET | `'/'` |  | permissionController.getPermissions |
| `routes/permission.routes.js` | POST | `'/'` |  | permissionController.updatePermission |
| `routes/permission.routes.js` | POST | `'/bulk'` |  | permissionController.updateBulkPermission |
| `routes/priceCategory.routes.js` | GET | `'/:storeId'` |  | priceCategoryController.getPriceCategories |
| `routes/priceCategory.routes.js` | POST | `'/'` | 'create_price_categories' | priceCategoryController.addPriceCategory |
| `routes/priceCategory.routes.js` | PUT | `'/:id'` | 'update_price_categories' | priceCategoryController.updatePriceCategory |
| `routes/priceCategory.routes.js` | DELETE | `'/:id'` | 'delete_price_categories' | priceCategoryController.deletePriceCategory |
| `routes/priceList.routes.js` | GET | `'/'` |  | priceListController.getPricelist |
| `routes/priceList.routes.js` | PUT | `'/update-prices'` |  | priceListController.updatePrices |
| `routes/product.routes.js` | GET | `'/:storeId'` |  | productController.getProducts |
| `routes/product.routes.js` | GET | `'/:storeId/barcode/:barcode'` |  | productController.getProductByBarcode |
| `routes/product.routes.js` | POST | `'/'` | ['create_products'] | productController.addProduct |
| `routes/product.routes.js` | PUT | `'/:id'` | ['update_products'] | productController.updateProduct |
| `routes/product.routes.js` | DELETE | `'/:id'` | ['delete_products'] | productController.deleteProduct |
| `routes/product.routes.js` | DELETE | `'/bulk/:id'` | ['delete_products'] | productController.deleteBulkProduct |
| `routes/profile.routes.js` | GET | `"/"` |  | profileController.getProfile |
| `routes/profile.routes.js` | PUT | `"/"` |  | profileController.updateProfile |
| `routes/profile.routes.js` | PUT | `"/password"` |  | profileController.changePassword |
| `routes/profile.routes.js` | POST | `"/avatar"` |  | profileController.uploadAvatar |
| `routes/profile.routes.js` | DELETE | `"/avatar"` |  | profileController.removeAvatar |
| `routes/purchase.routes.js` | GET | `'/active-cart'` | 'create_purchase_orders' | purchaseOrderController.getActivePurchaseCart |
| `routes/purchase.routes.js` | POST | `'/sync-cart'` | 'create_purchase_orders' | purchaseOrderController.syncActivePurchaseCart |
| `routes/purchase.routes.js` | GET | `'/orders'` | 'view_purchase_orders' | purchaseOrderController.getPurchaseOrders |
| `routes/purchase.routes.js` | GET | `'/orders/:id'` | 'view_purchase_orders' | purchaseOrderController.getPurchaseOrderById |
| `routes/purchase.routes.js` | POST | `'/orders'` | 'create_purchase_orders' | purchaseOrderController.createPurchaseOrder |
| `routes/purchase.routes.js` | PUT | `'/orders/:id'` | 'update_purchase_orders' | purchaseOrderController.updatePurchaseOrder |
| `routes/purchase.routes.js` | POST | `'/orders/:id/approve'` | 'approve_purchase_orders' | purchaseOrderController.approvePurchaseOrder |
| `routes/purchase.routes.js` | DELETE | `'/orders/:id'` | 'delete_purchase_orders' | purchaseOrderController.deletePurchaseOrder |
| `routes/purchase.routes.js` | GET | `'/grn'` | 'view_grn' | purchaseOrderController.getGRNs |
| `routes/purchase.routes.js` | GET | `'/grn/:id'` | 'view_grn' | purchaseOrderController.getGRNById |
| `routes/purchase.routes.js` | POST | `'/grn'` | 'create_grn' | purchaseOrderController.createGRN |
| `routes/purchase.routes.js` | POST | `'/grn/:id/inspect'` | 'approve_grn' | purchaseOrderController.inspectGRN |
| `routes/purchase.routes.js` | DELETE | `'/grn/:id'` | 'delete_grn' | purchaseOrderController.deleteGRN |
| `routes/purchase.routes.js` | GET | `'/invoices'` | 'view_supplier_invoices' | supplierInvoiceController.getSupplierInvoices |
| `routes/purchase.routes.js` | GET | `'/invoices/:id'` | 'view_supplier_invoices' | supplierInvoiceController.getSupplierInvoiceById |
| `routes/purchase.routes.js` | POST | `'/invoices'` | 'create_supplier_invoices' | supplierInvoiceController.createSupplierInvoice |
| `routes/purchase.routes.js` | PUT | `'/invoices/:id'` | 'update_supplier_invoices' | supplierInvoiceController.updateSupplierInvoice |
| `routes/purchase.routes.js` | DELETE | `'/invoices/:id'` | 'delete_supplier_invoices' | supplierInvoiceController.deleteSupplierInvoice |
| `routes/purchase.routes.js` | GET | `'/payments'` | 'view_supplier_payments' | supplierInvoiceController.getSupplierPayments |
| `routes/purchase.routes.js` | GET | `'/payments/:id'` | 'view_supplier_payments' | supplierInvoiceController.getSupplierPaymentById |
| `routes/purchase.routes.js` | POST | `'/payments'` | 'create_supplier_payments' | supplierInvoiceController.createSupplierPayment |
| `routes/purchase.routes.js` | DELETE | `'/payments/:id'` | 'delete_supplier_payments' | supplierInvoiceController.deleteSupplierPayment |
| `routes/purchase.routes.js` | GET | `'/returns'` | 'view_supplier_returns' | supplierInvoiceController.getSupplierReturns |
| `routes/purchase.routes.js` | GET | `'/returns/:id'` | 'view_supplier_returns' | supplierInvoiceController.getSupplierReturnById |
| `routes/purchase.routes.js` | POST | `'/returns'` | 'create_supplier_returns' | supplierInvoiceController.createSupplierReturn |
| `routes/purchase.routes.js` | POST | `'/returns/:id/approve'` | 'approve_supplier_returns' | supplierInvoiceController.approveSupplierReturn |
| `routes/purchase.routes.js` | DELETE | `'/returns/:id'` | 'delete_supplier_returns' | supplierInvoiceController.deleteSupplierReturn |
| `routes/purchase.routes.js` | GET | `'/dashboard'` | 'view_purchase_reports' | supplierInvoiceController.getPurchaseDashboard |
| `routes/purchase.routes.js` | GET | `'/supplier/:supplierId/statement'` | 'view_supplier_invoices' | supplierInvoiceController.getSupplierStatement |
| `routes/qzSign.routes.js` | POST | `'/sign'` |  | qzSignController.sign |
| `routes/report.routes.js` | GET | `'/sales'` | 'view_sales_reports' | reportController.getSalesReport |
| `routes/report.routes.js` | GET | `'/sales/detailed'` | 'view_sales_detailed_report' | reportController.getSalesDetailedReport |
| `routes/report.routes.js` | GET | `'/sales/returns'` | 'view_sales_returns_report' | reportController.getSalesReturnsReport |
| `routes/report.routes.js` | GET | `'/sales/comparison'` | 'view_sales_comparison_report' | reportController.getSalesComparisonReport |
| `routes/report.routes.js` | GET | `'/sales/by-product'` | 'view_sales_by_product_report' | reportController.getSalesByProductReport |
| `routes/report.routes.js` | GET | `'/sales/by-cashier'` | 'view_sales_by_cashier_report' | reportController.getSalesByCashierReport |
| `routes/report.routes.js` | GET | `'/sales/by-customer'` | 'view_sales_by_customer_report' | reportController.getSalesByCustomerReport |
| `routes/report.routes.js` | GET | `'/sales/by-category'` | 'view_sales_by_category_report' | reportController.getSalesByCategoryReport |
| `routes/report.routes.js` | GET | `'/sales/by-payment-method'` | 'view_sales_by_payment_report' | reportController.getSalesByPaymentMethodReport |
| `routes/report.routes.js` | GET | `'/sales/debits'` | 'view_sales_debits_report' | reportController.getSalesDebitsReport |
| `routes/report.routes.js` | GET | `'/purchases'` | 'view_purchase_reports' | reportController.getPurchasesReport |
| `routes/report.routes.js` | GET | `'/purchases/summary'` | 'view_purchase_summary_reports' | reportController.getPurchasesReport |
| `routes/report.routes.js` | GET | `'/purchases/detailed'` | 'view_purchase_detailed_report' | reportController.getPurchasesDetailedReport |
| `routes/report.routes.js` | GET | `'/purchases/by-product'` | 'view_purchase_by_products_report' | reportController.getPurchasesByProductReport |
| `routes/report.routes.js` | GET | `'/purchases/by-supplier'` | 'view_purchase_by_supplier_report' | reportController.getPurchasesBySupplierReport |
| `routes/report.routes.js` | GET | `'/purchases/supplier-payable'` | 'view_supplier_payable_report' | reportController.getSupplierPayableReport |
| `routes/report.routes.js` | GET | `'/purchases/invoices'` | 'view_invoices_report' | reportController.getPurchaseInvoiceReport |
| `routes/report.routes.js` | GET | `'/purchases/returns'` | 'view_purchase_returns_report' | reportController.getPurchaseReturnsReport |
| `routes/report.routes.js` | GET | `'/purchases/trends'` | 'view_purchase_trends_report' | reportController.getPurchaseTrendsReport |
| `routes/report.routes.js` | GET | `'/purchases/replenishment'` | 'view_purchase_replenishment_report' | reportController.getStockReplenishmentReport |
| `routes/report.routes.js` | GET | `'/purchases/cost-analysis'` | 'view_cost_analysis_report' | reportController.getPurchaseCostAnalysisReport |
| `routes/report.routes.js` | GET | `'/purchases/supplier-performance'` | 'view_supplier_performance_reports' | reportController.getSupplierPerformanceReport |
| `routes/report.routes.js` | GET | `'/purchases/grn'` | 'view_grn_reports' | reportController.getGrnReport |
| `routes/report.routes.js` | GET | `'/inventory'` | 'view_current_stock' | reportController.getInventoryReport |
| `routes/report.routes.js` | GET | `'/inventory/stock-summary'` | 'view_stock_summary_reports' | reportController.getStockSummaryReport |
| `routes/report.routes.js` | GET | `'/inventory/current-summary'` | 'view_current_stock_summary_report' | reportController.getCurrentStockSummaryReport |
| `routes/report.routes.js` | GET | `'/inventory/current-detailed'` | 'view_current_stock_detailed_report' | reportController.getCurrentStockDetailedReport |
| `routes/report.routes.js` | GET | `'/inventory/ledger'` | 'view_product_ledger_report' | reportController.getProductLedgerReport |
| `routes/report.routes.js` | GET | `'/inventory/out-of-stock'` | 'view_out_of_stock_products_report' | reportController.getOutOfStockReport |
| `routes/report.routes.js` | GET | `'/inventory/outgoing'` | 'view_outgoing_products_report' | reportController.getOutgoingStockReport |
| `routes/report.routes.js` | GET | `'/inventory/incoming'` | 'view_incoming_products_report' | reportController.getIncomingStockReport |
| `routes/report.routes.js` | GET | `'/inventory/fast-moving'` | 'view_fast_moving_products_report' | reportController.getFastMovingProductsReport |
| `routes/report.routes.js` | GET | `'/inventory/dead-stock'` | 'view_dead_stock_report' | reportController.getDeadStockReport |
| `routes/report.routes.js` | GET | `'/inventory/adjustments'` | 'view_stock_adjustments_report' | reportController.getStockAdjustmentReport |
| `routes/report.routes.js` | GET | `'/inventory/transfers'` | 'view_stock_transfer_report' | reportController.getStockTransferReport |
| `routes/report.routes.js` | GET | `'/inventory/below-alert'` | 'view_stock_below_minimum_report' | reportController.getStockBelowAlertReport |
| `routes/report.routes.js` | GET | `'/expenses'` | 'view_supplier_payments' | reportController.getExpensesReport |
| `routes/report.routes.js` | GET | `'/profit'` | 'view_profit_reports' | reportController.getProfitReport |
| `routes/report.routes.js` | GET | `'/profit/detailed'` | 'view_profit_detailed_report' | reportController.getProfitDetailedReport |
| `routes/report.routes.js` | GET | `'/profit/by-product'` | 'view_profit_by_product_report' | reportController.getProfitByProductReport |
| `routes/report.routes.js` | GET | `'/profit/by-category'` | 'view_profit_by_category_report' | reportController.getProfitByCategoryReport |
| `routes/report.routes.js` | GET | `'/profit/by-cashier'` | 'view_profit_by_cashier_report' | reportController.getProfitByCashierReport |
| `routes/report.routes.js` | GET | `'/profit/by-customer'` | 'view_profit_by_customer_report' | reportController.getProfitByCustomerReport |
| `routes/report.routes.js` | GET | `'/profit/margins'` | 'view_profit_margins_report' | reportController.getProfitMarginsReport |
| `routes/report.routes.js` | GET | `'/profit/trends'` | 'view_profit_trends_report' | reportController.getProfitTrendsReport |
| `routes/report.routes.js` | GET | `'/day-report'` | 'view_sales_reports' | reportController.getDayReport |
| `routes/report.routes.js` | GET | `'/net-profit'` | 'view_profit_reports' | reportController.getNetProfitReport |
| `routes/role.routes.js` | POST | `'/'` |  | roleController.addRole |
| `routes/role.routes.js` | GET | `'/'` |  | roleController.getRoles |
| `routes/role.routes.js` | PUT | `'/:id'` |  | roleController.updateRole |
| `routes/role.routes.js` | DELETE | `'/:id'` |  | roleController.deleteRole |
| `routes/sales.routes.js` | GET | `'/active-cart'` | ['create_invoice'] | salesController.getActiveCart |
| `routes/sales.routes.js` | POST | `'/sync-cart'` | ['create_invoice'] | salesController.syncActiveCart |
| `routes/sales.routes.js` | GET | `'/cart/:cartcode'` | ['create_invoice'] | salesController.getCartByCartCode |
| `routes/sales.routes.js` | GET | `'/cart'` | ['create_invoice'] | salesController.getCartByCartCode |
| `routes/sales.routes.js` | POST | `'/cart-by-barcode'` | ['create_invoice'] | salesController.addToCartByBarcode |
| `routes/sales.routes.js` | POST | `'/cart'` | ['create_invoice'] | salesController.addToCart |
| `routes/sales.routes.js` | PUT | `'/cart/:id'` | ['create_invoice'] | salesController.updateCartItem |
| `routes/sales.routes.js` | DELETE | `'/cart/:id'` | ['create_invoice'] | salesController.removeCartItem |
| `routes/sales.routes.js` | POST | `'/sell-cart'` | ['create_invoice'] | salesController.recordSale |
| `routes/sales.routes.js` | POST | `'/save-order'` | ['create_invoice'] | salesController.saveOrder |
| `routes/sales.routes.js` | POST | `'/save-order-changes'` | ['create_invoice'] | salesController.saveOrderChanges |
| `routes/sales.routes.js` | POST | `'/orders/create'` | ['create_invoice'] | salesController.createSalesOrder |
| `routes/sales.routes.js` | GET | `'/orders'` | ['create_invoice','view_pending_invoices','manage_pending_invoices'] | salesController.getSalesOrders |
| `routes/sales.routes.js` | GET | `'/orders/:id'` | ['create_invoice','view_pending_invoices','manage_pending_invoices'] | salesController.getSalesOrderDetails |
| `routes/sales.routes.js` | POST | `'/orders/:id/payment'` | ['create_invoice','manage_pending_invoices'] | salesController.recordSalesOrderPayment |
| `routes/sales.routes.js` | POST | `'/orders/:id/complete'` | ['manage_pending_invoices'] | salesController.completeSalesOrder |
| `routes/sales.routes.js` | PUT | `'/orders/:cartCode/cancel'` | ['manage_pending_invoices'] | salesController.cancelOrder |
| `routes/sales.routes.js` | PUT | `'/orders/:cartCode/reopen'` | ['create_invoice','manage_pending_invoices'] | salesController.reopenOrder |
| `routes/sales.routes.js` | POST | `'/orders/:cartCode/sell'` | ['create_invoice','manage_pending_invoices'] | salesController.sellPendingOrder |
| `routes/sales.routes.js` | DELETE | `'/orders/:cartCode'` | ['create_invoice','manage_pending_invoices'] | salesController.deletePendingOrder |
| `routes/sales.routes.js` | GET | `'/credit'` | ['view_debits','view_credit_sales','manage_credit_sales'] | salesController.getCreditSales |
| `routes/sales.routes.js` | POST | `'/credit/mark-overdue'` | ['manage_credit_sales'] | salesController.markOverdueCreditSales |
| `routes/sales.routes.js` | GET | `'/credit/:id'` | ['view_debits','view_credit_sales','manage_credit_sales'] | salesController.getCreditSaleDetails |
| `routes/sales.routes.js` | POST | `'/credit/:id/payment'` | ['manage_credit_sales'] | salesController.recordCreditPayment |
| `routes/sales.routes.js` | POST | `'/credit/:id/notify'` | ['manage_credit_sales'] | salesController.notifyCreditSale |
| `routes/sales.routes.js` | GET | `'/history'` | ['view_sales_records','create_invoice'] | salesController.getSalesHistory |
| `routes/sales.routes.js` | GET | `'/history/:invoiceNumber'` | ['view_sales_records','create_invoice'] | salesController.getSaleDetails |
| `routes/sales.routes.js` | POST | `'/returns'` | ['create_sales_return'] | salesController.createSalesReturn |
| `routes/sales.routes.js` | GET | `'/returns'` | ['view_sales_returns','create_sales_return'] | salesController.getSalesReturns |
| `routes/sales.routes.js` | GET | `'/returns/:id'` | ['view_sales_returns','create_sales_return'] | salesController.getSalesReturnDetails |
| `routes/sales.routes.js` | POST | `'/returns/:id/approve'` | ['create_sales_return'] | salesController.approveSalesReturn |
| `routes/sales.routes.js` | POST | `'/returns/:id/reject'` | ['create_sales_return'] | salesController.rejectSalesReturn |
| `routes/sales.routes.js` | GET | `'/get-orders'` | ['create_invoice','view_pending_invoices','manage_pending_invoices'] | salesController.getOrders |
| `routes/sales.routes.js` | GET | `'/get-orders/:cartCode'` | ['create_invoice','view_pending_invoices','manage_pending_invoices'] | salesController.getOrderDetails |
| `routes/sales.routes.js` | GET | `'/edit-orders/:cartCode'` | ['create_invoice','view_pending_invoices','manage_pending_invoices'] | salesController.getOrderDetailsForEdit |
| `routes/sales.routes.js` | POST | `'/order-payments'` | ['create_invoice','manage_pending_invoices'] | salesController.saveOrderPayments |
| `routes/settings.routes.js` | GET | `'/'` |  | settingsController.getStoreSettings |
| `routes/settings.routes.js` | GET | `'/notifications'` |  | settingsController.getNotificationSettings |
| `routes/settings.routes.js` | PUT | `'/notifications'` |  | settingsController.updateNotificationSettings |
| `routes/settings.routes.js` | POST | `'/notifications/test-run'` |  | settingsController.testRunNotifications |
| `routes/settings.routes.js` | GET | `'/branding'` |  | settingsController.getBrandingAssets |
| `routes/settings.routes.js` | POST | `'/branding/upload'` |  | settingsController.uploadBrandingAsset |
| `routes/settings.routes.js` | DELETE | `'/branding/:asset_type'` |  | settingsController.removeBrandingAsset |
| `routes/settings.routes.js` | PUT | `'/:id'` |  | settingsController.updateStoreSettings |
| `routes/stockCount.routes.js` | GET | `'/movements'` | ['view_stock_count','view_inventory','view_inventory_reports'] | stockCountController.getStockMovementsByType |
| `routes/stockCount.routes.js` | GET | `'/products'` | ['view_stock_count','create_stock_count'] | stockCountController.getProductsForStockCount |
| `routes/stockCount.routes.js` | POST | `'/save'` | ['create_stock_count'] | stockCountController.saveStockCount |
| `routes/stockCount.routes.js` | GET | `'/history'` | ['view_stock_count'] | stockCountController.getStockCountHistory |
| `routes/stockCount.routes.js` | GET | `'/history/:stockCountId'` | ['view_stock_count'] | stockCountController.getStockCountDetail |
| `routes/stockCount.routes.js` | GET | `'/adjustments-by-product'` | ['view_stock_count','view_stock_adjustment'] | stockCountController.getAdjustmentsByProduct |
| `routes/stockCount.routes.js` | GET | `'/adjustments/:productId'` | ['view_stock_count','view_stock_adjustment'] | stockCountController.getProductAdjustments |
| `routes/stockTransfer.routes.js` | POST | `'/'` | ['create_stock_transfer'] | stockTransferController.createStockTransfer |
| `routes/stockTransfer.routes.js` | GET | `'/history'` | ['view_stock_transfer','create_stock_transfer'] | stockTransferController.getTransferHistory |
| `routes/stockTransfer.routes.js` | GET | `'/:transferId'` | ['view_stock_transfer','create_stock_transfer'] | stockTransferController.getTransferDetail |
| `routes/stockTransfer.routes.js` | POST | `'/:transferId/receive'` | ['create_stock_transfer','approve_stock_transfer'] | stockTransferController.receiveTransfer |
| `routes/stockTransfer.routes.js` | POST | `'/:transferId/approve'` | ['approve_stock_transfer'] | stockTransferController.approveTransfer |
| `routes/stockTransfer.routes.js` | POST | `'/:transferId/cancel'` | ['approve_stock_transfer','create_stock_transfer'] | stockTransferController.cancelTransfer |
| `routes/stockTransfer.routes.js` | DELETE | `'/:transferId'` | 'delete_stock_transfer' | stockTransferController.deleteTransfer |
| `routes/store.routes.js` | POST | `'/'` |  | storeController.createStore |
| `routes/store.routes.js` | GET | `'/'` |  | storeController.getMyStores |
| `routes/store.routes.js` | GET | `'/default'` |  | storeController.getDefaultStore |
| `routes/store.routes.js` | PUT | `'/:id'` |  | storeController.updateStore |
| `routes/store.routes.js` | DELETE | `'/:id'` |  | storeController.deleteStore |
| `routes/store.routes.js` | POST | `'/:id/delete'` |  | storeController.deleteStore |
| `routes/storeUser.routes.js` | POST | `'/'` |  | storeUserController.addUserToStore |
| `routes/storeUser.routes.js` | POST | `'/create-user'` | ['edit_users'] | storeUserController.createUserForStore |
| `routes/storeUser.routes.js` | GET | `'/:store_id/users'` |  | storeUserController.getStoreUsers |
| `routes/storeUser.routes.js` | PUT | `'/:id'` |  | storeUserController.updateStoreUserRole |
| `routes/storeUser.routes.js` | DELETE | `'/:id'` |  | storeUserController.removeUserFromStore |
| `routes/subscription.routes.js` | POST | `'/webhooks/clickpesa'` |  | subscriptionController.clickpesaWebhook |
| `routes/subscription.routes.js` | GET | `'/plans'` |  | subscriptionController.getPlans |
| `routes/subscription.routes.js` | GET | `'/me'` |  | subscriptionController.getMySubscription |
| `routes/subscription.routes.js` | GET | `'/history'` |  | subscriptionController.getMyTransactions |
| `routes/subscription.routes.js` | POST | `'/checkout'` |  | subscriptionController.createCheckout |
| `routes/subscription.routes.js` | POST | `'/verify/:transactionId'` |  | subscriptionController.verifyTransaction |
| `routes/supplier.routes.js` | GET | `'/:storeId'` |  | supplierController.getSuppliers |
| `routes/supplier.routes.js` | POST | `'/'` | ['create_suppliers'] | supplierController.addSupplier |
| `routes/supplier.routes.js` | PUT | `'/:id'` | ['update_suppliers'] | supplierController.updateSupplier |
| `routes/supplier.routes.js` | DELETE | `'/:id'` | ['delete_suppliers'] | supplierController.deleteSupplier |
| `routes/support.routes.js` | POST | `"/tickets/public"` |  | supportController.createTicket |
| `routes/support.routes.js` | POST | `"/tickets"` |  | supportController.createTicket |
| `routes/support.routes.js` | GET | `"/tickets/my"` |  | supportController.getMyTickets |
| `routes/support.routes.js` | GET | `"/tickets/track"` |  | supportController.trackTicket |
| `routes/support.routes.js` | GET | `"/admin/access"` |  | supportController.checkAdminAccess |
| `routes/support.routes.js` | GET | `"/admin/stats"` |  | supportController.adminGetStats |
| `routes/support.routes.js` | GET | `"/admin/tickets"` |  | supportController.adminListTickets |
| `routes/support.routes.js` | GET | `"/admin/tickets/:id"` |  | supportController.adminGetTicket |
| `routes/support.routes.js` | PATCH | `"/admin/tickets/:id/status"` |  | supportController.adminUpdateStatus |
| `routes/support.routes.js` | POST | `"/admin/tickets/:id/reply"` |  | supportController.adminReply |
| `routes/testRoutes.js` | GET | `'/test-role/:storeId'` | ['view_users'] |  |
| `routes/tools.routes.js` | GET | `"/export"` |  | toolsController.exportData |
| `routes/tools.routes.js` | GET | `"/backup"` |  | toolsController.backupDatabase |
| `routes/tools.routes.js` | GET | `"/db-health"` |  | toolsController.dbHealthCheck |
| `routes/tools.routes.js` | POST | `"/clear-cache"` |  | toolsController.clearCache |
| `routes/tools.routes.js` | GET | `"/logs"` |  | toolsController.getSystemLogs |
| `routes/user.routes.js` | GET | `'/permissions'` |  | userController.getCurrentUserPermissions |
| `routes/user.routes.js` | GET | `'/check-permission'` |  | userController.checkUserPermission |

## Backend controllers by size

| Controller | Lines |
|---|---|
| `controllers/report.controller.js` | 4548 |
| `controllers/sales.controller.js` | 3870 |
| `controllers/inventory.controller.js` | 1795 |
| `controllers/purchaseOrder.controller.js` | 1730 |
| `controllers/supplierInvoice.controller.js` | 1654 |
| `controllers/importExport.controller.js` | 1523 |
| `controllers/messaging.controller.js` | 1269 |
| `controllers/product.controller.js` | 1164 |
| `controllers/stockTransfer.controller.js` | 1005 |
| `controllers/stockCount.controller.js` | 803 |
| `controllers/auth/authController.js` | 714 |
| `controllers/priceList.controller.js` | 693 |
| `controllers/support.controller.js` | 556 |
| `controllers/tools.controller.js` | 517 |
| `controllers/setting.controller.js` | 447 |
| `controllers/storeUser.controller.js` | 417 |
| `controllers/store.controller.js` | 328 |
| `controllers/profile.controller.js` | 259 |
| `controllers/backup.controller.js` | 253 |
| `controllers/integration.controller.js` | 242 |
| `controllers/supplier.controller.js` | 235 |
| `controllers/expense.controller.js` | 235 |
| `controllers/customer.controller.js` | 220 |
| `controllers/dashboard.controller.js` | 214 |
| `controllers/ai.controller.js` | 212 |
| `controllers/category.controller.js` | 206 |
| `controllers/role.controller.js` | 202 |
| `controllers/priceCategory.controller.js` | 197 |
| `controllers/permission.controller.js` | 174 |
| `controllers/subscription.controller.js` | 161 |
