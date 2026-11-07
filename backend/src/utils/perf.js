// Lightweight request timing, so slowness can be measured instead of guessed.
//
//   PERF_LOG=1               log EVERY request (and time queries run in transactions)
//   PERF_SLOW_REQUEST_MS=800 always log requests slower than this (default 1000)
//
// Each line looks like:
//   [PERF] GET /api/dashboard/stats 200 total=143ms db=16q/61ms auth=4ms
//     total = whole request, db = number of queries / summed time of those queries,
//     auth  = time spent in verifyToken (user + subscription checks).
// When queries run in parallel their times overlap, so db can exceed total.
// If total is much larger than the queries explain, the time is spent in Node
// itself (JSON, loops, CPU) or waiting for a free connection.
import * as _p35 from 'async_hooks';
const {  AsyncLocalStorage  } = _p35.default ?? _p35;
const als = new AsyncLocalStorage();

const LOG_ALL = process.env.PERF_LOG === '1' || process.env.PERF_LOG === 'true';
const SLOW_MS = Number(process.env.PERF_SLOW_REQUEST_MS) || 1000;

function recordQuery(ms) {
  const store = als.getStore();
  if (!store) return;
  store.queries += 1;
  store.dbMs += ms;
}

function addPhase(name, ms) {
  const store = als.getStore();
  if (!store) return;
  store.phases[name] = (store.phases[name] || 0) + ms;
}

function perfMiddleware(req, res, next) {
  const store = { queries: 0, dbMs: 0, phases: {} };
  const start = process.hrtime.bigint();
  let logged = false;

  const log = () => {
    if (logged) return;
    logged = true;
    const total = Number(process.hrtime.bigint() - start) / 1e6;
    if (!LOG_ALL && total < SLOW_MS) return;
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const phases = Object.entries(store.phases)
      .map(([name, ms]) => ` ${name}=${Math.round(ms)}ms`)
      .join('');
    console.log(
      `[PERF] ${req.method} ${path} ${res.statusCode} total=${Math.round(total)}ms db=${store.queries}q/${Math.round(store.dbMs)}ms${phases}`
    );
  };

  res.on('finish', log);
  res.on('close', log);
  als.run(store, next);
}

export { perfMiddleware, recordQuery, addPhase, LOG_ALL };

