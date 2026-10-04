#!/usr/bin/env bash
# Runs every service-layer test against a live backend. Needs a test database (tools/dev/load-test-db.sh) and
# `npm install` done in backend/ and frontend/.   usage: DATABASE_URL=postgres://… tools/run-all-tests.sh
set -uo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to the TEST database}"
rc=0
for t in categories-customers price-categories products profile sales purchases inventory transfers import-export reports admin settings tools messaging subscription ai authz authz-all-routes receipt-pdf; do
  echo "=== $t"; bash tools/dev/with-server.sh "node tools/tests/$t.mjs" || rc=1
done
echo "=== tools (as the developer account)"; DEVELOPER_EMAIL=deusleon7@gmail.com bash tools/dev/with-server.sh "node tools/tests/tools.mjs" || rc=1
echo "=== subscription + support (as support staff)"; DEVELOPER_EMAIL=deusleon7@gmail.com SUPPORT_ADMIN_EMAILS=deusleon7@gmail.com bash tools/dev/with-server.sh "node tools/tests/subscription.mjs" || rc=1
exit $rc
