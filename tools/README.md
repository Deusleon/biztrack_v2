# tools/

| Path | What it is |
|---|---|
| `convert/cjs2esm.py` | Converts the ORIGINAL CommonJS backend to ESM mechanically (no logic edits). `python3 cjs2esm.py <original_backend_dir> <out_dir>` then `python3 postpatch.py <out_dir>` (applies the 8 hand fixes: lazy requires, the `config/db.js` shim `db.shim.js`). Only needed if the user ships a NEWER original backend that must be re-converted; the converted code is already in `backend/src/`. |
| `dev/load-test-db.sh` | Builds a throw-away test database from the user's backup (migrate → empty seeds → load → set test password → extend subscription). |
| `dev/with-server.sh` | Starts the backend on a free port (never a fixed one), runs ONE command, stops the backend (needed in the Claude sandbox: background processes die when the tool call ends). |
| `tests/harness.mjs` | Runs the real `frontend/src/services/api.js` in Node against a live backend. Env: `API_URL`, `TEST_EMAIL`, `TEST_PASSWORD`, `TEST_STORE`. |
| `tests/*.mjs` | One suite per module (categories-customers, price-categories, products, profile, sales, purchases, inventory, transfers, import-export, reports) plus `receipt-pdf.mjs` (PDF engine smoke test, no server). Copy one for every new module. |
| `dev/check-keys.py` | Lists translation keys used in `frontend/src` but missing from `lang/en.json`/`sw.json`; `add 'key=English|Kiswahili' …` adds them to both. |
| `run-all-tests.sh` | `DATABASE_URL=<test db> bash tools/run-all-tests.sh` |

Typical session:
```bash
export PGPASSWORD=postgres
bash tools/dev/load-test-db.sh /mnt/user-data/uploads/biztrack_backup_2026-10-31-20-59_sql.gz     # once
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/biztrack_test
bash tools/run-all-tests.sh
```
Never point these scripts at the user's real database: they change passwords and create/delete test rows.
