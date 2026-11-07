#!/usr/bin/env bash
# Starts the backend, runs a command, stops the backend. (In the Claude sandbox a background process dies when the tool
# call that started it ends, so start + test + stop MUST happen inside ONE call.)
#   usage: DATABASE_URL=... tools/dev/with-server.sh "node tools/tests/products.mjs"
#   env:   PORT (5055)  JWT_SECRET (dev-secret)  JWT_REFRESH_SECRET (dev-refresh)  CLIENT_URL
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PORT="${PORT:-5055}" JWT_SECRET="${JWT_SECRET:-dev-secret}" JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-dev-refresh}" CLIENT_URL="${CLIENT_URL:-http://localhost:5173}"
export API_URL="${API_URL:-http://localhost:$PORT/api}"
( fuser -k "$PORT"/tcp >/dev/null 2>&1; true )          # NEVER use `pkill -f node …` here: it matches your own shell
( cd "$ROOT/backend" && node src/server.js > /tmp/biztrack-server.log 2>&1 ) &
SP=$!
for _ in $(seq 1 40); do curl -s "localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
( cd "$ROOT" && bash -c "$1" ); RC=$?
kill $SP 2>/dev/null; wait $SP 2>/dev/null
exit $RC
