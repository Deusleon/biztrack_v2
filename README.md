# BizTrack 2 — Awamu 1 na 2

BizTrack iliyoandikwa upya kwa muundo wa EduTrack (muonekano mmoja, CRUD ileile, PWA), ikihifadhi logic na SQL ya BizTrack.
**Hizi ni Awamu 1 na 2 kati ya 5** (msingi + Sales yote). Orodha kamili ya kilichohamishwa na kinachosubiri iko kwenye [`MIGRATION_CHECKLIST.md`](MIGRATION_CHECKLIST.md).

```
backend/    Express + Sequelize (migrations, backup, seeds) — API ya BizTrack ileile (/api/...)
frontend/   React 19 + Vite + Tailwind — PWA inayosakinishika
MIGRATION_CHECKLIST.md
```

## Kilichopo kwenye Awamu 1
Kuingia (login, register, verify, forgot/reset), Dashibodi (toleo la kwanza), Products, Product Categories, Price Categories, Customers, Profile,
kubadilisha store bila kupakia ukurasa upya, lugha mbili, export ya PDF/Excel/CSV/Print kwa injini ya PDF ya BizTrack.
Kurasa zingine za menyu zinaonyesha "unahamishiwa" — **bado zinafanya kazi kwenye BizTrack ya sasa; hakuna kilichoondolewa.**
Sales imekamilika: POS, orders zinazosubiri, historia, risiti, returns, debits. Haipo bado: Purchases, Inventory (isipokuwa Products), Reports, Users/Roles, Messaging, Settings, Subscription, AI.

## Mahitaji
Node.js 20 au zaidi · PostgreSQL 13 au zaidi · akaunti ya Cloudinary (picha) kama sasa.

## Marekebisho ya makosa ya BizTrack ya asili (Awamu 2)
Makosa yafuatayo yalikuwepo kwenye BizTrack ya sasa na yamerekebishwa hapa: kuhifadhi order ya mteja mpya haikufanya kazi; kughairi order hakukuwahi kufanya kazi (migration mpya `20261108000000` inapanua kizuizi cha database kwa thamani moja, hakuna data inayoguswa); malipo ya mkopo yaliyozidi deni yalikubaliwa; returns zilizidi kilichouzwa. Maelezo kamili: `HANDOFF.md` §8b.

## Kuweka
```bash
# backend
cd backend && cp .env.example .env      # jaza DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, CLIENT_URL, n.k. (zile zile za sasa)
npm install

# frontend
cd ../frontend && cp .env.example .env  # VITE_API_BASE_URL (mfano http://localhost:5000/api), VITE_SOCKET_URL, Cloudinary
npm install
```
`CLIENT_URL` inaweza kuwa na anwani kadhaa zilizotenganishwa kwa koma (web, app iliyosakinishwa).
Weka `certs/qz-private-key.pem` ndani ya `backend/certs/` (au `QZ_PRIVATE_KEY_PATH`) — ufunguo wako, haumo kwenye zip.

## Kupandisha database uliyonayo (BILA kupoteza data)
Muundo wa jedwali **haubadilishwi**: majina, UUID na data vinabaki. Migration ya kwanza inatambua database yako kama iliyokwishafikia script 048/050 na haigusi chochote; scripts zinazokosekana tu ndizo zinaongezwa.

```bash
cd backend
# 1. simamisha app ya zamani (au hakikisha hakuna anayeandika)
npm run db:backup                 # hiari: backup ya ziada, inajaribiwa restore
npm run db:migrate:status         # unaona kinachosubiri
npm run db:migrate                # inachukua backup ya KILA JAMBO kwanza, inajaribu kuirejesha, kisha tu inabadilisha
npm run permissions:dry-run       # inaonyesha permissions mpya zinazoongezwa (mfano 2 kwenye data ya majaribio)
npm run permissions:sync          # inaziongeza (haifuti wala kubadilisha zilizopo)
npm run db:verify                 # inalinganisha database na backup ya kabla ya upgrade (au backup mpya kabisa ikikosekana): jedwali zote lazima zifanane
```
Ikitokea tatizo: `npm run db:restore -- backups/<faili>.sql.gz --yes` inarejesha kila kitu (jedwali, data, views, functions, triggers) kwa transaction moja.

Database mpya kabisa: `npm run db:migrate` kisha `npm run permissions:sync`. (`npm run seed` ni seeder ya awali ya BizTrack — soma kabla ya kuitumia production.)
`REQUIRE_MIGRATIONS=1` inazuia server kuanza ikiwa kuna migration zinazosubiri.

## Kuendesha
```bash
cd backend && npm start                   # http://localhost:5000
cd frontend && npm run dev                # maendeleo, http://localhost:5173
cd frontend && npm run build              # inatoa frontend/dist — iweke kwenye hosting yoyote tuli
```
Hosting ya `dist/` lazima irudishe `index.html` kwa njia zote (SPA fallback) na itumie **HTTPS** ili PWA isakinishike.

## Kusakinisha kama app
- **Windows / Mac / Linux (Chrome, Edge):** bonyeza ikoni ya kusakinisha kwenye bar ya anwani, au kitufe cha "Install" kwenye banner ya BizTrack.
- **Android (Chrome):** menyu ⋮ → *Install app* / *Add to Home screen*.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
Toleo jipya likitoka, app iliyosakinishwa inaonyesha ujumbe wa kusasisha.

## Mabadiliko ya usalama ukilinganisha na BizTrack ya sasa (yakague)
1. `GET /api/profile` ilirudisha hash ya nenosiri kwa mteja — sasa haifanyi hivyo.
2. Token ya zamani ilibaki halali siku 7 baada ya kubadilisha nenosiri — sasa inakataliwa (401). Token zilizotolewa kabla ya upgrade hazina alama hii na zinaisha kama kawaida.
3. `GET` ya `/api/categories`, `/api/products` (na barcode), `/api/price-categories`, `/api/suppliers` zilikuwa wazi kwa yeyote mwenye UUID ya store — sasa zinahitaji kuingia na kuwa mwanachama wa store hiyo.
4. **Bado wazi:** `POST /api/qz/sign` (QZ Tray) — unahitaji kuamua.

## Kilichojaribiwa na kisichojaribiwa
**Kimejaribiwa** (dhidi ya nakala ya database yako ya majaribio, PostgreSQL 16, Node 22):
- Upgrade: database iliyopo (jedwali 70 zinafanana kwa checksum), mpya, na iliyo nyuma (001–047); kurudia hakubadilishi chochote.
- Maafa: kuharibu database, `db:restore`, `db:verify` — jedwali 71 / rows 829, view, function na triggers 20 vinarudi.
- Safu ya services ya frontend dhidi ya server halisi: login, kubadilisha store, CRUD ya categories/customers/products (ikiwemo kufuta nyingi, barcode, kukataliwa kwa data mbaya), profile na nenosiri, dashboard.
- Sales kamili (mauzo, stock, orders, mkopo, returns) na PDF ya risiti kwa ukubwa 3: majaribio 74 kwa jumla yanapita (`tools/run-all-tests.sh`).
- `vite build` inapita; lint ina makosa 0; moduli zote 166 za server zinapakia.

**Haijajaribiwa:** kuchapisha kwa QZ Tray (haijahamishwa), kikumbusho cha SMS, muonekano kwenye kivinjari na simu, usakinishaji wa PWA kwenye vifaa, socket kati ya watumiaji, kamera ya barcode, upakiaji wa picha kwa Cloudinary, PDF zilizotolewa (macho), watumiaji wengi kwa wakati mmoja.
Pia: `npm run lint` bado ina makosa (mengi ni sheria mpya za React 19 kwenye code ya EduTrack na code ya PDF ya BizTrack); `vite build` haitegemei lint.
