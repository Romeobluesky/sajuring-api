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
 * 링 사용 내역 조회
 */
router.get('/history', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      type = null, // 'purchase', 'transfer_send', 'transfer_receive', 'consultation'
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // 실제 구현시 ring_transactions 테이블에서 조회
    // 현재는 예시 데이터로 응답
    const mockHistory = [
      {
        id: 1,
        type: 'purchase',
        amount: 10000,
        rings: 100,
        description: '링 구매',
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        type: 'transfer_send',
        amount: null,
        rings: -20,
        description: '상담사에게 링 전송',
        target_user: '홍길동 상담사',
        created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    // 타입 필터링
    let filteredHistory = mockHistory;
    if (type) {
      filteredHistory = mockHistory.filter(item => item.type === type);
    }

    const total = filteredHistory.length;
    const offset = (page - 1) * limit;
    const paginatedHistory = filteredHistory.slice(offset, offset + parseInt(limit));

    const pagination = createPagination(page, limit, total);

    successResponse(res, '링 사용 내역 조회 완료', {
      history: paginatedHistory,
      filter: { type }
    }, pagination);

  } catch (error) {
    console.error('링 내역 조회 에러:', error);
    errorResponse(
      res,
      '링 사용 내역 조회 중 오류가 발생했습니다.',
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