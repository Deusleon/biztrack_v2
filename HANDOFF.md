# HANDOFF — BizTrack 2 (read this first)

> **Muhtasari kwa Deus (Kiswahili):** Hati hii inamwambia Claude mwingine kila kitu: tulipofikia (Awamu 1 imekamilika), muundo wa mradi, jinsi ya kuendesha na kujaribu, jinsi ya kuhamisha ukurasa mmoja mmoja kwa mtindo uleule, na kazi yote iliyobaki (Awamu 2–5 + ukaguzi wa mwisho). Mpe Claude mpya: (1) zip hii, (2) `biztrack-ai-integrated.zip`, (3) `EduTrack.zip`, (4) backup ya database `biztrack_backup_2026-10-31-20-59_sql.gz`, kisha bandika ujumbe ulio kwenye `NEXT_CLAUDE_PROMPT.md`. Mwambie ajibu kwa Kiswahili.

---

## 0. In one paragraph
The user (Deus) runs several apps and wants **BizTrack** (a multi-store retail/POS system: sales, purchases, stock, reports, SMS, AI, subscriptions) rewritten on the same approach and look as his other app **EduTrack**, **without losing any BizTrack function**, with a **safe in-place database upgrade**, installable as a desktop/mobile app (PWA). **Phases 1–4 of 5 (foundation + Sales + Purchases + Inventory + Expenses) are done and delivered** (this zip). The rest is a page-by-page port with a proven recipe (section 6) and a test harness (section 5).

## 1. The user and the working agreement
- **Language:** the user writes Swahili. **Reply in Swahili** (technical terms may stay English). Documentation in the repo is mixed; code and comments are English.
- **His requirements (verbatim intent):**
  1. Rewrite BizTrack using EduTrack's approach — **same CRUD handling and smooth interaction** (fetch → modal → save → toast → reload from server; no hand-edited lists; persisted filters; confirm dialogs).
  2. **Lose no important BizTrack functionality.** Process (fetch/create/update/delete) may change, features may not. Keep a checklist.
  3. **PDF styles stay BizTrack's.** Other UI may change as needed but should not differ greatly from EduTrack's look (all his apps should look alike).
  4. If the database structure changes, ship a **safe upgrade that loses no data** (done: structure is unchanged; see section 3).
  5. **Installable** as desktop or mobile app on different devices (PWA, done in Phase 1, untested on devices).
  6. **Ask him questions whenever unsure** — he asked for this explicitly. One focused question at a time works best.
- He gave a **test database** (`biztrack_backup_2026-10-31-20-59_sql.gz`, data is fake — no need to protect it).
- Quality bar he praised: honest reporting of what is verified vs not, real tests against a real database, finding and fixing security gaps. Keep doing that. Never claim something works unless it was run.

## 2. What to upload / have in the new chat
| File | Why |
|---|---|
| `biztrack-v2-awamu-1-final.zip` (this project) | the work so far |
| `biztrack-ai-integrated.zip` | the ORIGINAL BizTrack: `biztrack_backend_review/`, `biztrack_frontend_review/` — source of truth for every page to port (see `docs/ORIGINAL_MAP.md`) |
| `EduTrack.zip` | the reference app (its `frontend/src/components/ui`, `pages/Expenses/ExpenseList.jsx` etc. show the target CRUD pattern; `backend/src/utils/migrate.js`, `services/backup/*` were reused) |
| `biztrack_backup_2026-10-31-20-59_sql.gz` | test data (INSERT-only dump) |
Uploads land in `/mnt/user-data/uploads/`. Unzip them under a work folder, e.g. `/home/claude/work/{biztrack,edutrack}`.

## 3. Key architecture decisions (and why) — do not undo without asking
1. **Backend keeps BizTrack's proven SQL and logic; only the module system and DB access layer changed.** 166 files were converted CommonJS → ESM by a script (`tools/convert/cjs2esm.py` + `postpatch.py`) with *no logic edits*. Rewriting 38k lines by hand into Sequelize models would have risked money/stock bugs for no user benefit.
2. **One connection pool.** `backend/src/config/db.js` exports a `pool` with the same API the controllers always used (`pool.query`, `pool.connect()` → `client.query/release`, BEGIN/COMMIT) but backed by the Sequelize pool (`config/database.js`), which the migration runner and backup tool also use. `DATABASE_URL` still works (so the existing `.env` is valid).
3. **API contract unchanged** (`/api/...`, same bodies). The frontend adapts it in `frontend/src/services/api.js` (`asList/asOne/asDone`) so every page sees EduTrack's shape `{ success, data, pagination: { currentPage, totalPages, totalItems, limit }, message }`.
4. **Database structure is NOT changed.** No table/column rename or drop. The baseline migration `20261107000000-baseline-biztrack-schema.js` runs the 48 original SQL scripts (`backend/src/migrations/sql/`) only for scripts not yet recorded in the old `schema_migrations` table — so: empty DB → full build; existing DB → no-op; DB that is behind → only the missing scripts. **Consequence: the old BizTrack app keeps working against an upgraded DB → rollback is trivial.** New structure changes must be added as new files in `backend/src/migrations/` (Sequelize-style `up/down`, timestamp-prefixed) — never edit old ones.
5. **Every migration is preceded by an automatic full backup that is restore-tested** (`services/backup/dumpEngine.js`, adapted from EduTrack and **extended in this project to include views, functions and triggers** — EduTrack's did not, and BizTrack has 1 view, 1 function, 20 triggers). `npm run db:verify` compares a DB with a backup; `npm run db:restore -- <file> --yes` restores.
6. **Frontend = EduTrack's patterns**, with BizTrack's i18n (en/sw, ~2,800 keys — `t(key, lang)`), per-store permissions (`can('perm')`), store switching without reload, and BizTrack's PDF/Excel/CSV engine **kept verbatim** (`utils/exportUtils.js`, `receiptPdf.js`, `purchaseOrderPdf.js`, `deliveryNotePdf.js`, `subscriptionReceiptPdf.js`) wrapped by `components/ExportMenu.jsx`.
7. **Real-time:** BizTrack's socket events are kept, but pages never patch their own rows; they call `useLiveRefresh([...events], reload)` which simply reloads from the server.
8. **No MUI / sonner / react-hook-form / lucide** in the new frontend. When porting an original page: icons → `components/ui/Icon.jsx` or `ICON_PATHS` (`utils/navigation.js`) or inline svg; `toast.*` from sonner → `useToast()` (`showSuccess/showError`) or `lib/toast.js` outside components; react-hook-form → controlled state like `pages/sales/Customers.jsx`.

## 4. Repository map
```
README.md                     user-facing setup / upgrade / PWA / security notes (Swahili)
HANDOFF.md                    this file
NEXT_CLAUDE_PROMPT.md         message to paste into the new chat
MIGRATION_CHECKLIST.md        every menu page + non-page feature with status  ← keep updated
docs/ORIGINAL_MAP.md          original route → page file (+line counts), every backend route → permission → controller
tools/                        converter, test harness, dev scripts (section 5)
_unattributed_files/          files found in the workspace that were NOT written by this work — see section 9
backend/
  src/server.js               entry (checks pending migrations; REQUIRE_MIGRATIONS=1 refuses to start with pending)
  src/config/{database,db}.js Sequelize + the pool shim
  src/migrations/             20261107…baseline.js + sql/001…050 (the original 48 scripts)
  src/utils/migrate.js        runner: up | down | status | mark-applied (+ safety backup before up)
  src/utils/{verifyUpgrade,backupCli,passwordStamp}.js
  src/services/backup/        dumpEngine.js (full logical backup/restore/verify), backupService.js
  src/seeds/                  seed.js, seedProduction.js, syncPermissions.js, permissionsList.js (178 permissions)
  src/{controllers,routes,middlewares,validators,services,utils,locales}/   converted original code (unchanged logic)
frontend/
  src/App.jsx                 routes; `READY` map = pages already ported; everything else → ComingSoon
  src/utils/navigation.js     THE menu: sections, paths, permission(s), icons
  src/utils/api.js            axios: token, X-Store-ID, x-language, 401/402/428 handling, normalized errors
  src/services/api.js         one service object per module (add new modules here)
  src/contexts/               Auth (can/canAny), Store, Subscription, StoreSettings, Preferences, Theme, Toast, Language
  src/hooks/                  useServerList (list + filters + paging), useLiveRefresh, usePersistedState, useStoreSettings
  src/components/ui/          EduTrack's Button, Input, Select, DataTable, RowActions, ConfirmModal, DatePicker, … + FormModal (ours)
  src/components/             MainLayout, Sidebar, ProtectedRoute, ExportMenu, BarcodeScanner, ImageInput, AuthShell, Install*/Pwa*
  src/pages/                  auth/*, Dashboard, categories/*, sales/Customers, inventory/{Products,ProductForm,ProductDetails}, profile/Profile
  src/utils/*Pdf.js, exportUtils.js, numberUtils.js …   BizTrack's, copied unchanged
  src/lang/{en,sw}.json       BizTrack's translations + new `ui_*` keys
  public/                     manifest, sw.js (service worker), icons generated from BizTrack's logo
```

## 5. How to run, test and verify (all of this was exercised in this project)
**Prereqs:** Node 20+ (22 used), PostgreSQL 13+ (16 used). In the Claude sandbox: `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client` then `service postgresql start`; set the postgres password: `su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""`.
```bash
cd backend  && npm install
cd ../frontend && npm install
# 1) build a TEST database from the user's backup (also proves migrations + backup loading work)
cd .. && bash tools/dev/load-test-db.sh /path/to/biztrack_backup_2026-10-31-20-59_sql.gz    # → DB biztrack_test, user deusleon7@gmail.com / Test1234!
# 2) run every service-layer test (starts the backend, runs, stops it)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/biztrack_test bash tools/run-all-tests.sh
# 3) frontend
cd frontend && npx vite build && npx eslint src --quiet      # build must pass; lint must show 0 errors (warnings are known debt)
```
- Tests live in `tools/tests/*.mjs` and call the REAL `frontend/src/services/api.js` (the same calls the pages make) against the live backend. **Add a test file for every module you port** (copy `tools/tests/products.mjs`), including: create, update, search, delete, validation refusal, permission/auth refusal.
- Current suites (165 checks, all pass): categories-customers (14), price-categories (7), products (9), profile (7), sales (34), purchases (29), **inventory (31: adjustments, batches, stock value + snapshots, price list, stock count, movements, expenses)**, **transfers (16, between two stores)**, **import-export (15, real .xlsx files)**, receipt-pdf (3, no server needed). `python3 tools/dev/check-keys.py` lists/adds missing translation keys (run it after every page).
- Upgrade safety rehearsal (do again if you touch migrations/backup): `db:migrate` on a copy of the DB → `db:verify` (all tables identical) → damage something → `db:restore -- <file> --yes` → `db:verify`.
- **Sandbox gotchas (these cost time):**
  - A background process dies when the tool call ends → start server + run test + stop it in ONE call (`tools/dev/with-server.sh`). Postgres may also stop between calls: scripts restart it with `service postgresql start`.
  - **Never `pkill -f node …`** — it matches your own shell and kills the tool call. Use `fuser -k PORT/tcp`.
  - `/bin/sh` has no brace expansion (`{a,b}` creates a literal folder) → use `bash -c`.
  - The original sources use CRLF and sometimes odd bytes: read with Python (`errors='replace'`, `.replace('\r','')`) or `tr -d '\r'`; printing binary to the terminal makes the tool fail.
  - Do not `console.log` a caught axios error object (it prints megabytes). Our `utils/api.js` errors carry `.message`, `.status`, `.code`; the raw error is `.original` — print only `.message`.
  - In Python heredocs use `<<'EOF'` and raw strings for regexes.
  - A rename that matches several places (`replace` all) broke `receiptPdf.js` once; lint caught it. Always run lint + build after bulk edits.

## 6. Recipe for porting ONE page (follow it every time)
1. **Find the original** in `docs/ORIGINAL_MAP.md` (page file, its `forms/`, `modals/`, `hooks/`). Read ALL of it, plus the backend controller(s) for the endpoints it calls. List: columns, filters, actions, permissions (`hasPermission('…')`), exports (`exportable`, pdf/excel/csv/print), socket events, validations, special behaviors (settings-dependent fields, barcode, batches, credit limits…).
2. **Write the feature list into `MIGRATION_CHECKLIST.md` first** (under the page), then tick items as they are built. Nothing may be silently dropped; if something truly cannot be kept, ask the user.
3. **Service:** add methods to `frontend/src/services/api.js` using `asList/asOne/asDone`. Check the real response keys by calling the endpoint (e.g. `{ priceCategories }`, `{ customer }`). Server messages are often *keys* (`customer_created`); `ToastContext` already runs `t()` on them.
4. **Page:** copy the closest template —
   - simple CRUD: `pages/categories/ProductCategories.jsx`
   - CRUD + export + view modal + related lookup: `pages/sales/Customers.jsx`
   - complex form (settings-dependent fields, image, barcode, bulk delete): `pages/inventory/Products*.jsx`
   Use `useServerList({ fetcher })`, `DataTable`, `RowActions`, `FormModal`, `ConfirmModal`, `ExportMenu`, `useLiveRefresh`. After a successful save/delete **call `list.reload()`** — never mutate rows. On a failed save keep the modal open with what was typed. Gate every button with `can('…')` using the ORIGINAL permission names.
5. **Money/dates:** use `formatCurrency(value, settings)` / `formatNumberWithCommas` (`utils/numberUtils.js`) with `useStoreSettings()` so currency, decimals and date format follow the store's settings exactly like the original.
6. **PDF/Excel/print:** reuse the original generators (already in `utils/`). Do not restyle them.
7. **Translations:** every `t('key', lang)` must exist in `src/lang/en.json` and `sw.json`. Check with:
   ```python
   import json,re,glob; en=json.load(open('frontend/src/lang/en.json'))
   for f in glob.glob('frontend/src/**/*.jsx',recursive=True): 
       miss=[k for k in set(re.findall(r"\bt\('([a-z0-9_&.]+)'",open(f).read())) if k not in en]
       if miss: print(f,miss)
   ```
   Add missing keys to BOTH files (Swahili too). New UI-only strings use the `ui_` prefix.
8. **Route:** import lazily in `App.jsx` and add to the `READY` map (`'/path': <Page />`). The menu entry already exists in `utils/navigation.js`.
9. **Test:** add `tools/tests/<module>.mjs`, run `tools/run-all-tests.sh`, then `npx vite build` and `npx eslint src --quiet` (0 errors).
10. **Update `MIGRATION_CHECKLIST.md`** (move the row to "done", list what is inside) and report to the user what was verified and what was not.

## 7. Where we are — Phases 1–4 (DONE, delivered)
Backend: all 166 modules load; migrations/backup/restore/verify rehearsed; security fixes (section 8).
Frontend (build passes, lint 0 errors / 22 warnings): shell (Sidebar, MainLayout, ProtectedRoute with password-expired / subscription-locked / no-permission states), auth pages (Login, Register, VerifyEmail, ForgotPassword, NewPassword), Dashboard v1, Product Categories, **Price Categories**, Customers, Products (full), Profile (incl. avatar and password), PWA files, i18n.
**Verified by tests (37 checks, real DB):** login, store switch (176 perms), CRUD for categories/price categories/customers/products incl. bulk delete and barcode lookup, validation refusals, no-token refusal, profile + password change + old-token revocation, dashboard stats.
**NOT verified (no browser/device in the sandbox):** how pages look/behave in a real browser and on phones; PWA install on devices; camera barcode scan; Cloudinary upload; PDF output by eye; socket between several users; many concurrent users. First thing to do when a browser is available (or ask the user to try): open `/login`, sign in, walk each ported page.

### Phase 2 — Sales (DONE)
Pages (all under `frontend/src/pages/sales/`, routes registered in `App.jsx`): **Invoice** (POS) · **Pending** (list) · **OrderPreview** (`/sales/pending/preview`: items, payments, record payment, complete sale, edit, cancel, reopen, delete) · **History** (filters, export of ALL pages, detail, receipt, start return) · **Receipt** (BizTrack's own PDF in 58mm/80mm/A5: preview, print, download) · **Returns** (create from an invoice with per-line quantity/condition/restock, approve, reject) · **Debits** (credit sales: details, record payment, SMS reminder, mark overdue). Shared: `common.jsx` (StatusBadge, FilterBar), `utils/receiptData.js`, `hooks/useSaleItems.js` (the original calculation hook, **copied unchanged**), `salesService` in `services/api.js`.
How POS works (important for anyone touching it): the **server sells from its own copy of the cart** (`cart` rows with status `OnProcess`, keyed by `cart_code`). The page therefore (1) keeps that copy in sync with a debounced `syncActiveCart`, (2) calls `syncActiveCart` again right before `recordSale`/`saveDraftOrder`, and (3) restores the active cart on load (`getActiveCart`). Editing a pending order: `reopenOrder` → sync → sell, or `saveOrderChanges` (note: items use `selling_price`, and `paymentMethod` is required by its validator).
**Verified (`tools/tests/sales.mjs`, real DB):** cash sale (invoice, stock 50→48), same cart cannot be sold twice, selling above stock refused, pending order with a typed new customer, edit, payment on order, cancel/list/reopen, sell pending (stock 48→44), delete, credit sale (stock, due 2500), payments to zero (status paid), overpayment refused, mark overdue, return create/approve (restock 42→43)/reject, over-return refused, 401 without token; `receipt-pdf.mjs` produces real PDFs in all 3 sizes.
**NOT verified:** the pages in a real browser; the SMS reminder (needs a configured SMS provider); the look of the receipt PDFs next to the original; QZ Tray.

### Phase 3 — Purchases (DONE)
Pages (`frontend/src/pages/purchases/`): **Suppliers** · **Orders** (PO list, editor with items/discount/tax and live totals, a NEW order is kept as a server-side draft via `active-cart`/`sync-cart`, detail, approve / reject with reason, edit, delete (drafts only), "Receive goods", PO PDF with `exportPurchaseOrderToPDF`) · **GoodsReceived** (receive against an approved/partially received PO: quantity, unit cost, selling price, batch, mfg/expiry dates; inspection; delete) · **Invoices** (supplier invoices from a GRN with totals, payments, edit, approve, delete) · **Payments** (pay an outstanding invoice, cancel payment) · **Returns** (return received goods per GRN line with condition/reason/refund method; approve; delete). Shared: `common.jsx` (PStatus, PFilters, useSuppliers, useAllProducts, listFetcher), `PaymentModal.jsx`; `supplierService` and `purchaseService` in `services/api.js`.
Server rules worth knowing (all discovered by `tools/tests/purchases.mjs`): a new GRN is **approved at once and stock increases immediately** unless the store setting `settings.purchases.requireGRNInspection` is true — then it is `pending_inspection`, stock moves only for the ACCEPTED quantity at `inspect` (items are sent as `{ id, accepted_quantity, rejected_quantity, rejection_reason }`; the `id` is the GRN item id; selling price comes from the stored GRN item and is mandatory when `operations.useBatchWisePrice`); a PO can be deleted only while `draft` (a new PO is `pending_approval`); the server refuses payments above the invoice balance (`payment_exceeds_balance`) and returns above the remaining returnable quantity (`return_quantity_exceeds_remaining`); approving a supplier return takes stock out.
**Verified (29 checks, real DB):** supplier CRUD + search, PO create/update/approve/list/delete rules, GRN in both modes with exact stock (10→35, and 30→38 for 8 accepted of 10), invoice create, payments (5000 then 15000), overpayment refused, payment cancellation restoring the balance, supplier return create/approve (stock 35→30), over-return refused, dashboard endpoint, 401 without token.
**NOT verified:** the pages in a browser; PO PDF look vs the original.
**Not ported on purpose:** `PurchaseDashboardTab` and `PurchaseOrderPrintPage` exist in the original but **nothing references them** (dead code); the backend endpoints `/purchases/dashboard` and `/purchases/supplier/:id/statement` work and are wrapped in `purchaseService.dashboard/statement` for the Phase 5 reports. The original `usePurchaseItems` hook was replaced by the editor in `Orders.jsx`.
**Phase 2 addendum:** while checking Purchases I found the original sales history also had a **Delivery note (A4 PDF)** action; it is now in `pages/sales/History.jsx` (row action + detail button) using the unchanged `utils/deliveryNotePdf.js`.

### Phase 4 — Inventory + Expenses: DONE (see §7). Leftovers (none blocks Phase 5):
- Quick-adjust from the stock list and the per-product adjustment modal are reachable through the Adjustment page (filters / "by product" tab) — no separate modal like the original.
- `import-export` for contacts → Phase 5 Messaging.
- Tests leave products, snapshots, transfers and expenses in the TEST database (re-run `tools/dev/load-test-db.sh` to reset).

### Phase 5 — Reports, administration, messaging, settings, subscription, AI, support (≈ 16,000+ original lines)

**Reports (6,552 lines; backend `report.controller.js` **4,547 lines** — the largest SQL in the system):** sales, purchases, expenses, profit, net profit, day report, inventory; each has filters by date range/store, summary cards, tables, **PDF/Excel/CSV with the BizTrack look** (`exportToPDF(..., withFooter, orientation, columnStyles, fromDate, toDate)`), and an AI "explain this report" hook (`services/ai/explain/*`). Reuse `ExportMenu` (pass `withFooter`, `orientation`, dates).
**Users / Roles / Permissions / Stores (≈ 1,800 lines):** `user.controller`, `role.controller`, `permission.controller`, `storeUser.controller` (create users with default password + forced change), `store.controller` (create/update/delete store with password confirmation). Permission grid is per role per store (`role_permissions`). Run `npm run permissions:sync` after deploying new permission names.
**Settings (3,831 lines):** configurations (currency, decimals, date format, negative stock, expiry, default price category, batch-wise price, units…), uploads (branding), bulk operations, integrations (**developer-only**, `DEVELOPER_EMAIL`, `middlewares/developerOnly.js`, env `DEVELOPER_EMAIL`), security (policy in `store_settings.settings.operations.security`: sessionTimeout, loginAttempts, passwordExpiry, accountLockMinutes — enforced by `authController` / `authMiddleware`), tools (activity/system logs, Google Drive backups UI: `backup.controller`), notifications (per-event toggles `inapp_<type>`), appearance (theme — `ThemeContext` already has presets incl. "BizTrack Navy"; also wire `PreferencesContext` to the server settings, today it only caches locally via `settingsService` stub in `services/api.js`).
**Messaging / SMS (2,620 lines):** recent, contacts, groups (+subgroups), templates, account & top-up; providers/integrations (`messaging.controller`, `integration.controller`, tables `messaging_*`, `sms_*`).
**Subscription (468) + ClickPesa webhook:** `subscription.controller/service`; the 402 lock flow is already in the frontend (`SubscriptionContext`, `ProtectedRoute`) — the page itself is missing. **Support (422)**: ticket admin + public create/track endpoints (`/api/support/tickets/public|track`).
**AI (188 + dashboard cards + backend `services/ai/*`):** assistant chat page, business summary card, ask card, tools registry; providers via env (`AI_PROVIDER` gemini/groq/openai/ollama). Needs keys to test — ask the user or mock.
**Cross-cutting still missing:** notifications bell + `NotificationContext` (socket `inAppNotification`), **IdleLock** + `LockScreen` (route `/lock`, auto-lock by security policy), `UserManualPage` (PDFs already in `frontend/public/manuals/`), full `DefaultDashboard`, Dashboard AI cards/Top Selling/KPI comparisons, switch Google-Drive cloud backup to `dumpEngine`, prune dependencies.
**Acceptance:** per-module tests; report numbers cross-checked against the original app on the same data (run both and compare totals); PDFs compared visually with the original's output.

| Route | Original page file | Lines | Route permission(s) in the original |
|---|---|---|---|
| `/lock` | `src/pages/LockScreen.jsx` | 41 | — |
| `/support/admin` | `src/pages/support/SupportAdminPage.jsx` | 422 | — |
| `/user-manual` | `src/pages/UserManualPage.jsx` | 98 | — |
| `/biztrack-ai` | `src/pages/ai/BizTrackAIPage.jsx` | 188 | ["ai_access"] |
| `/reports/sales` | `src/pages/reports/SalesReportsPage.jsx` | 2276 | ["view_sales_reports"] |
| `/reports/expenses` | `src/pages/reports/ExpensesReportsPage.jsx` | 232 | ["view_expense_reports"] |
| `/reports/purchases` | `src/pages/reports/PurchasesReportsPage.jsx` | 1087 | ["view_purchase_reports"] |
| `/reports/profit` | `src/pages/reports/ProfitReportsPage.jsx` | 1511 | ["view_profit_reports"] |
| `/reports/net-profit` | `src/pages/reports/NetProfitReportsPage.jsx` | 242 | ["view_profit_reports"] |
| `/reports/day-report` | `src/pages/reports/DayReportPage.jsx` | 215 | ["view_sales_reports"] |
| `/reports/inventory` | `src/pages/reports/InventoryReportsPage.jsx` | 989 | ["view_inventory_reports"] |
| `/users/all` | `src/pages/users/UsersPage.jsx` | 401 | ["view_users","edit_users","delete_users"] |
| `/users/roles` | `src/pages/users/RolesPage.jsx` | 301 | ["view_roles","create_roles","edit_roles","delete_roles"] |
| `/users/permissions` | `src/pages/users/PermissionsPage.jsx` | 475 | ["manage_permissions"] |
| `/stores` | `src/pages/store/StorePage.jsx` | 302 | ["view_stores","edit_stores","delete_stores"] |
| `/settings/configurations` | `src/pages/settings/ConfigurationPage.jsx` | 747 | ["view_configurations","edit_configurations"] |
| `/settings/uploads` | `src/pages/settings/UploadsPage.jsx` | 255 | ["view_uploads","manage_uploads"] |
| `/settings/bulk-operations` | `src/pages/settings/BulkOperationsPage.jsx` | 463 | ["view_bulk_operations","manage_inventory"] |
| `/settings/integration` | `src/pages/settings/IntegrationsPage.jsx` | 674 | ["view_integration","manage_integration"] |
| `/messaging/recent` | `src/pages/messaging/SendMessagePage.jsx` | 161 | ["view_messaging","manage_messaging"] |
| `/messaging/contacts` | `src/pages/messaging/AllContactsPage.jsx` | 151 | ["view_messaging","manage_contacts"] |
| `/messaging/groups` | `src/pages/messaging/GroupsPage.jsx` | 219 | ["view_messaging","manage_groups"] |
| `/messaging/templates` | `src/pages/messaging/TemplatesPage.jsx` | 152 | ["view_messaging","manage_templates"] |
| `/messaging/account` | `src/pages/messaging/AccountPage.jsx` | 369 | ["view_messaging","manage_messaging_account"] |
| `/messaging` | `-` | 0 | — |
| `/settings/security` | `src/pages/settings/SecurityPage.jsx` | 340 | ["view_security","manage_security"] |
| `/settings/tools` | `src/pages/settings/ToolsPage.jsx` | 738 | ["view_tools","manage_tools"] |
| `/settings/notifications` | `src/pages/settings/NotificationsPage.jsx` | 256 | ["view_notifications","manage_notifications"] |
| `/settings/appearance` | `src/pages/settings/AppearancePage.jsx` | 358 | ["view_appearance","manage_appearance"] |
| `/subscription` | `src/pages/subscription/SubscriptionPage.jsx` | 468 | — |
| `/` | `src/pages/Dashboard.jsx` | 916 | ["view_dashboard"] |


### Phase 6 — parity audit and cut-over (after Phase 5)
1. Walk `MIGRATION_CHECKLIST.md` row by row against the original app running on the same test DB; list differences; fix or get the user's approval.
2. Run the full test suite + a new "smoke" per module; run the upgrade rehearsal (section 5) once more on a fresh copy of the user's *real* DB (ask him for a backup; take your own first).
3. Security pass: unauthenticated route scan, permission checks on every write route, rate limits, CORS (`CLIENT_URL`), `JWT_*` secrets, QZ sign route, upload routes.
4. Deployment doc: build `frontend/dist` (HTTPS + SPA fallback), backend `.cpanel.yml` (original deploys to `/home/kianocot/biztrack-backend` with Node 20), `npm run db:migrate`, `npm run permissions:sync`, `npm run db:verify`. **Rollback = point hosting back to the old app** (the DB structure is unchanged) or `db:restore`.
5. PWA on real devices (Windows/Mac Chrome-Edge, Android Chrome, iPhone Safari): install, offline shell message, update prompt, printing (QZ Tray and browser print), camera.

## 12. Questions to put to the user early (one at a time)
1. Is the `_unattributed_files/` work his? (keep / merge / delete)
2. Add auth to `POST /api/qz/sign`? (recommended yes)
3. Phase 5 is the largest (≈16,000 original lines): propose splitting it into 5a Reports (the 4,547-line `report.controller`), 5b Users/Roles/Permissions/Stores/Settings/Security/Notifications/IdleLock, 5c Messaging, Subscription, Support, AI, Profile extras — and ask which he wants first.
4. Can he give a backup of the REAL database (not only test data) for the final rehearsal, and which hosting does he use (cPanel Node app per `.cpanel.yml`)?
5. Any OpenAI/Gemini/ClickPesa/SMS credentials available for testing Phase 5 integrations, or should they be mocked?

## 13. Definition of done for the whole project
Every row in `MIGRATION_CHECKLIST.md` is "done" or explicitly dropped by the user; every page uses the EduTrack CRUD flow; PDFs look like BizTrack's; the DB upgrade has been rehearsed on a copy of the real data with `db:verify` clean; the suites pass; the app installs as a PWA on the user's devices; README and this HANDOFF are updated.
