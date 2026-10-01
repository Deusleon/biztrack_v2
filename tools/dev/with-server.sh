#!/usr/bin/env bash
# Starts the backend on a FREE port, runs ONE command, stops the backend. (In the Claude sandbox a background process dies when the
# tool call that started it ends, so start + test + stop MUST happen inside ONE call.)
#   usage: DATABASE_URL=... tools/dev/with-server.sh "node tools/tests/products.mjs"
#   env:   PORT (default: a free port is picked)  JWT_SECRET  JWT_REFRESH_SECRET  CLIENT_URL
# Why a free port: a leftover server from an earlier run (possibly connected to ANOTHER database) would otherwise answer on the
# fixed port while the new one fails to start — tests then talk to the wrong server and fail in confusing ways.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [ -z "${PORT:-}" ]; then PORT="$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")"; fi
export PORT JWT_SECRET="${JWT_SECRET:-dev-secret}" JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-dev-refresh}" CLIENT_URL="${CLIENT_URL:-http://localhost:5173}"
export API_URL="http://localhost:$PORT/api"
LOG="/tmp/biztrack-server-$PORT.log"; ln -sf "$LOG" /tmp/biztrack-server.log
( cd "$ROOT/backend" && exec node src/server.js > "$LOG" 2>&1 ) &
SP=$!
stop() { kill "$SP" 2>/dev/null; wait "$SP" 2>/dev/null; ( fuser -k "$PORT"/tcp >/dev/null 2>&1; true ); }
trap stop EXIT
for _ in $(seq 1 60); do curl -s "localhost:$PORT/health" >/dev/null 2>&1 && break; kill -0 "$SP" 2>/dev/null || break; sleep 0.5; done
if ! kill -0 "$SP" 2>/dev/null || ! curl -s "localhost:$PORT/health" >/dev/null 2>&1; then echo "with-server: the backend did not start on port $PORT (see $LOG)" >&2; tail -5 "$LOG" >&2; exit 3; fi
( cd "$ROOT" && bash -c "$1" ); RC=$?
exit $RC
