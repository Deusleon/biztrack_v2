# Paste this as the FIRST message in the new chat (and attach the 4 files listed in HANDOFF.md §2)

---
Habari. Tunaendelea na mradi wa kuandika upya **BizTrack** kwa muundo wa **EduTrack** (muonekano na namna ya CRUD vilingane, PDF za BizTrack zibaki, hakuna function ya BizTrack ipotee, database ipandishwe bila kupoteza data, na app isakinishwe kama PWA).

Kazi ya Awamu 1 hadi 4 (msingi + Sales + Purchases + Inventory + Expenses) imekamilika na imo kwenye zip nilizoambatanisha. **Kwanza soma `HANDOFF.md` yote kwa makini** (iko kwenye mzizi wa `biztrack-v2`), kisha `MIGRATION_CHECKLIST.md` na `docs/ORIGINAL_MAP.md`. Faili zilizoambatanishwa:
1. `biztrack-v2-awamu-4.zip` — kazi iliyofanyika (backend + frontend + tools)
2. `biztrack-ai-integrated.zip` — BizTrack ya asili (chanzo cha kila ukurasa wa kuhamisha)
3. `EduTrack.zip` — app ya mfano
4. `biztrack_backup_2026-10-31-20-59_sql.gz` — database ya majaribio

Mambo ya kufanya mwanzo:
- Fungua zip, sakinisha `backend` na `frontend` (`npm install`), jenga database ya majaribio kwa `tools/dev/load-test-db.sh`, kisha endesha `tools/run-all-tests.sh` na `npx vite build` ili kuthibitisha kwamba kila kitu kinaanzia pale Awamu 1 ilipoishia (majaribio 165 yanapaswa kupita).
- Nijibu **kwa Kiswahili**. Uliza maswali yaliyo kwenye `HANDOFF.md` §12 **moja moja** kabla ya kuanza kazi kubwa — hasa kuhusu mafaili yaliyo kwenye `_unattributed_files/` na usalama wa `/api/qz/sign`.
- Kisha endelea na **Awamu 5** (kubwa kuliko zote: pendekeza kuigawanya 5a Reports, 5b Users/Stores/Settings/Usalama, 5c Messaging/Subscription/Support/AI na uniulize nianze ipi) kufuata "Recipe" ya §6: soma ukurasa wa asili wote, andika orodha ya vipengele kwenye `MIGRATION_CHECKLIST.md`, jenga kwa mtindo wa kurasa zilizopo (`pages/sales/Customers.jsx` na `pages/sales/Debits.jsx` `pages/purchases/Orders.jsx` na `pages/inventory/StockTransfer.jsx` ni vielelezo), andika test mpya kwenye `tools/tests/`, na uniambie wazi kipi kimethibitishwa na kipi hakijathibitishwa.

Kanuni zangu: usipoteze function yoyote ya BizTrack; PDF zibaki za BizTrack; CRUD iende kama EduTrack (hifadhi → toast → pakia upya kutoka server); na usidai kitu kinafanya kazi bila kukijaribu.
---
