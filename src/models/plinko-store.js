const crypto = require('node:crypto');
const mysql = require('./mysql');

let pgPool, initialization;

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

  // Fallback to PostgreSQL
  if (!databaseURL()) throw Object.assign(Error('Plinko chưa kết nối kho giao dịch.'), { status: 503 });
  const address = new URL(databaseURL());
  if (/pooler|pgbouncer/i.test(address.hostname) || address.port === '6543') {
    throw Object.assign(Error('Plinko cần kết nối trực tiếp, không dùng transaction pooler.'), { status: 503 });
  }
  if (!pgPool) {
    const { Pool } = require('pg');
    pgPool = new Pool({ connectionString: databaseURL(), max: 3, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    pgPool.on('error', () => console.error('Plinko database unavailable'));
  }
  if (!initialization) {
    initialization = pgPool.query(`CREATE TABLE IF NOT EXISTS st25_plinko_games (
      id uuid PRIMARY KEY, steam_id varchar(17) NOT NULL, seed text NOT NULL,
      status text NOT NULL CHECK(status IN ('prepared','debit_pending','credit_pending','settled','review')),
      payload jsonb NOT NULL DEFAULT '{}', created_at bigint NOT NULL);
      CREATE INDEX IF NOT EXISTS st25_plinko_history ON st25_plinko_games(steam_id,created_at DESC)`
    ).catch(e => { initialization = null; throw e; });
  }
  await initialization;
  return pgPool;
}

async function withPlayer(steamId, task) {
  if (isMySQL()) {
    const pool = await database();
    const conn = await pool.getConnection();
    let locked = false;
    try {
      const lockName = `st25_plinko_${steamId}`;
      const [res] = await conn.query('SELECT GET_LOCK(?, 5) AS locked', [lockName]);
      locked = res && res[0] && res[0].locked === 1;
      if (!locked) throw Object.assign(Error('Lượt trước đang xử lý. Vui lòng chờ.'), { status: 429 });
      return await task({ client: conn, isMySQL: true });
    } finally {
      if (locked) {
        try { await conn.query('SELECT RELEASE_LOCK(?)', [`st25_plinko_${steamId}`]); } catch (_) {}
      }
      conn.release();
    }
  }

  // PG
  const client = await (await database()).connect();
  let locked = false, broken = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtext('st25-plinko'),hashtext($1)) AS locked", [steamId])).rows[0].locked;
    if (!locked) throw Object.assign(Error('Lượt trước đang xử lý. Vui lòng chờ.'), { status: 429 });
    return await task({ client, isMySQL: false });
  } finally {
    if (locked) try { await client.query("SELECT pg_advisory_unlock(hashtext('st25-plinko'),hashtext($1))", [steamId]); } catch { broken = true; }
    client.release(broken);
  }
}

async function get(handle, id, sid) {
  const client = handle?.client || handle;
  if (handle?.isMySQL) {
    const [rows] = await client.query('SELECT * FROM st25_plinko_games WHERE id=? AND steam_id=?', [id, sid]);
    return rows[0];
  }
  return (await client.query('SELECT * FROM st25_plinko_games WHERE id=$1 AND steam_id=$2', [id, sid])).rows[0];
}

async function history(sid) {
  if (isMySQL()) {
    const [rows] = await (await database()).query("SELECT * FROM st25_plinko_games WHERE steam_id=? AND status!='prepared' ORDER BY created_at DESC LIMIT 30", [sid]);
    return rows;
  }
  return (await (await database()).query("SELECT * FROM st25_plinko_games WHERE steam_id=$1 AND status!='prepared' ORDER BY created_at DESC LIMIT 30", [sid])).rows;
}

async function unresolved(handle, sid) {
  const client = handle?.client || handle;
  if (handle?.isMySQL) {
    const [rows] = await client.query("SELECT id FROM st25_plinko_games WHERE steam_id=? AND status IN ('debit_pending','credit_pending','review') LIMIT 1", [sid]);
    return rows.length > 0;
  }
  return (await client.query("SELECT id FROM st25_plinko_games WHERE steam_id=$1 AND status IN ('debit_pending','credit_pending','review') LIMIT 1", [sid])).rows.length > 0;
}

async function prepare(handle, sid) {
  const client = handle?.client || handle;
  if (handle?.isMySQL) {
    const [existing] = await client.query("SELECT * FROM st25_plinko_games WHERE steam_id=? AND status='prepared' ORDER BY created_at DESC LIMIT 1", [sid]);
    if (existing && existing[0]) return existing[0];
    const id = crypto.randomUUID();
    const seed = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    await client.query("INSERT INTO st25_plinko_games(id,steam_id,seed,status,payload,created_at) VALUES(?,?,?,'prepared','{}',?)", [id, sid, seed, now]);
    const [row] = await client.query('SELECT * FROM st25_plinko_games WHERE id=?', [id]);
    return row[0];
  }

  // PG
  const existing = (await client.query("SELECT * FROM st25_plinko_games WHERE steam_id=$1 AND status='prepared' ORDER BY created_at DESC LIMIT 1", [sid])).rows[0];
  if (existing) return existing;
  return (await client.query("INSERT INTO st25_plinko_games(id,steam_id,seed,status,created_at) VALUES($1,$2,$3,'prepared',$4) RETURNING *", [crypto.randomUUID(), sid, crypto.randomBytes(32).toString('hex'), Date.now()])).rows[0];
}

async function update(handle, row, status, payload = row.payload) {
  const client = handle?.client || handle;
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (handle?.isMySQL) {
    await client.query('UPDATE st25_plinko_games SET status=?, payload=? WHERE id=?', [status, payloadStr, row.id]);
    const [updated] = await client.query('SELECT * FROM st25_plinko_games WHERE id=?', [row.id]);
    return updated[0];
  }
  return (await client.query('UPDATE st25_plinko_games SET status=$2,payload=$3 WHERE id=$1 RETURNING *', [row.id, status, payloadStr])).rows[0];
}

module.exports = { database, withPlayer, get, history, unresolved, prepare, update };
