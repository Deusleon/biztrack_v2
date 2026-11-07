# MIGRATION_CHECKLIST — kila ukurasa na kipengele cha BizTrack

Hali ya uhamisho kwenda BizTrack mpya (muundo wa EduTrack). **Hakuna kipengele kilichoondolewa:** ukurasa ambao bado haujahamishwa unaonyesha "unahamishiwa" kwenye menyu mpya, na unaendelea kufanya kazi kwenye toleo la sasa la BizTrack.

Njia (route) na majina ya permissions ni yale yale ya BizTrack ya sasa, kwa hiyo ufikiaji wa watumiaji haubadiliki.

## Awamu 1 na 2 — zimehamishwa (10 kati ya 46 za menyu)

| Ukurasa | Njia | Permission | Hali |
|---|---|---|---|
| dashboard | `/dashboard` | — | Dashibodi (toleo la kwanza, bila kadi za AI) |
| customers | `/sales/customers` | `view_customers` | Imehamishwa |
| products | `/inventory/products` | `view_products` | Imehamishwa |
| product_categories | `/categories/products` | `view_product_categories` | Imehamishwa |
| price_categories | `/categories/prices` | `view_price_categories` | Imehamishwa |
| invoice_sale | `/sales/invoice` | `create_invoice` | Imehamishwa — POS: kikapu kinasawazishwa na server, cash/credit/pending, kuhariri order, barcode (maandishi + kamera), risiti |
| pending_orders | `/sales/pending` | `view_pending_invoices` | Imehamishwa — Orodha + muhtasari: kulipa, kukamilisha, kughairi, kufungua, kufuta, kuhariri |
| sales_history | `/sales/history` | `view_sales_records` | Imehamishwa — Vichujio, export ya kurasa zote, maelezo, risiti, kuanzisha return |
| sales_returns | `/sales/returns` | `view_sales_returns` | Imehamishwa — Kuunda (kiasi/hali/restock), kuidhinisha, kukataa, ukaguzi wa kiasi |
| debits | `/sales/debits` | `view_debits` | Imehamishwa — Maelezo, kulipa, kikumbusho cha SMS, mark overdue, muhtasari |

Kurasa za kuingia zimehamishwa pia: Login, Register, VerifyEmail, ForgotPassword, NewPassword, pamoja na skrini ya "nenosiri limeisha" na ya "subscription imeisha".

### Ndani ya kurasa zilizohamishwa
- **Products:** orodha na utafutaji wa server, fomu ya kuongeza/kuhariri (barcode kwa kamera, picha kupitia Cloudinary, expiry kwa mipangilio ya store), maelezo, kuchapisha barcode, kufuta moja na nyingi, export PDF/Excel/CSV/Print/Copy ya bidhaa zote.
- **Customers:** orodha, kuongeza/kuhariri (aina ya mteja kutoka price categories, credit limit, credit due days), maelezo, kufuta, export.
- **Product Categories** na **Price Categories:** orodha, kuongeza/kuhariri/kufuta (Price Categories: utafutaji na kurasa hufanyika kwenye mteja kwa sababu server inarudisha zote kwa pamoja).
- **Profile:** jina, barua pepe, simu, lugha, picha, kubadilisha nenosiri.
- **Dashboard:** KPI za leo/mwezi, mwenendo wa mapato, malipo kwa njia, mauzo ya hivi karibuni, bidhaa bora, vitendo vya haraka. **Bado hakuna:** kadi za AI (Awamu 5), "Top Selling", na DefaultDashboard kamili kwa watumiaji wenye ruhusa chache.

## Bado — zinasubiri (36)

| Ukurasa | Njia | Permission | Awamu |
|---|---|---|---|
| purchase_orders | `/purchases/orders` | `view_purchase_orders` | 3 |
| goods_received | `/purchases/goods-received` | `view_grn` | 3 |
| suppliers | `/purchases/suppliers` | `view_suppliers` | 3 |
| supplier_invoices | `/purchases/invoices` | `view_supplier_invoices` | 3 |
| supplier_payments | `/purchases/payments` | `view_supplier_payments` | 3 |
| supplier_returns | `/purchases/returns` | `view_supplier_returns` | 3 |
| current_stock | `/inventory/current-stock` | `view_current_stock` | 4 |
| current_stock_value | `/inventory/stock-value` | `view_current_stock_value` | 4 |
| stock_value_history | `/inventory/stock-value-history` | `view_stock_value_history` | 4 |
| price_list | `/inventory/pricelist` | `view_price_list` | 4 |
| stock_adjustment | `/inventory/adjustment` | `view_stock_adjustment` | 4 |
| stock_count | `/inventory/stock-count` | `view_stock_count` | 4 |
| stock_transfer | `/inventory/stock-transfer` | `view_stock_transfer` | 4 |
| import_export | `/inventory/import-export` | `view_imports_exports` | 4 |
| expenses | `/expenses` | `view_expenses` | 4 |
| sales_reports | `/reports/sales` | `view_sales_reports` | 5 |
| purchases_reports | `/reports/purchases` | `view_purchase_reports` | 5 |
| expenses_reports | `/reports/expenses` | `view_supplier_payments` | 5 |
| profit_reports | `/reports/profit` | `view_profit_reports` | 5 |
| net_profit_reports | `/reports/net-profit` | `view_profit_reports` | 5 |
| inventory_reports | `/reports/inventory` | `view_current_stock` | 5 |
| users | `/users/all` | `view_users` | — |
| roles | `/users/roles` | `view_roles` | — |
| permissions | `/users/permissions` | `manage_permissions` | — |
| stores | `/stores` | `view_stores` | — |
| configurations | `/settings/configurations` | `view_configurations` | 5 |
| uploads | `/settings/uploads` | `view_uploads` | 5 |
| bulk_operations | `/settings/bulk-operations` | `view_bulk_operations` | 5 |
| integration | `/settings/integration` | `view_integration` | 5 |
| security | `/settings/security` | `view_security` | 5 |
| tools | `/settings/tools` | `view_tools` | 5 |
| notifications | `/settings/notifications` | `view_notifications` | 5 |
| appearance | `/settings/appearance` | `view_appearance` | 5 |
| subscription | `/subscription` | `view_subscription` | 5 |
| biztrack_ai | `/biztrack-ai` | `ai_access` | 5 |
| user_manual | `/user-manual` | — | 5 |

Kurasa za ndani ambazo hazimo kwenye menyu na bado hazijahamishwa: `/sales/pending/preview`, `/sales/receipt`, `/reports/day-report`, `/biztrack-ai`, `/support/admin`, `/lock` (IdleLock), `/user-manual`.

## Vipengele visivyo kurasa — hali
| Kipengele | Hali |
|---|---|
| Upgrade salama ya database (mpya / iliyopo / iliyo nyuma) | Imekamilika na kujaribiwa |
| Backup ya ndani kabla ya kila migration (inajaribu restore) | Imekamilika; inabeba sasa views, functions na triggers |
| `db:verify`, `db:backup`, `db:restore` | Imekamilika |
| Permissions per store, kubadilisha store bila kupakia upya | Imekamilika |
| Lugha mbili (Kiswahili/Kiingereza) | Imehamishwa (funguo zote) |
| Real-time kupitia socket | Imeunganishwa (orodha zinafetch upya); haijajaribiwa na watumiaji wengi |
| PWA (desktop na simu) | Manifest, service worker, icons, banner ya kusakinisha; **haijajaribiwa kwenye vifaa** |
| Injini ya PDF/Excel/CSV ya BizTrack | Imehamishwa bila mabadiliko (`utils/exportUtils.js`) |
| PDF za risiti, PO, delivery note, subscription | Mafaili yamehamishwa; **risiti imeunganishwa na kujaribiwa (58mm/80mm/A5)**; PO/delivery note ni Awamu 3, subscription Awamu 5 |
| QZ Tray (kuchapisha moja kwa moja) | Bado (mabaki ya Awamu 2); `/api/qz/sign` bado haina kuingia |
| Skana ya barcode kwa kamera | Imekamilika kwenye fomu ya Products |
| IdleLock (skrini ya kufunga), sera ya usalama kwa store | Bado (Awamu 5) |
| Notifications (kengele), AI, Messaging/SMS, Subscription, Support, Backup ya Google Drive | Bado (Awamu 5); server yake tayari ipo na inapakia |
| Import / Export kwa wingi | Bado (Awamu 4–5) |
