#!/usr/bin/env bash
# Runs every service-layer test against a live backend. Needs a test database (tools/dev/load-test-db.sh) and
# `npm install` done in backend/ and frontend/.   usage: DATABASE_URL=postgres://… tools/run-all-tests.sh
set -uo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to the TEST database}"
rc=0
for t in categories-customers price-categories products profile sales receipt-pdf; do
  echo "=== $t"; bash tools/dev/with-server.sh "node tools/tests/$t.mjs" || rc=1
done
exit $rc
