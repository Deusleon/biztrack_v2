# BizTrack — Automatic Daily Backup kwenye Google Drive

Backup **kamili ya database** (schema + data zote, restorable) inayotumwa kwenye **Google Drive yako mwenyewe** kila siku kwa saa za Tanzania, pamoja na kifungo cha "Run Backup Now", historia, test ya muunganisho, na usafishaji wa backups za zamani (retention).

---

## Hatua 1 — Weka files mpya (Backend)

Copy files hizi kutoka `backend_backup_update.zip` kwenda kwenye project yako (folder structure imehifadhiwa):

**Files MPYA:**

| File | Kazi |
|---|---|
| `utils/googleDrive.js` | Client ya Google Drive (haihitaji npm package yoyote mpya) |
| `services/backup.service.js` | Dump ya database + upload + retention + notifications |
| `services/backupScheduler.js` | Ratiba ya kila siku (saa za Tanzania) |
| `controllers/backup.controller.js` | API: history, status, test, run-now |
| `routes/backup.routes.js` | Routes `/api/backups` |
| `DB/migrations/scripts/041_cloud_backups.sql` | Table ya historia ya backups |
| `scripts/getGoogleRefreshToken.js` | Script ya mara moja ya kupata Refresh Token |

**Files ZILIZOBADILISHWA** (zi-replace za kwako):

| File | Kilichobadilika |
|---|---|
| `app.js` | Ku-register `/api/backups` + kuwasha backup scheduler |
| `controllers/integration.controller.js` | Provider mpya `google_drive`; `client_secret` na `refresh_token` zime-mask |
| `locales/en.json`, `locales/sw.json` | Keys mpya za messages |

Kisha run migration:

```bash
npm run migrate
```

## Hatua 2 — Weka files za Frontend

Copy kutoka `frontend_backup_update.zip`:

| File | Kilichobadilika |
|---|---|
| `src/pages/settings/IntegrationsPage.jsx` | Card ya webhook imebadilishwa kuwa card kamili ya Google Drive (credentials, test, run now, historia) |
| `src/services/IntegrationsService.js` | API calls mpya za backup |
| `src/lang/en.json`, `src/lang/sw.json` | Tafsiri mpya |

## Hatua 3 — Tengeneza OAuth Client kwenye Google Cloud Console

1. Nenda **https://console.cloud.google.com** → tengeneza project mpya (mf. "BizTrack Backups")
2. **APIs & Services → Library** → tafuta **Google Drive API** → bonyeza **Enable**
3. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - Jaza App name (BizTrack), support email, developer email → Save
   - Kwenye **Test users** → **Add users** → weka **email yako ya Google** (ile yenye Drive utakayotumia)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**
   - Utapata **Client ID** na **Client Secret** — zihifadhi

## Hatua 4 — Pata Refresh Token (mara moja tu)

Kwenye **kompyuta yako** (siyo server, kwa sababu inafungua browser):

```bash
node scripts/getGoogleRefreshToken.js
```

- Weka Client ID na Client Secret unapoulizwa
- Fungua link itakayotokea kwenye browser, login na account yako ya Google, bonyeza **Allow**
- Script itakuprintia **Refresh Token**

> Script inatumia scope ya `drive.file` — BizTrack inaweza kuona na kufuta **files ilizotengeneza yenyewe tu**, haiwezi kugusa files zako zingine za Drive.

## Hatua 5 — Configure kwenye BizTrack

1. Login kama **Owner** au **Manager**
2. Nenda **Settings → Integrations → Google Drive Backup**
3. Weka **Client ID**, **Client Secret**, na **Refresh Token** → **Save**
4. Bonyeza **Test Connection** — inapaswa kuonyesha email yako ya Google
5. Bonyeza **Run Backup Now** — ndani ya dakika chache utaona file `biztrack_backup_....sql.gz` kwenye folder **"BizTrack Backups"** kwenye Drive yako, na row kwenye historia

> Folder ID ni optional — ukiiacha wazi, folder ya "BizTrack Backups" inatengenezwa yenyewe kwenye My Drive.

## Hatua 6 — Environment variables (optional, zina defaults)

```env
# Muda wa backup ya kila siku, saa za Tanzania (HH:MM). Default: 02:00
BACKUP_TIME=02:00

# Backups za zamani zaidi ya siku hizi zinafutwa Drive. Default: 30
BACKUP_RETENTION_DAYS=30

# Kuzima scheduler kabisa (mf. kwenye staging)
# BACKUP_SCHEDULER_ENABLED=false

# Tayari ipo kwa notification scheduler — inatumika na backup pia
# BUSINESS_TIMEZONE=Africa/Dar_es_Salaam
```

Restart server yako baada ya kuweka. **Hakuna npm package mpya inayohitajika** (inatumia native fetch ya Node 18+; wewe uko Node 22).

---

## Jinsi inavyofanya kazi

- **Dump**: inajaribu `pg_dump` kwanza (backup kamili: schema + data, inarestorewa moja kwa moja na `psql`). Kama host yako haina `pg_dump`, inatumia **JS fallback** inayodump tables zote za `public` schema kama INSERTs (na wrapper ya `session_replication_role` ili FK order isiwe tatizo kwenye restore). Method iliyotumika inaonekana kwenye historia.
- **Compression**: kila backup ina-gzip kabla ya kupanda (`.sql.gz`).
- **Ratiba**: pattern ile ile ya notification scheduler — check kila saa, one-shot timer inagonga `BACKUP_TIME` kamili (saa na dakika), saa za Tanzania popote server ilipo. Backup moja tu ya mafanikio kwa siku; ikifeli, inajaribiwa tena kila saa siku hiyo hiyo; server ikiwa ilizimwa muda wa backup, inafanya catch-up ikiwashwa.
- **Retention**: kila backup ikikamilika, backups za Drive zenye zaidi ya `BACKUP_RETENTION_DAYS` zinafutwa na kuwekwa alama `deleted` kwenye historia.
- **Notifications**: inatumia type ya `cloud_backup` iliyopo kwenye notification settings — stores zenye `inapp_cloud_backup` / `email_cloud_backup` washa zinapata taarifa backup ikikamilika au ikifeli.
- **Usalama**: `client_secret` na `refresh_token` zina-mask kwenye API responses (kama SMS credentials); endpoints zote ni za **Owner/Manager** tu.

## Ku-restore backup

```bash
# Pakua file kutoka Drive, kisha:
gunzip biztrack_backup_2026-07-23-02-00.sql.gz

# Kama ilikuwa pg_dump (kawaida) — restore kwenye database tupu:
psql "postgres://user:pass@host:5432/biztrack_new" -f biztrack_backup_2026-07-23-02-00.sql

# Kama ilikuwa js_fallback — run migrations kwanza kwenye DB tupu, kisha:
psql "postgres://user:pass@host:5432/biztrack_new" -f biztrack_backup_....sql
```

## Matatizo ya kawaida (Troubleshooting)

- **"Google token refresh failed ... invalid_grant"** — Refresh token imeisha au ime-revoke-iwa. Kwenye OAuth consent screen ya "Testing" mode, refresh tokens zinaisha baada ya siku 7. Suluhisho: **Publish** app (OAuth consent screen → Publish app; haihitaji verification kwa scope ya drive.file) au run script ya token tena.
- **Hakuna refresh_token kwenye output ya script** — Futa ruhusa ya app kwenye https://myaccount.google.com/permissions kisha run script tena.
- **Backup inaonekana "failed" na error ya pg_dump** — angalia kwamba `pg_dump` version inalingana na Postgres server yako, au acha JS fallback ifanye kazi (inajiwasha yenyewe).
- **Test Connection inafeli** — hakikisha server yako inaweza kufikia `googleapis.com` (firewall/egress rules).
