# MIGRATION_CHECKLIST — kila ukurasa na kipengele cha BizTrack

Hali ya uhamisho kwenda BizTrack mpya (muundo wa EduTrack). **Hakuna kipengele kilichoondolewa:** ukurasa ambao bado haujahamishwa unaonyesha "unahamishiwa" kwenye menyu mpya, na unaendelea kufanya kazi kwenye toleo la sasa la BizTrack.

Njia (route) na majina ya permissions ni yale yale ya BizTrack ya sasa, kwa hiyo ufikiaji wa watumiaji haubadiliki.

## Awamu 1–4 na 5a (Reports) — zimehamishwa (31 kati ya 46 za menyu)

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
| purchase_orders | `/purchases/orders` | `view_purchase_orders` | Imehamishwa — PO: kihariri cha bidhaa (punguzo/kodi), rasimu ya server, idhini/kukataa, hariri, futa (rasimu), PDF |
| goods_received | `/purchases/goods-received` | `view_grn` | Imehamishwa — Kupokea kwa PO (batch, tarehe, bei), njia mbili (idhini mara moja / ukaguzi), futa |
| suppliers | `/purchases/suppliers` | `view_suppliers` | Imehamishwa — CRUD, utafutaji, export, maelezo |
| supplier_invoices | `/purchases/invoices` | `view_supplier_invoices` | Imehamishwa — Ankara kutoka GRN, jumla, hariri, idhinisha, malipo, futa, export |
| supplier_payments | `/purchases/payments` | `view_supplier_payments` | Imehamishwa — Kulipa ankara (si zaidi ya deni), kughairi, export |
| supplier_returns | `/purchases/returns` | `view_supplier_returns` | Imehamishwa — Return kwa GRN (hali/sababu/njia ya kurudishiwa), idhinisha, futa |
| current_stock | `/inventory/current-stock` | `view_current_stock` | Imehamishwa — Hali ya stock (ndani/chini/imeisha), muhtasari, expiry, batches na kuhariri batch, export |
| current_stock_value | `/inventory/stock-value` | `view_current_stock_value` | Imehamishwa — Thamani kwa price category, jumla, export |
| stock_value_history | `/inventory/stock-value-history` | `view_stock_value_history` | Imehamishwa — Snapshot, maelezo, kufuta |
| price_list | `/inventory/pricelist` | `view_price_list` | Imehamishwa — Bei kwa price category na batch, kusasisha bei, export |
| stock_adjustment | `/inventory/adjustment` | `view_stock_adjustment` | Imehamishwa — Ongeza/punguza kwa sababu, batch-wise, historia, tab ya kwa bidhaa |
| stock_count | `/inventory/stock-count` | `view_stock_count` | Imehamishwa — Kuhesabu, uthibitisho, historia, tab ya harakati (ndani/nje) |
| stock_transfer | `/inventory/stock-transfer` | `view_stock_transfer` | Imehamishwa — Kutuma, kuidhinisha, kupokea upande wa pili, kughairi, kufuta |
| import_export | `/inventory/import-export` | `view_imports_exports` | Imehamishwa — Violezo, kupakia Excel kwa uthibitisho, makosa kwa safu, export |
| expenses | `/expenses` | `view_expenses` | Imehamishwa — Vichujio, jumla, ongeza/hariri/futa, makundi, export |
| sales_reports | `/reports/sales` | `view_sales_reports` | Imehamishwa — Ripoti 10 za mauzo (muhtasari, kina, returns, ulinganisho, kwa bidhaa/mhudumu/mteja/kundi/malipo, madeni); export kwa injini ya PDF ya BizTrack |
| purchases_reports | `/reports/purchases` | `view_purchase_reports` | Imehamishwa — Ripoti 12 za manunuzi (muhtasari, kina, kwa bidhaa/msambazaji, madeni ya wasambazaji, ankara, returns, mwenendo, kujaza stock, gharama, utendaji, GRN); export kwa injini ya PDF ya BizTrack |
| expenses_reports | `/reports/expenses` | `view_supplier_payments` | Imehamishwa — Ripoti ya malipo kwa wasambazaji (inaitwa expenses reports kwenye asili); export kwa injini ya PDF ya BizTrack |
| profit_reports | `/reports/profit` | `view_profit_reports` | Imehamishwa — Ripoti 8 za faida (muhtasari, kina, kwa bidhaa/kundi/mhudumu/mteja, margins, mwenendo); export kwa injini ya PDF ya BizTrack |
| net_profit_reports | `/reports/net-profit` | `view_profit_reports` | Imehamishwa — Faida halisi (mapato − gharama ya bidhaa − matumizi); export kwa injini ya PDF ya BizTrack |
| inventory_reports | `/reports/inventory` | `view_current_stock` | Imehamishwa — Ripoti 13 za stock (sasa, muhtasari, kina, ledger, imeisha, chini ya kiwango, zinazoingia/zinazotoka, zinazouzwa haraka, zilizokaa, marekebisho, uhamisho); export kwa injini ya PDF ya BizTrack |

Kurasa za kuingia zimehamishwa pia: Login, Register, VerifyEmail, ForgotPassword, NewPassword, pamoja na skrini ya "nenosiri limeisha" na ya "subscription imeisha".

### Ndani ya kurasa zilizohamishwa
- **Products:** orodha na utafutaji wa server, fomu ya kuongeza/kuhariri (barcode kwa kamera, picha kupitia Cloudinary, expiry kwa mipangilio ya store), maelezo, kuchapisha barcode, kufuta moja na nyingi, export PDF/Excel/CSV/Print/Copy ya bidhaa zote.
- **Customers:** orodha, kuongeza/kuhariri (aina ya mteja kutoka price categories, credit limit, credit due days), maelezo, kufuta, export.
- **Product Categories** na **Price Categories:** orodha, kuongeza/kuhariri/kufuta (Price Categories: utafutaji na kurasa hufanyika kwenye mteja kwa sababu server inarudisha zote kwa pamoja).
- **Profile:** jina, barua pepe, simu, lugha, picha, kubadilisha nenosiri.
- **Dashboard:** KPI za leo/mwezi, mwenendo wa mapato, malipo kwa njia, mauzo ya hivi karibuni, bidhaa bora, vitendo vya haraka. **Bado hakuna:** kadi za AI (Awamu 5), "Top Selling", na DefaultDashboard kamili kwa watumiaji wenye ruhusa chache.

## Bado — zinasubiri (15)

| Ukurasa | Njia | Permission | Awamu |
|---|---|---|---|
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

Haitumiki kwenye app ya asili (code isiyotumika, haikuhamishwa): `PurchaseDashboardTab`, `PurchaseOrderPrintPage`. API zake (`/purchases/dashboard`, statement ya msambazaji) zinafanya kazi na zitatumika kwenye Reports (Awamu 5).

Ukurasa wa ziada uliohamishwa: `/reports/day-report` (ripoti ya siku). **Bado:** kitufe cha "eleza ripoti kwa AI" cha kurasa za ripoti za asili (Awamu 5c).

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
| PDF za risiti, PO, delivery note, subscription | Mafaili yamehamishwa; **risiti (58mm/80mm/A5) imejaribiwa**; **PO PDF na delivery note ya mauzo zimeunganishwa**; subscription Awamu 5 |
| QZ Tray (kuchapisha moja kwa moja) | Bado (mabaki ya Awamu 2); `/api/qz/sign` bado haina kuingia |
| Skana ya barcode kwa kamera | Imekamilika kwenye fomu ya Products |
| IdleLock (skrini ya kufunga), sera ya usalama kwa store | Bado (Awamu 5) |
| Notifications (kengele), AI, Messaging/SMS, Subscription, Support, Backup ya Google Drive | Bado (Awamu 5); server yake tayari ipo na inapakia |
| Import / Export ya Excel (bidhaa, stock, bei, kamili) | Imekamilika na kujaribiwa; import ya contacts ni Awamu 5 (Messaging) |
