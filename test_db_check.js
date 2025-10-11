const { pool } = require('./config/database');

async function checkUsersIdType() {
  try {
    // 1. consultant_applications 테이블 구조 확인
    console.log('=== consultant_applications 테이블 구조 ===');
    const [columns] = await pool.execute(
      `DESCRIBE consultant_applications`
    );
    console.log(columns.filter(col => col.Field === 'users_id'));

    // 2. 실제 데이터 샘플 확인
    console.log('\n=== consultant_applications.users_id 실제 데이터 ===');
    const [applications] = await pool.execute(
      `SELECT id, users_id, applicant_name FROM consultant_applications LIMIT 5`
    );
    console.log(applications);

    // 3. users 테이블 구조 확인
    console.log('\n=== users 테이블 구조 (id, login_id) ===');
    const [userColumns] = await pool.execute(
      `DESCRIBE users`
    );
    console.log(userColumns.filter(col => col.Field === 'id' || col.Field === 'login_id'));

    // 4. users 테이블 샘플 데이터
    console.log('\n=== users 테이블 샘플 데이터 ===');
    const [users] = await pool.execute(
      `SELECT id, login_id, nickname FROM users LIMIT 5`
    );
    console.log(users);

    // 5. JOIN 테스트 (숫자로 JOIN)
    console.log('\n=== JOIN 테스트 (users_id = users.id) ===');
    const [joinById] = await pool.execute(
      `SELECT a.id, a.users_id, u.id as user_id, u.login_id, u.nickname
       FROM consultant_applications a
       LEFT JOIN users u ON a.users_id = u.id
       LIMIT 3`
    );
    console.log(joinById);

    // 6. JOIN 테스트 (문자열로 JOIN)
    console.log('\n=== JOIN 테스트 (users_id = users.login_id) ===');
    const [joinByLoginId] = await pool.execute(
      `SELECT a.id, a.users_id, u.id as user_id, u.login_id, u.nickname
       FROM consultant_applications a
       LEFT JOIN users u ON a.users_id = u.login_id
       LIMIT 3`
    );
    console.log(joinByLoginId);

    await pool.end();
  } catch (error) {
    console.error('에러:', error);
    process.exit(1);
  }
}

checkUsersIdType();
