const crypto = require('node:crypto');
const mysql = require('./mysql');

let pgPool, initialization;
const activePlayerLocks = new Set();
const memoryStore = new Map();
const memoryHistory = [];

function isMySQL() {
  return mysql.hasMySQLConfig();
}

const databaseURL = () => process.env.PLINKO_DATABASE_URL || process.env.PORTAL_DATABASE_URL;

async function database() {
  if (isMySQL()) {
    const pool = mysql.getPool();
    if (!initialization) {
      initialization = pool.query(`
        CREATE TABLE IF NOT EXISTS st25_plinko_games (
          id VARCHAR(36) PRIMARY KEY,
          steam_id VARCHAR(17) NOT NULL,
          seed TEXT NOT NULL,
          status VARCHAR(20) NOT NULL,
          payload JSON,
          created_at BIGINT NOT NULL,
          INDEX idx_plinko_history (steam_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `).catch(e => {
        initialization = null;
        throw e;
      });
    }
    await initialization;
    return pool;
  }

  // PG
  const url = databaseURL();
  if (!url) return null;
  const address = new URL(url);
  if (/pooler|pgbouncer/i.test(address.hostname) || address.port === '6543') return null;

  if (!pgPool) {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    pgPool.on('error', () => console.error('Plinko database connection error'));
  }
  if (!initialization) {
    initialization = pgPool.query(`
      CREATE TABLE IF NOT EXISTS st25_plinko_games (
        id uuid PRIMARY KEY, steam_id varchar(17) NOT NULL, seed text NOT NULL,
        status text NOT NULL CHECK(status IN ('prepared','debit_pending','credit_pending','settled','review')),
        payload jsonb NOT NULL DEFAULT '{}', created_at bigint NOT NULL);
      CREATE INDEX IF NOT EXISTS st25_plinko_history ON st25_plinko_games(steam_id, created_at DESC);
    `).catch(e => { initialization = null; throw e; });
  }
  await initialization;
  return pgPool;
}

async function withPlayer(steamId, task) {
  if (activePlayerLocks.has(steamId)) {
    throw Object.assign(new Error('Lượt trước đang xử lý. Vui lòng chờ.'), { status: 429 });
  }
  activePlayerLocks.add(steamId);

  if (isMySQL()) {
    let conn = null, locked = false;
    try {
      const pool = await database();
      if (pool) {
        conn = await pool.getConnection();
        const lockName = `st25_plinko_${steamId}`;
        const [res] = await conn.query('SELECT GET_LOCK(?, 5) AS locked', [lockName]);
        locked = res && res[0] && res[0].locked === 1;
        if (!locked) throw Object.assign(new Error('Lượt trước đang xử lý. Vui lòng chờ.'), { status: 429 });
        return await task({ client: conn, isMySQL: true });
      }
    } catch (err) {
      if (err.status === 429) throw err;
    } finally {
      activePlayerLocks.delete(steamId);
      if (locked && conn) {
        try { await conn.query('SELECT RELEASE_LOCK(?)', [`st25_plinko_${steamId}`]); } catch (_) {}
      }
      if (conn) conn.release();
    }
  }

  // PG or Memory fallback
  let dbPool = null;
  try { dbPool = await database().catch(() => null); } catch (_) {}

  if (dbPool) {
    let client = null, locked = false, broken = false;
    try {
      client = await dbPool.connect();
      locked = (await client.query("SELECT pg_try_advisory_lock(hashtext('st25-plinko'), hashtext($1)) AS locked", [steamId])).rows[0]?.locked;
      if (!locked) throw Object.assign(new Error('Lượt trước đang xử lý trên cơ sở dữ liệu. Vui lòng chờ.'), { status: 429 });
      return await task({ client, isPg: true, isMySQL: false });
    } catch (err) {
      if (err.status === 429) throw err;
    } finally {
      activePlayerLocks.delete(steamId);
      if (locked && client) try { await client.query("SELECT pg_advisory_unlock(hashtext('st25-plinko'), hashtext($1))", [steamId]); } catch { broken = true; }
      if (client) client.release(broken);
    }
  }

  // Pure memory fallback (no DB overhead, fast, lightweight, just like vongquay)
  try {
    return await task({ isPg: false, isMySQL: false });
  } finally {
    activePlayerLocks.delete(steamId);
  }
}

async function prepare(handle, sid) {
  const seed = crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  const now = Date.now();
  const row = { id, steam_id: sid, seed, status: 'prepared', payload: {}, created_at: now };

  if (handle?.isMySQL) {
    const [existing] = await handle.client.query("SELECT * FROM st25_plinko_games WHERE steam_id=? AND status='prepared' ORDER BY created_at DESC LIMIT 1", [sid]);
    if (existing && existing[0]) {
      const ex = existing[0];
      if (typeof ex.payload === 'string') ex.payload = JSON.parse(ex.payload);
      return ex;
    }
    await handle.client.query("INSERT INTO st25_plinko_games(id,steam_id,seed,status,payload,created_at) VALUES(?,?,?,'prepared','{}',?)", [id, sid, seed, now]);
    const [inserted] = await handle.client.query('SELECT * FROM st25_plinko_games WHERE id=?', [id]);
    const r = inserted[0];
    if (typeof r.payload === 'string') r.payload = JSON.parse(r.payload);
    return r;
  }

  if (handle?.isPg) {
    const existing = (await handle.client.query("SELECT * FROM st25_plinko_games WHERE steam_id=$1 AND status='prepared' ORDER BY created_at DESC LIMIT 1", [sid])).rows[0];
    if (existing) return existing;
    return (await handle.client.query("INSERT INTO st25_plinko_games(id,steam_id,seed,status,created_at) VALUES($1,$2,$3,'prepared',$4) RETURNING *", [id, sid, seed, now])).rows[0];
  }

  // Memory store fallback
  for (const v of memoryStore.values()) {
    if (v.steam_id === sid && v.status === 'prepared') return v;
  }
  memoryStore.set(id, row);
  if (memoryStore.size > 200) {
    const oldestKey = memoryStore.keys().next().value;
    memoryStore.delete(oldestKey);
  }
  return row;
}

async function get(handle, id, sid) {
  if (handle?.isMySQL) {
    const [rows] = await handle.client.query('SELECT * FROM st25_plinko_games WHERE id=? AND steam_id=?', [id, sid]);
    const r = rows[0];
    if (r && typeof r.payload === 'string') r.payload = JSON.parse(r.payload);
    return r;
  }
  if (handle?.isPg) {
    return (await handle.client.query('SELECT * FROM st25_plinko_games WHERE id=$1 AND steam_id=$2', [id, sid])).rows[0];
  }
  const row = memoryStore.get(id);
  return (row && row.steam_id === sid) ? row : null;
}

async function update(handle, row, status, payload = row.payload) {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;

  if (handle?.isMySQL) {
    await handle.client.query('UPDATE st25_plinko_games SET status=?, payload=? WHERE id=?', [status, payloadStr, row.id]);
    const [updated] = await handle.client.query('SELECT * FROM st25_plinko_games WHERE id=?', [row.id]);
    const r = updated[0];
    if (r && typeof r.payload === 'string') r.payload = JSON.parse(r.payload);
    return r;
  }
  if (handle?.isPg) {
    return (await handle.client.query('UPDATE st25_plinko_games SET status=$2,payload=$3 WHERE id=$1 RETURNING *', [row.id, status, payloadStr])).rows[0];
  }

  const updated = { ...row, status, payload: parsedPayload };
  memoryStore.set(row.id, updated);
  if (status === 'settled') {
    memoryHistory.unshift(updated);
    if (memoryHistory.length > 50) memoryHistory.pop();
  }
  return updated;
}

async function history(sid, limit = 30) {
  if (isMySQL()) {
    try {
      const pool = await database();
      if (pool) {
        const [rows] = await pool.query("SELECT * FROM st25_plinko_games WHERE steam_id=? AND status!='prepared' ORDER BY created_at DESC LIMIT ?", [sid, limit]);
        return rows.map(r => {
          if (typeof r.payload === 'string') r.payload = JSON.parse(r.payload);
          return r;
        });
      }
    } catch (_) {}
  }
  let dbPool = null;
  try { dbPool = await database().catch(() => null); } catch (_) {}
  if (dbPool) {
    try {
      return (await dbPool.query("SELECT * FROM st25_plinko_games WHERE steam_id=$1 AND status!='prepared' ORDER BY created_at DESC LIMIT $2", [sid, limit])).rows;
    } catch (_) {}
  }
  return memoryHistory.filter(r => r.steam_id === sid && r.status !== 'prepared').slice(0, limit);
}

async function unresolved(handle, sid) {
  if (handle?.isMySQL) {
    const [rows] = await handle.client.query("SELECT id FROM st25_plinko_games WHERE steam_id=? AND status IN ('debit_pending','credit_pending','review') LIMIT 1", [sid]);
    return rows.length > 0;
  }
  if (handle?.isPg) {
    return (await handle.client.query("SELECT id FROM st25_plinko_games WHERE steam_id=$1 AND status IN ('debit_pending','credit_pending','review') LIMIT 1", [sid])).rows.length > 0;
  }
  for (const v of memoryStore.values()) {
    if (v.steam_id === sid && ['debit_pending', 'credit_pending', 'review'].includes(v.status)) return true;
  }
  return false;
}

module.exports = { database, withPlayer, get, history, unresolved, prepare, update };
