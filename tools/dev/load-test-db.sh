#!/usr/bin/env bash
# Builds a throw-away TEST database from the user's data-only backup (biztrack_backup_*_sql[.gz]).
#   usage: tools/dev/load-test-db.sh /path/to/biztrack_backup_2026-10-31-20-59_sql[.gz]
#   env:   PGHOST (localhost) PGPORT (5432) PGUSER (postgres) PGPASSWORD (postgres)  TEST_DB (biztrack_test)
#          TEST_EMAIL (deusleon7@gmail.com)  TEST_PASSWORD (Test1234!)
# It NEVER touches any other database. The password is set only on this test copy so the tests can sign in.
set -euo pipefail
BACKUP="${1:?give the path of the backup file}"
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"
DB="${TEST_DB:-biztrack_test}"; EMAIL="${TEST_EMAIL:-deusleon7@gmail.com}"; PASS="${TEST_PASSWORD:-Test1234!}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SQL="$BACKUP"; if [[ "$BACKUP" == *.gz ]]; then SQL="$(mktemp --suffix=.sql)"; gunzip -c "$BACKUP" > "$SQL"; fi

psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB;" -c "CREATE DATABASE $DB;"
export DATABASE_URL="postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$DB"
( cd "$ROOT/backend" && SKIP_BACKUP=1 npm run -s db:migrate )                       # structure only (48 SQL scripts + baseline)
# the scripts seed a few rows (permissions, plans, integrations) that clash with the backup's own copies: empty everything first
psql -q -d "$DB" -c "DO \$\$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('SequelizeMeta') LOOP EXECUTE 'TRUNCATE TABLE public.'||quote_ident(r.tablename)||' CASCADE'; END LOOP; END \$\$;" 2>/dev/null
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$SQL" >/dev/null
# permissions that exist in the code but not in the backup (Owner roles receive them automatically)
( cd "$ROOT/backend" && npm run -s permissions:sync >/dev/null )
HASH="$(cd "$ROOT/backend" && node -e "import('bcryptjs').then(b=>console.log(b.default.hashSync(process.argv[1],10)))" "$PASS")"
psql -q -d "$DB" -c "UPDATE users SET password='$HASH', is_verified=true, status=true, failed_login_attempts=0, account_locked_until=NULL, password_changed_at=now() WHERE email='$EMAIL';"
# the test data's subscription ends 2026-12-02: push it a year out so the API does not answer 402 during tests
psql -q -d "$DB" -c "UPDATE store_subscriptions SET ends_at = now() + interval '1 year', grace_ends_at = now() + interval '1 year 3 days' WHERE status='active' AND ends_at IS NOT NULL;"
echo "Test database '$DB' ready. DATABASE_URL=$DATABASE_URL"
echo "Sign in with $EMAIL / $PASS  (store: Magomeni Store — Owner, 176 permissions)"
