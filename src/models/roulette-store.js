const crypto = require('node:crypto');
const mysql = require('./mysql');

let pgPool, initialization;
const memoryStore = new Map();
const memoryHistory = [];

function isMySQL() {
  return mysql.hasMySQLConfig();
}

const databaseURL = () => process.env.ROULETTE_DATABASE_URL || process.env.PLINKO_DATABASE_URL || process.env.PORTAL_DATABASE_URL;

async function database() {
  if (isMySQL()) {
    const pool = mysql.getPool();
    if (!initialization) {
      initialization = pool.query(`
        CREATE TABLE IF NOT EXISTS st25_roulette_games (
          id VARCHAR(36) PRIMARY KEY,
          steam_id VARCHAR(17) NOT NULL,
          seed TEXT NOT NULL,
          status VARCHAR(20) NOT NULL,
          payload JSON,
          created_at BIGINT NOT NULL,
          INDEX idx_roulette_history (steam_id, created_at)
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
    pgPool.on('error', () => console.error('Roulette database connection error'));
  }
  if (!initialization) {
    initialization = pgPool.query(`
      CREATE TABLE IF NOT EXISTS st25_roulette_games (
        id uuid PRIMARY KEY, steam_id varchar(17) NOT NULL, seed text NOT NULL,
        status text NOT NULL CHECK(status IN ('prepared','debit_pending','credit_pending','settled','review')),
        payload jsonb NOT NULL DEFAULT '{}', created_at bigint NOT NULL);
      CREATE INDEX IF NOT EXISTS st25_roulette_history ON st25_roulette_games(steam_id, created_at DESC);
    `).catch(e => { initialization = null; throw e; });
  }
  await initialization;
  return pgPool;
}

const activePlayerLocks = new Set();

async function withPlayer(steamId, task) {
  if (activePlayerLocks.has(steamId)) {
    throw Object.assign(new Error('Lượt cược trước đang xử lý. Vui lòng chờ giây lát.'), { status: 429 });
  }
  activePlayerLocks.add(steamId);

  if (isMySQL()) {
    let conn = null, locked = false;
    try {
      const pool = await database();
      conn = await pool.getConnection();
      const lockName = `st25_roulette_${steamId}`;
      const [res] = await conn.query('SELECT GET_LOCK(?, 5) AS locked', [lockName]);
      locked = res && res[0] && res[0].locked === 1;
      if (!locked) throw Object.assign(new Error('Lượt cược trước đang xử lý. Vui lòng chờ.'), { status: 429 });
      return await task({ client: conn, isMySQL: true });
    } finally {
      activePlayerLocks.delete(steamId);
      if (locked && conn) {
        try { await conn.query('SELECT RELEASE_LOCK(?)', [`st25_roulette_${steamId}`]); } catch (_) {}
      }
      if (conn) conn.release();
    }
  }

  // PG or Memory fallback
  let dbPool = null;
  try { dbPool = await database().catch(() => null); } catch (_) {}

  if (dbPool) {
    const client = await dbPool.connect();
    let locked = false, broken = false;
    try {
      locked = (await client.query("SELECT pg_try_advisory_lock(hashtext('st25-roulette'), hashtext($1)) AS locked", [steamId])).rows[0]?.locked;
      if (!locked) throw Object.assign(new Error('Lượt trước đang xử lý trên cơ sở dữ liệu. Vui lòng chờ.'), { status: 429 });
      return await task({ client, isPg: true });
    } finally {
      activePlayerLocks.delete(steamId);
      if (locked) try { await client.query("SELECT pg_advisory_unlock(hashtext('st25-roulette'), hashtext($1))", [steamId]); } catch { broken = true; }
      client.release(broken);
    }
  } else {
    try {
      return await task({ isPg: false });
    } finally {
      activePlayerLocks.delete(steamId);
    }
  }
}

async function prepare(handle, steamId) {
  const seed = crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  const now = Date.now();
  const row = { id, steam_id: steamId, seed, status: 'prepared', payload: {}, created_at: now };

  if (handle?.isMySQL) {
    const [existing] = await handle.client.query("SELECT * FROM st25_roulette_games WHERE steam_id=? AND status='prepared' ORDER BY created_at DESC LIMIT 1", [steamId]);
    if (existing && existing[0]) {
      const ex = existing[0];
      if (typeof ex.payload === 'string') ex.payload = JSON.parse(ex.payload);
      return ex;
    }
    await handle.client.query("INSERT INTO st25_roulette_games(id, steam_id, seed, status, payload, created_at) VALUES(?,?,?,'prepared','{}',?)", [id, steamId, seed, now]);
    const [inserted] = await handle.client.query('SELECT * FROM st25_roulette_games WHERE id=?', [id]);
    const r = inserted[0];
    if (typeof r.payload === 'string') r.payload = JSON.parse(r.payload);
    return r;
  }

  if (handle?.isPg) {
    const existing = (await handle.client.query("SELECT * FROM st25_roulette_games WHERE steam_id=$1 AND status='prepared' ORDER BY created_at DESC LIMIT 1", [steamId])).rows[0];
    if (existing) return existing;
    return (await handle.client.query("INSERT INTO st25_roulette_games(id, steam_id, seed, status, created_at) VALUES($1,$2,$3,'prepared',$4) RETURNING *", [id, steamId, seed, now])).rows[0];
  }

  // Memory
  for (const v of memoryStore.values()) {
    if (v.steam_id === steamId && v.status === 'prepared') return v;
  }
  memoryStore.set(id, row);
  return row;
}

async function get(handle, id, steamId) {
  if (handle?.isMySQL) {
    const [rows] = await handle.client.query('SELECT * FROM st25_roulette_games WHERE id=? AND steam_id=?', [id, steamId]);
    const row = rows[0];
    if (row && typeof row.payload === 'string') row.payload = JSON.parse(row.payload);
    return row;
  }
  if (handle?.isPg) {
    return (await handle.client.query('SELECT * FROM st25_roulette_games WHERE id=$1 AND steam_id=$2', [id, steamId])).rows[0];
  }
  const row = memoryStore.get(id);
  return (row && row.steam_id === steamId) ? row : null;
}

async function update(handle, row, status, payload = row.payload) {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;

  if (handle?.isMySQL) {
    await handle.client.query('UPDATE st25_roulette_games SET status=?, payload=? WHERE id=?', [status, payloadStr, row.id]);
    const [rows] = await handle.client.query('SELECT * FROM st25_roulette_games WHERE id=?', [row.id]);
    const updated = rows[0];
    if (updated && typeof updated.payload === 'string') updated.payload = JSON.parse(updated.payload);
    return updated;
  }

  if (handle?.isPg) {
    return (await handle.client.query('UPDATE st25_roulette_games SET status=$2, payload=$3 WHERE id=$1 RETURNING *', [row.id, status, payloadStr])).rows[0];
  }

  const updated = { ...row, status, payload: parsedPayload };
  memoryStore.set(row.id, updated);
  if (status === 'settled') {
    memoryHistory.unshift(updated);
    if (memoryHistory.length > 100) memoryHistory.pop();
  }
  return updated;
}

async function history(steamId, limit = 20) {
  if (isMySQL()) {
    const [rows] = await (await database()).query("SELECT * FROM st25_roulette_games WHERE steam_id=? AND status!='prepared' ORDER BY created_at DESC LIMIT ?", [steamId, limit]);
    return rows.map(r => {
      if (typeof r.payload === 'string') r.payload = JSON.parse(r.payload);
      return r;
    });
  }
  let dbPool = null;
  try { dbPool = await database().catch(() => null); } catch (_) {}
  if (dbPool) {
    return (await dbPool.query("SELECT * FROM st25_roulette_games WHERE steam_id=$1 AND status!='prepared' ORDER BY created_at DESC LIMIT $2", [steamId, limit])).rows;
  }
  return memoryHistory.filter(r => r.steam_id === steamId && r.status !== 'prepared').slice(0, limit);
}

async function recentRolls(limit = 100) {
  if (isMySQL()) {
    const [rows] = await (await database()).query("SELECT payload, created_at FROM st25_roulette_games WHERE status='settled' ORDER BY created_at DESC LIMIT ?", [limit]);
    return rows.map(r => {
      const p = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
      return { slot: p?.slot, color: p?.color, createdAt: Number(r.created_at) };
    }).filter(r => r.color);
  }
  let dbPool = null;
  try { dbPool = await database().catch(() => null); } catch (_) {}
  if (dbPool) {
    const rows = (await dbPool.query("SELECT payload, created_at FROM st25_roulette_games WHERE status='settled' ORDER BY created_at DESC LIMIT $1", [limit])).rows;
    return rows.map(r => ({ slot: r.payload?.slot, color: r.payload?.color, createdAt: Number(r.created_at) })).filter(r => r.color);
  }
  return memoryHistory.filter(r => r.status === 'settled').slice(0, limit).map(r => ({
    slot: r.payload?.slot, color: r.payload?.color, createdAt: Number(r.created_at)
  })).filter(r => r.color);
}

async function unresolved(handle, steamId) {
  if (handle?.isMySQL) {
    const [rows] = await handle.client.query("SELECT id FROM st25_roulette_games WHERE steam_id=? AND status IN ('debit_pending','credit_pending','review') LIMIT 1", [steamId]);
    return rows.length > 0;
  }
  if (handle?.isPg) {
    return (await handle.client.query("SELECT id FROM st25_roulette_games WHERE steam_id=$1 AND status IN ('debit_pending','credit_pending','review') LIMIT 1", [steamId])).rows.length > 0;
  }
  for (const v of memoryStore.values()) {
    if (v.steam_id === steamId && ['debit_pending', 'credit_pending', 'review'].includes(v.status)) return true;
  }
  return false;
}

module.exports = { database, withPlayer, prepare, get, update, history, recentRolls, unresolved };
