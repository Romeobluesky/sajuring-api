const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateRingPurchase, validateRingTransfer, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/rings/balance
 * 내 링 잔액 조회
 */
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [users] = await pool.execute(
      'SELECT rings FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return errorResponse(
        res,
        '사용자를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    successResponse(res, '링 잔액 조회 완료', {
      rings: users[0].rings
    });

  } catch (error) {
    console.error('링 잔액 조회 에러:', error);
    errorResponse(
      res,
      '링 잔액 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/rings/purchase
 * 링 구매 (결제 연동)
 */
router.post('/purchase', authenticateToken, validateRingPurchase, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, rings, payment_method, payment_info = {} } = req.body;

    // 트랜잭션 시작
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // TODO: 실제 결제 처리 (PG사 연동)
      // 현재는 가상 결제 처리로 구현
      const paymentResult = await simulatePayment(amount, payment_method, payment_info);
      
      if (!paymentResult.success) {
        await connection.rollback();
        return errorResponse(
          res,
          '결제 처리 중 오류가 발생했습니다.',
          RESPONSE_CODES.SERVER_ERROR,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      // 사용자 링 잔액 업데이트
      await connection.execute(
        'UPDATE users SET rings = rings + ?, updated_at = NOW() WHERE id = ?',
        [rings, userId]
      );

      // 링 구매 내역 기록 (실제 구현시 ring_transactions 테이블 필요)
      // await connection.execute(
      //   'INSERT INTO ring_transactions (user_id, type, amount, rings, payment_method, payment_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      //   [userId, 'purchase', amount, rings, payment_method, paymentResult.payment_id]
      // );

      await connection.commit();

      // 업데이트된 잔액 조회
      const [users] = await connection.execute(
        'SELECT rings FROM users WHERE id = ?',
        [userId]
      );

      successResponse(res, '링 구매가 완료되었습니다.', {
        purchased_rings: rings,
        paid_amount: amount,
        current_balance: users[0].rings,
        payment_id: paymentResult.payment_id
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('링 구매 에러:', error);
    errorResponse(
      res,
      '링 구매 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/rings/transfer
 * 링 전송 (사용자 → 상담사)
 */
router.post('/transfer', authenticateToken, validateRingTransfer, async (req, res) => {
  try {
    const fromUserId = req.user.id;
    const { to_user_id, rings, message = '' } = req.body;

    // 본인에게 전송 방지
    if (fromUserId === to_user_id) {
      return errorResponse(
        res,
        '본인에게는 링을 전송할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 보내는 사용자 잔액 확인
      const [fromUser] = await connection.execute(
        'SELECT rings FROM users WHERE id = ?',
        [fromUserId]
      );

      if (fromUser.length === 0) {
        await connection.rollback();
        return errorResponse(
          res,
          '사용자를 찾을 수 없습니다.',
          RESPONSE_CODES.NOT_FOUND,
          HTTP_STATUS.NOT_FOUND
        );
      }

      if (fromUser[0].rings < rings) {
        await connection.rollback();
        return errorResponse(
          res,
          '링 잔액이 부족합니다.',
          RESPONSE_CODES.VALIDATION_ERROR,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      // 받는 사용자 확인
      const [toUser] = await connection.execute(
        'SELECT rings FROM users WHERE id = ?',
        [to_user_id]
      );

      if (toUser.length === 0) {
        await connection.rollback();
        return errorResponse(
          res,
          '받는 사용자를 찾을 수 없습니다.',
          RESPONSE_CODES.NOT_FOUND,
          HTTP_STATUS.NOT_FOUND
        );
      }

      // 링 전송 처리
      await connection.execute(
        'UPDATE users SET rings = rings - ?, updated_at = NOW() WHERE id = ?',
        [rings, fromUserId]
      );

      await connection.execute(
        'UPDATE users SET rings = rings + ?, updated_at = NOW() WHERE id = ?',
        [rings, to_user_id]
      );

      // 전송 내역 기록 (실제 구현시 ring_transfers 테이블 필요)
      // await connection.execute(
      //   'INSERT INTO ring_transfers (from_user_id, to_user_id, rings, message, created_at) VALUES (?, ?, ?, ?, NOW())',
      //   [fromUserId, to_user_id, rings, message]
      // );

      await connection.commit();

      // 업데이트된 잔액 조회
      const [updatedFromUser] = await connection.execute(
        'SELECT rings FROM users WHERE id = ?',
        [fromUserId]
      );

      successResponse(res, '링 전송이 완료되었습니다.', {
        transferred_rings: rings,
        remaining_balance: updatedFromUser[0].rings,
        to_user_id,
        message
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('링 전송 에러:', error);
    errorResponse(
      res,
      '링 전송 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/rings/history
 * 링 거래 내역 조회 (충전 + 상담 사용 내역 통합)
 */
router.get('/history', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      type = null, // 'purchase', 'consultation'
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 타입 필터 조건
    let typeFilter = '';
    if (type === 'purchase') {
      typeFilter = "WHERE type = 'purchase'";
    } else if (type === 'consultation') {
      typeFilter = "WHERE type = 'consultation'";
    }

    // 링 충전 내역과 상담 사용 내역을 통합 조회
    const [history] = await pool.execute(
      `SELECT * FROM (
        -- 링 구매/충전 내역 (입금)
        SELECT
          CONCAT('PAY_', p.id) as id,
          'purchase' as type,
          p.charge_amount as rings,
          p.payment_amount as amount,
          p.payment_method,
          CONCAT('링 ', p.charge_amount, '개 충전 (', p.payment_method, ')') as description,
          NULL as consultant_name,
          NULL as consultant_number,
          NULL as consultation_type,
          NULL as consultation_duration,
          p.created_at
        FROM payments p
        WHERE p.user_id = ? AND p.status = 'completed'

        UNION ALL

        -- 상담으로 인한 링 사용 내역 (출금)
        SELECT
          CONCAT('CONS_', c.id) as id,
          'consultation' as type,
          -c.amount as rings,  -- 음수로 표시 (사용된 링)
          c.amount,
          NULL as payment_method,
          CONCAT(cons.stage_name, ' ', c.consultation_type, ' 상담') as description,
          cons.stage_name as consultant_name,
          cons.consultant_number,
          c.consultation_type,
          c.duration_time as consultation_duration,
          c.created_at
        FROM consultations c
        JOIN consultants cons ON c.consultant_id = cons.id
        WHERE c.customer_id = ? AND c.status = '완료'
      ) combined_history
      ${typeFilter}
      ORDER BY created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}`,
      [userId, userId]
    );

    // 전체 개수 조회 (타입별 필터링)
    let total = 0;
    if (type === 'purchase') {
      const [purchaseCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM payments WHERE user_id = ? AND status = "completed"',
        [userId]
      );
      total = purchaseCount[0].total;
    } else if (type === 'consultation') {
      const [consultationCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM consultations WHERE customer_id = ? AND status = "완료"',
        [userId]
      );
      total = consultationCount[0].total;
    } else {
      // 전체 개수 (purchase + consultation)
      const [purchaseCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM payments WHERE user_id = ? AND status = "completed"',
        [userId]
      );
      const [consultationCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM consultations WHERE customer_id = ? AND status = "완료"',
        [userId]
      );
      total = purchaseCount[0].total + consultationCount[0].total;
    }

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '링 거래 내역 조회 완료', {
      history,
      count: history.length,
      filters: {
        type,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('링 내역 조회 에러:', error);
    errorResponse(
      res,
      '링 거래 내역 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/rings/verify-balance
 * 데이터 정합성 검증 (관리자용)
 */
router.get('/verify-balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role_level >= 8;

    if (!isAdmin) {
      return errorResponse(
        res,
        '관리자 권한이 필요합니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // users 테이블의 현재 링 잔액과 실제 거래 내역으로 계산한 잔액 비교
    const [verification] = await pool.execute(`
      SELECT
        u.id,
        u.login_id,
        u.username,
        u.rings as current_balance,
        COALESCE(
          (SELECT SUM(charge_amount) FROM payments WHERE user_id = u.id AND status = 'completed'), 0
        ) - COALESCE(
          (SELECT SUM(amount) FROM consultations WHERE customer_id = u.id AND status = '완료'), 0
        ) as calculated_balance,
        (u.rings - (
          COALESCE(
            (SELECT SUM(charge_amount) FROM payments WHERE user_id = u.id AND status = 'completed'), 0
          ) - COALESCE(
            (SELECT SUM(amount) FROM consultations WHERE customer_id = u.id AND status = '완료'), 0
          )
        )) as difference
      FROM users u
      WHERE u.id = ?
    `, [userId]);

    if (verification.length === 0) {
      return errorResponse(
        res,
        '사용자를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const result = verification[0];
    const isConsistent = Math.abs(result.difference) < 0.01; // 소수점 오차 허용

    successResponse(res, '링 잔액 검증 완료', {
      user_info: {
        id: result.id,
        login_id: result.login_id,
        username: result.username
      },
      balance_verification: {
        current_balance: result.current_balance,
        calculated_balance: result.calculated_balance,
        difference: result.difference,
        is_consistent: isConsistent
      }
    });

  } catch (error) {
    console.error('링 잔액 검증 에러:', error);
    errorResponse(
      res,
      '링 잔액 검증 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * 가상 결제 처리 함수 (실제 구현시 PG사 API 연동)
 */
async function simulatePayment(amount, paymentMethod, paymentInfo) {
  // 실제 구현시 PG사 API 호출
  return new Promise((resolve) => {
    setTimeout(() => {
      // 90% 확률로 성공
      const success = Math.random() > 0.1;
      resolve({
        success,
        payment_id: success ? `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null,
        message: success ? '결제 성공' : '결제 실패'
      });
    }, 1000); // 1초 지연으로 실제 결제 처리 시뮬레이션
  });
}

module.exports = router;