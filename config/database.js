const mysql = require('mysql2/promise');
require('dotenv').config();

// MySQL Connection Pool 설정
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+09:00', // 한국 시간
  charset: 'utf8mb4',
  ssl: false
});

// 데이터베이스 연결 테스트 함수
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ MySQL 데이터베이스 연결 성공');
    console.log(`📊 연결 정보: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ MySQL 데이터베이스 연결 실패:', error.message);
    return false;
  }
};

// 스크립트로 직접 실행시 연결 테스트
if (require.main === module) {
  testConnection().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { pool, testConnection };