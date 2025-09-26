const { pool } = require('../config/database');

async function fixRingsBalance() {
  const connection = await pool.getConnection();

  try {
    console.log('🔧 링 잔액 데이터 수정 시작...');
    console.log('⚠️  트랜잭션 시작: 모든 작업이 성공해야 커밋됩니다.');

    await connection.beginTransaction();

    // 수정 전 현재 상태 로그
    const [beforeStats] = await connection.execute(`
      SELECT COUNT(*) as affected_users FROM users u
      WHERE u.id > 0
      AND ABS(u.rings - (
        COALESCE(
          (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
        ) - COALESCE(
          (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
        )
      )) > 0.01
    `);

    console.log(`📊 수정 대상 사용자: ${beforeStats[0].affected_users}명`);

    if (beforeStats[0].affected_users === 0) {
      console.log('✅ 수정할 데이터가 없습니다!');
      await connection.rollback();
      return;
    }

    // 실제 링 잔액 재계산 및 업데이트
    const [updateResult] = await connection.execute(`
      UPDATE users u
      SET
        rings = (
          -- 충전된 링 총합 (결제 완료)
          COALESCE(
            (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
          )
          -
          -- 상담으로 사용된 링 총합 (상담 완료)
          COALESCE(
            (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
          )
        ),
        updated_at = NOW()
      WHERE u.id > 0
      AND ABS(u.rings - (
        COALESCE(
          (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
        ) - COALESCE(
          (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
        )
      )) > 0.01
    `);

    console.log(`✅ ${updateResult.affectedRows}명의 사용자 링 잔액이 수정되었습니다.`);

    // 수정 후 검증
    const [afterCheck] = await connection.execute(`
      SELECT COUNT(*) as remaining_inconsistent FROM users u
      WHERE u.id > 0
      AND ABS(u.rings - (
        COALESCE(
          (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
        ) - COALESCE(
          (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
        )
      )) > 0.01
    `);

    if (afterCheck[0].remaining_inconsistent > 0) {
      console.error(`❌ 수정 후에도 ${afterCheck[0].remaining_inconsistent}명의 불일치가 남아있습니다!`);
      await connection.rollback();
      throw new Error('데이터 수정이 완전하지 않습니다.');
    }

    // 수정된 사용자 목록 확인
    const [modifiedUsers] = await connection.execute(`
      SELECT
        u.id,
        u.login_id,
        u.username,
        u.rings as new_rings,
        COALESCE(
          (SELECT SUM(charge_amount) FROM payments p WHERE p.user_id = u.id AND p.status = 'completed'), 0
        ) as total_charged,
        COALESCE(
          (SELECT SUM(amount) FROM consultations c WHERE c.customer_id = u.id AND c.status = '완료'), 0
        ) as total_used
      FROM users u
      WHERE u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      AND u.id > 0
      ORDER BY u.rings DESC
      LIMIT 10
    `);

    console.log('\n📝 수정된 사용자 상위 10명:');
    modifiedUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.login_id})`);
      console.log(`   수정된 잔액: ${user.new_rings}링`);
      console.log(`   충전 총액: ${user.total_charged}링`);
      console.log(`   사용 총액: ${user.total_used}링\n`);
    });

    // 최종 통계
    const [finalStats] = await connection.execute(`
      SELECT
        COUNT(*) as total_users,
        SUM(rings) as total_rings,
        AVG(rings) as avg_rings,
        MIN(rings) as min_rings,
        MAX(rings) as max_rings
      FROM users
      WHERE id > 0
    `);

    console.log('📈 수정 후 전체 링 잔액 통계:');
    console.log(`   총 사용자 수: ${finalStats[0].total_users}명`);
    console.log(`   총 링 잔액: ${finalStats[0].total_rings}링`);
    console.log(`   평균 잔액: ${Math.round(finalStats[0].avg_rings)}링`);
    console.log(`   최소 잔액: ${finalStats[0].min_rings}링`);
    console.log(`   최대 잔액: ${finalStats[0].max_rings}링`);

    await connection.commit();
    console.log('✅ 트랜잭션 커밋 완료! 링 잔액 수정이 성공했습니다.');

    return {
      affected_users: updateResult.affectedRows,
      final_stats: finalStats[0]
    };

  } catch (error) {
    console.error('❌ 수정 중 오류 발생:', error);
    await connection.rollback();
    console.log('🔄 롤백 완료: 모든 변경사항이 취소되었습니다.');
    throw error;
  } finally {
    connection.release();
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  fixRingsBalance()
    .then((result) => {
      if (result) {
        console.log(`\n🎉 링 잔액 수정 완료! ${result.affected_users}명의 데이터가 수정되었습니다.`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 링 잔액 수정 실패:', error);
      process.exit(1);
    });
}

module.exports = { fixRingsBalance };