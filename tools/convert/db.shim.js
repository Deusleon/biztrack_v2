// FILE PATH: backend/src/config/db.js
/**
 * `pool` — the query interface BizTrack's controllers have always used (pool.query / pool.connect →
 * client.query / client.release), now running on the SAME Sequelize connection pool as the models,
 * the migration runner and the backup tools. One pool, one configuration (config/database.js).
 *
 * Nothing about the queries themselves changes: every SQL statement, transaction (BEGIN/COMMIT) and
 * result shape ({ rows, rowCount }) behaves exactly as it did with node-postgres, because the objects
 * handed out are the real pg connections Sequelize manages.
 */
import sequelize from './database.js';
import { recordQuery, LOG_ALL } from '../utils/perf.js';

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS, 10) || 300;
const text = (args) => (typeof args[0] === 'string' ? args[0] : args[0]?.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);

const timed = async (run, args) => {
  const start = Date.now();
  try {
    return await run();
  } catch (err) {
    console.error(`[QUERY ERROR] ${Date.now() - start}ms :: ${text(args)} :: ${err.message}`);
    throw err;
  } finally {
    const ms = Date.now() - start;
    recordQuery(ms);
    if (ms > SLOW_QUERY_MS) console.warn(`[SLOW QUERY] ${ms}ms :: ${text(args)}`);
  }
};

const checkout = async () => {
  const conn = await sequelize.connectionManager.getConnection({ type: 'write' });
  let released = false;
  return {
    query: (...args) => (LOG_ALL ? timed(() => conn.query(...args), args) : conn.query(...args)),
    release: () => {
      if (released) return;
      released = true;
      sequelize.connectionManager.releaseConnection(conn);
    },
  };
};

const pool = {
  /** Same as pg's pool.query(text, values) → { rows, rowCount, ... } */
  async query(...args) {
    const client = await checkout();
    try {
      return await timed(() => client.query(...args), args);
    } finally {
      client.release();
    }
  },
  /** Same as pg's pool.connect() → client with query() and release(). */
  async connect(callback) {
    if (typeof callback === 'function') {
      checkout().then((c) => callback(null, c, c.release), callback);
      return undefined;
    }
    return checkout();
  },
  on() { /* pool errors are reported by Sequelize */ },
  async end() { await sequelize.close(); },
};

export default pool;
