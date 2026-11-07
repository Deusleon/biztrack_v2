# Performance changes (middleware + dashboard + timing logs)

## Nini kimebadilika

| Eneo | Kabla | Baada |
|---|---|---|
| `verifyToken` → subscription | UPDATE + SELECT kwa **kila request** | cache ya sekunde 30; hakuna query kwa request nyingi. Expiry/grace bado inakaguliwa kila request kwa saa ya sasa |
| `checkStoreRole` | queries 2 kwa kila route | 1 query kwa (user, store) kila sekunde 30, kisha cache |
| `checkPermission` | 1 query kwa kila route | permission set ya user inaletwa mara 1 na kuhifadhiwa; kila route inaangalia kwenye memory |
| Dashboard | queries 15 moja baada ya nyingine, `::date` / `DATE()` zinazuia index | zinaendeshwa sambamba (max 4), tarehe zimeandikwa kama range ili index itumike. Matokeo ni yaleyale |
| Logging | hakuna | `[PERF]` kwa kila request polepole (au zote ukiwasha `PERF_LOG=1`) |

## Cache inafutwa lini

- Baada ya request yoyote ya POST/PUT/PATCH/DELETE kwenye `/api/roles`, `/api/permissions`, `/api/store-users`, `/api/stores` (role/permission cache).
- Baada ya `createCheckout`, `processWebhook`, `reconcileTransaction` (subscription cache).
- Kwa muda: sekunde 30 (`ACCESS_CACHE_TTL_MS`, `SUBSCRIPTION_CACHE_TTL_MS`).
- Ukibadilisha database moja kwa moja (SQL) au app inaendeshwa kama process zaidi ya moja, mabadiliko yanaonekana ndani ya sekunde 30 zaidi.
- Matokeo hasi (user hayuko kwenye store, hana permission yoyote) HAYAHIFADHIWI, kwa hiyo kumuongeza user au kumpa permission kunaanza kufanya kazi mara moja.

## Kusoma logs

```
[PERF] GET /api/dashboard/stats 200 total=223ms db=16q/612ms auth=2ms
```
- `total` = muda wote wa request
- `db=16q/612ms` = idadi ya queries / jumla ya muda wake (zikiwa sambamba zinaweza kuzidi `total`)
- `auth` = muda uliotumika kwenye `verifyToken`
- Ukiona `total` kubwa lakini `db` ndogo, muda unaenda kwenye Node yenyewe (CPU, JSON) au kusubiri connection.

Washa kila request: weka `PERF_LOG=1` kwenye env ya Node app (cPanel), restart. Zima: ondoa.

## Kuzima optimisation (rollback ya haraka bila kubadilisha code)

Weka kwenye env: `ACCESS_CACHE_TTL_MS=0` na `SUBSCRIPTION_CACHE_TTL_MS=0`, kisha restart. Cache zinazimwa kabisa.

## Angalia production database

Dashboard inategemea index `idx_payments_store_date` (migration 022). Kwenye psql / phpPgAdmin:

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'payments';
```
Kama `idx_payments_store_date` haipo, endesha `npm run migrate` (au SQL ya `022_performance_indexes.sql`).
