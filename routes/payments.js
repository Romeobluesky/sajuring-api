const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * 관리자 권한 체크 미들웨어
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN' && req.user.role_level < 8) {
    return errorResponse(
      res,
      '관리자 권한이 필요합니다.',
      RESPONSE_CODES.FORBIDDEN,
      HTTP_STATUS.FORBIDDEN
    );
  }
  next();
};

/**
 * 결제 생성 유효성 검사
 */
const validatePayment = [
  body('payment_method')
    .isIn(['card', 'bank', 'kakaopay', 'naverpay'])
    .withMessage('결제 방식은 card, bank, kakaopay, naverpay 중 하나여야 합니다.'),

  body('payment_amount')
    .isFloat({ min: 1000 })
    .withMessage('결제 금액은 1000원 이상이어야 합니다.'),

  body('charge_amount')
    .isFloat({ min: 1 })
    .withMessage('충전 금액은 1 이상이어야 합니다.'),

  body('is_sajuring_pay')
    .optional()
    .isBoolean()
    .withMessage('사주링페이 사용 여부는 true 또는 false여야 합니다.'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => error.msg);
      return errorResponse(
        res,
        errorMessages.join(', '),
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    next();
  }
];

/**
 * GET /api/payments/history
 * 결제 내역 조회
 */
router.get('/history', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status = null,
      payment_method = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // WHERE 조건 구성
    let whereConditions = ['user_id = ?'];
    let queryParams = [userId];

    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    if (payment_method) {
      whereConditions.push('payment_method = ?');
      queryParams.push(payment_method);
    }

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 결제 내역 조회
    const [payments] = await pool.execute(
      `SELECT id, payment_method, is_sajuring_pay, payment_amount, charge_amount,
       status, created_at
       FROM payments
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM payments WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '결제 내역 조회 완료', {
      payments,
      count: payments.length,
      filters: {
        status,
        payment_method,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('결제 내역 조회 에러:', error);
    errorResponse(
      res,
      '결제 내역 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/payments/create
 * 새 결제 생성
 */
router.post('/create', authenticateToken, validatePayment, async (req, res) => {
  try {
    const {
      payment_method,
      payment_amount,
      charge_amount,
      is_sajuring_pay = false
    } = req.body;

    const userId = req.user.id;
    const userName = req.user.username || req.user.nickname;
    const userLoginId = req.user.login_id;

    // 고유 결제 ID 생성 (timestamp + random)
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 결제 정보 생성
    const [result] = await pool.execute(
      `INSERT INTO payments (
        id, user_id, user_login_id, user_name, payment_method, is_sajuring_pay,
        payment_amount, charge_amount, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        paymentId,
        userId,
        userLoginId,
        userName,
        payment_method,
        is_sajuring_pay,
        payment_amount,
        charge_amount
      ]
    );

    successResponse(res, '결제가 생성되었습니다.', {
      payment: {
        id: paymentId,
        user_id: userId,
        payment_method,
        payment_amount,
        charge_amount,
        is_sajuring_pay,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('결제 생성 에러:', error);
    errorResponse(
      res,
      '결제 생성 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/payments/:id
 * 결제 상세 정보
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const paymentId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role_level >= 8;

    // 결제 정보 조회 (본인 결제만 조회 가능, 관리자는 모든 결제 조회 가능)
    let query = 'SELECT * FROM payments WHERE id = ?';
    let params = [paymentId];

    if (!isAdmin) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const [payments] = await pool.execute(query, params);

    if (payments.length === 0) {
      return errorResponse(
        res,
        '결제 정보를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const payment = payments[0];

    successResponse(res, '결제 상세 조회 완료', {
      payment
    });

  } catch (error) {
    console.error('결제 상세 조회 에러:', error);
    errorResponse(
      res,
      '결제 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/payments/:id/status
 * 결제 상태 변경 (관리자 또는 결제 시스템)
 */
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const paymentId = req.params.id;
    const { status } = req.body;

    // 유효한 상태인지 확인
    const validStatuses = ['pending', 'completed', 'cancelled', 'failed'];
    if (!validStatuses.includes(status)) {
      return errorResponse(
        res,
        `결제 상태는 ${validStatuses.join(', ')} 중 하나여야 합니다.`,
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 관리자 권한 확인 (일반 사용자는 cancelled만 가능)
    const isAdmin = req.user.role === 'ADMIN' || req.user.role_level >= 8;
    if (!isAdmin && status !== 'cancelled') {
      return errorResponse(
        res,
        '일반 사용자는 결제 취소만 가능합니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 결제 정보 조회
    let query = 'SELECT * FROM payments WHERE id = ?';
    let params = [paymentId];

    if (!isAdmin) {
      query += ' AND user_id = ?';
      params.push(req.user.id);
    }

    const [payments] = await pool.execute(query, params);

    if (payments.length === 0) {
      return errorResponse(
        res,
        '결제 정보를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const payment = payments[0];

    // 이미 완료된 결제는 변경 불가
    if (payment.status === 'completed' && status !== 'completed') {
      return errorResponse(
        res,
        '완료된 결제는 상태를 변경할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 결제 상태 변경
    await pool.execute(
      'UPDATE payments SET status = ? WHERE id = ?',
      [status, paymentId]
    );

    // 결제 완료시 사용자 링 잔액 증가
    if (status === 'completed' && payment.status !== 'completed') {
      await pool.execute(
        'UPDATE users SET rings = rings + ? WHERE id = ?',
        [payment.charge_amount, payment.user_id]
      );
    }

    // 결제 취소시 사용자 링 잔액 차감 (이미 완료된 결제가 취소되는 경우)
    if (status === 'cancelled' && payment.status === 'completed') {
      await pool.execute(
        'UPDATE users SET rings = GREATEST(rings - ?, 0) WHERE id = ?',
        [payment.charge_amount, payment.user_id]
      );
    }

    successResponse(res, '결제 상태가 변경되었습니다.', {
      payment: {
        id: paymentId,
        previous_status: payment.status,
        new_status: status,
        charge_amount: payment.charge_amount
      }
    });

  } catch (error) {
    console.error('결제 상태 변경 에러:', error);
    errorResponse(
      res,
      '결제 상태 변경 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;