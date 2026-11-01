require('../src/core/config');
const mysql = require('../src/models/mysql');

async function migrateMiniGames() {
  console.log('Connecting to MySQL host:', process.env.MYSQL_HOST, 'Database:', process.env.MYSQL_DATABASE);
  const pool = mysql.getPool();
  if (!pool) {
    throw new Error('Không thể khởi tạo pool kết nối MySQL.');
  }

  const queries = [
    // 1. Bảng lưu trữ Vòng quay Roulette
    {
      name: 'st25_roulette_games',
      sql: `CREATE TABLE IF NOT EXISTS st25_roulette_games (
        id VARCHAR(36) PRIMARY KEY,
        steam_id VARCHAR(17) NOT NULL,
        seed TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        payload JSON,
        created_at BIGINT NOT NULL,
        INDEX idx_roulette_history (steam_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },

    // 2. Bảng lưu trữ Plinko
    {
      name: 'st25_plinko_games',
      sql: `CREATE TABLE IF NOT EXISTS st25_plinko_games (
        id VARCHAR(36) PRIMARY KEY,
        steam_id VARCHAR(17) NOT NULL,
        seed TEXT NOT NULL,
        status VARCHAR(20) NOT NULL,
        payload JSON,
        created_at BIGINT NOT NULL,
        INDEX idx_plinko_history (steam_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    }
  ];

  console.log('Khởi tạo / kiểm tra 2 bảng Mini Games ST25...');
  for (const q of queries) {
    try {
      await pool.query(q.sql);
      console.log(`[PASS] Bảng ${q.name} đã sẵn sàng.`);
    } catch (err) {
      console.error(`[FAIL] Lỗi bảng ${q.name}:`, err.message);
    }
  }

  const [rows] = await pool.query('SHOW TABLES');
  console.log('\nDanh sách bảng trong database:');
  console.log(rows.map(r => Object.values(r)[0]));
  process.exit(0);
}

migrateMiniGames().catch(err => {
  console.error('Migration fatal error:', err);
  process.exit(1);
});
