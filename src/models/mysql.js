const mysql = require('mysql2/promise');

let pool = null;

function hasMySQLConfig() {
  return !!(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

function getPool() {
  if (!hasMySQLConfig()) return null;
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 8000
    });
    pool.on('error', err => console.error('MySQL pool error:', err.message));
  }
  return pool;
}

async function query(sql, params = []) {
  const p = getPool();
  if (!p) throw new Error('MySQL pool chưa được kết nối.');
  return await p.query(sql, params);
}

module.exports = {
  hasMySQLConfig,
  getPool,
  query
};
