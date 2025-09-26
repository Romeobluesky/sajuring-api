const { pool } = require('../config/database');

async function checkRingsConsistency() {
  try {
    console.log('🔍 링 잔액 일관성 검사 시작...');

    // 현재 불일치 데이터 조회
    const [inconsistentUsers] = await pool.execute(`
      SELECT
        u.id,
        u.login_id,
        u.username,
        u.rings as current_rings,
        COALESCE(
          (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
        ) - COALESCE(
          (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
        ) as calculated_rings,
        (u.rings - (
          COALESCE(
            (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
          ) - COALESCE(
            (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
          )
        )) as difference
      FROM users u
      WHERE u.id > 0
      AND ABS(u.rings - (
        COALESCE(
          (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
        ) - COALESCE(
          (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
        )
      )) > 0.01
      ORDER BY ABS(difference) DESC
      LIMIT 10
    `);

    console.log(`📊 불일치 사용자 수: ${inconsistentUsers.length}명`);

    if (inconsistentUsers.length > 0) {
      console.log('\n🚨 불일치 데이터 상위 10명:');
      inconsistentUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.username} (${user.login_id})`);
        console.log(`   현재 잔액: ${user.current_rings}링`);
        console.log(`   계산값: ${user.calculated_rings}링`);
        console.log(`   차이: ${user.difference}링\n`);
      });
    } else {
      console.log('✅ 모든 사용자의 링 잔액이 일치합니다!');
    }

    // 전체 통계
    const [stats] = await pool.execute(`
      SELECT
        COUNT(*) as total_users,
        SUM(rings) as total_rings,
        AVG(rings) as avg_rings,
        MIN(rings) as min_rings,
        MAX(rings) as max_rings
      FROM users
      WHERE id > 0
    `);

    console.log('📈 전체 링 잔액 통계:');
    console.log(`   총 사용자 수: ${stats[0].total_users}명`);
    console.log(`   총 링 잔액: ${stats[0].total_rings}링`);
    console.log(`   평균 잔액: ${Math.round(stats[0].avg_rings)}링`);
    console.log(`   최소 잔액: ${stats[0].min_rings}링`);
    console.log(`   최대 잔액: ${stats[0].max_rings}링`);

    return inconsistentUsers.length;

  } catch (error) {
    console.error('❌ 검사 중 오류 발생:', error);
    throw error;
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  checkRingsConsistency()
    .then((inconsistentCount) => {
      if (inconsistentCount > 0) {
        console.log(`\n⚠️  ${inconsistentCount}명의 사용자에게 링 잔액 불일치가 발견되었습니다.`);
        process.exit(1);
      } else {
        console.log('\n✅ 링 잔액 일관성 검사 완료!');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { checkRingsConsistency };