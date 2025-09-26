const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * 상담 시작 유효성 검사
 */
const validateConsultationStart = [
  body('consultant_id')
    .isInt({ min: 1 })
    .withMessage('유효한 상담사 ID가 아닙니다.'),

  body('consultation_type')
    .isIn(['타로', '신점', '랜덤'])
    .withMessage('상담 유형은 타로, 신점, 랜덤 중 하나여야 합니다.'),

  body('consultation_method')
    .isIn(['전화', '채팅', '화상'])
    .withMessage('상담 방식은 전화, 채팅, 화상 중 하나여야 합니다.'),

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
 * 상담 평가 유효성 검사
 */
const validateConsultationRate = [
  body('consultation_id')
    .isInt({ min: 1 })
    .withMessage('유효한 상담 ID가 아닙니다.'),

  body('rating')
    .isFloat({ min: 1, max: 5 })
    .withMessage('평점은 1-5 사이의 숫자여야 합니다.'),

  body('review')
    .optional()
    .isLength({ max: 500 })
    .withMessage('리뷰는 500자 이하여야 합니다.'),

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
 * POST /api/consultations/start
 * 상담 시작 요청
 */
router.post('/start', authenticateToken, validateConsultationStart, async (req, res) => {
  try {
    const {
      consultant_id,
      consultation_type,
      consultation_method
    } = req.body;

    const customerId = req.user.id;

    // 상담사 정보 확인
    const [consultants] = await pool.execute(
      `SELECT id, name, consultant_number, consultation_fee, consultant_grade, status
       FROM consultants WHERE id = ? AND status = 'active'`,
      [consultant_id]
    );

    if (consultants.length === 0) {
      return errorResponse(
        res,
        '활성화된 상담사를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultant = consultants[0];

    // 사용자 링 잔액 확인
    const [users] = await pool.execute(
      'SELECT rings FROM users WHERE id = ?',
      [customerId]
    );

    const userRings = users[0].rings;
    const minimumRings = 10; // 최소 10링 필요

    if (userRings < minimumRings) {
      return errorResponse(
        res,
        '상담을 시작하기 위한 링이 부족합니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 고유 상담 번호 생성
    const consultationNumber = `cons_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 상담 정보 등록
    const [result] = await pool.execute(
      `INSERT INTO consultations (
        consultation_id, customer_id, consultant_id, consultant_grade_at_time,
        fee_rate_at_time, consultation_type, consultation_method,
        consultation_date, start_time, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), NOW(), '상담중')`,
      [
        consultationNumber,
        customerId,
        consultant_id,
        consultant.consultant_grade,
        consultant.consultation_fee,
        consultation_type,
        consultation_method
      ]
    );

    successResponse(res, '상담이 시작되었습니다.', {
      consultation: {
        id: result.insertId,
        consultation_id: consultationNumber,
        consultant: {
          id: consultant.id,
          name: consultant.name,
          consultant_number: consultant.consultant_number
        },
        consultation_type,
        consultation_method,
        fee_rate: consultant.consultation_fee,
        status: '상담중'
      }
    });

  } catch (error) {
    console.error('상담 시작 에러:', error);
    errorResponse(
      res,
      '상담 시작 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultations/end
 * 상담 종료
 */
router.post('/end', authenticateToken, async (req, res) => {
  try {
    const {
      consultation_id,
      consultation_summary = null,
      consultation_notes = null
    } = req.body;

    const userId = req.user.id;

    // 상담 정보 확인 (본인 상담인지 확인)
    const [consultations] = await pool.execute(
      `SELECT id, customer_id, consultant_id, start_time, fee_rate_at_time, status
       FROM consultations
       WHERE id = ? AND (customer_id = ? OR consultant_id IN (
         SELECT id FROM consultants WHERE user_id = ?
       )) AND status = '상담중'`,
      [consultation_id, userId, userId]
    );

    if (consultations.length === 0) {
      return errorResponse(
        res,
        '진행 중인 본인의 상담을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultation = consultations[0];
    const endTime = new Date();
    const startTime = new Date(consultation.start_time);
    const durationMinutes = Math.ceil((endTime - startTime) / (1000 * 60));

    // 상담료 계산 (30초 단위)
    const units = Math.ceil((durationMinutes * 60) / 30);
    const totalAmount = units * consultation.fee_rate_at_time;

    // 상담 종료 처리
    await pool.execute(
      `UPDATE consultations
       SET end_time = NOW(), duration_minutes = ?, amount = ?,
           status = '완료', consultation_summary = ?, consultation_notes = ?
       WHERE id = ?`,
      [durationMinutes, totalAmount, consultation_summary, consultation_notes, consultation_id]
    );

    // 고객 링 차감
    await pool.execute(
      'UPDATE users SET rings = GREATEST(rings - ?, 0) WHERE id = ?',
      [totalAmount, consultation.customer_id]
    );

    // 상담사 링 적립 (정산율 적용 - 임시로 70% 적용)
    const consultantAmount = Math.floor(totalAmount * 0.7);
    const [consultantUser] = await pool.execute(
      'SELECT user_id FROM consultants WHERE id = ?',
      [consultation.consultant_id]
    );

    if (consultantUser.length > 0) {
      await pool.execute(
        'UPDATE users SET rings = rings + ? WHERE id = ?',
        [consultantAmount, consultantUser[0].user_id]
      );
    }

    successResponse(res, '상담이 종료되었습니다.', {
      consultation: {
        id: consultation_id,
        duration_minutes: durationMinutes,
        total_amount: totalAmount,
        consultant_amount: consultantAmount,
        status: '완료'
      }
    });

  } catch (error) {
    console.error('상담 종료 에러:', error);
    errorResponse(
      res,
      '상담 종료 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultations/history
 * 내 상담 기록
 */
router.get('/history', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status = null,
      consultation_type = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // WHERE 조건 구성 (고객 또는 상담사로 참여한 상담)
    let whereConditions = [
      '(c.customer_id = ? OR c.consultant_id IN (SELECT id FROM consultants WHERE user_id = ?))'
    ];
    let queryParams = [userId, userId];

    if (status) {
      whereConditions.push('c.status = ?');
      queryParams.push(status);
    }

    if (consultation_type) {
      whereConditions.push('c.consultation_type = ?');
      queryParams.push(consultation_type);
    }

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 상담 기록 조회 (후기 작성 여부 포함)
    const [consultations] = await pool.execute(
      `SELECT c.id, c.consultation_id, c.consultation_type, c.consultation_method,
       c.consultation_date, c.start_time, c.end_time, c.duration_minutes,
       c.amount, c.status, c.consultation_summary,
       cons.name as consultant_name, cons.consultant_number,
       cons.profile_image as consultant_profile_image, cons.stage_name as consultant_stage_name,
       u.username as customer_name,
       CASE WHEN r.id IS NOT NULL THEN true ELSE false END as has_review,
       CASE WHEN c.end_time IS NOT NULL
            THEN DATE_ADD(c.end_time, INTERVAL 7 DAY)
            ELSE NULL END as review_deadline
       FROM consultations c
       LEFT JOIN consultants cons ON c.consultant_id = cons.id
       LEFT JOIN users u ON c.customer_id = u.id
       LEFT JOIN reviews r ON c.id = r.consultation_id
       WHERE ${whereClause}
       ORDER BY c.consultation_date DESC, c.start_time DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultations c WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '상담 기록 조회 완료', {
      consultations,
      count: consultations.length,
      filters: {
        status,
        consultation_type,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('상담 기록 조회 에러:', error);
    errorResponse(
      res,
      '상담 기록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultations/:id/status
 * 상담 상태 확인
 */
router.get('/:id/status', authenticateToken, validateId, async (req, res) => {
  try {
    const consultationId = req.params.id;
    const userId = req.user.id;

    // 상담 상태 조회 (본인 상담인지 확인)
    const [consultations] = await pool.execute(
      `SELECT c.id, c.consultation_id, c.status, c.start_time, c.end_time,
       c.duration_minutes, c.amount,
       cons.name as consultant_name,
       u.username as customer_name
       FROM consultations c
       LEFT JOIN consultants cons ON c.consultant_id = cons.id
       LEFT JOIN users u ON c.customer_id = u.id
       WHERE c.id = ? AND (c.customer_id = ? OR c.consultant_id IN (
         SELECT id FROM consultants WHERE user_id = ?
       ))`,
      [consultationId, userId, userId]
    );

    if (consultations.length === 0) {
      return errorResponse(
        res,
        '상담 정보를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultation = consultations[0];

    successResponse(res, '상담 상태 조회 완료', {
      consultation
    });

  } catch (error) {
    console.error('상담 상태 조회 에러:', error);
    errorResponse(
      res,
      '상담 상태 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultations/:id
 * 상담 상세 정보
 */
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const consultationId = req.params.id;
    const userId = req.user.id;

    // 상담 상세 정보 조회
    const [consultations] = await pool.execute(
      `SELECT c.*, cons.name as consultant_name, cons.consultant_number,
       cons.stage_name, cons.profile_image,
       u.username as customer_name
       FROM consultations c
       LEFT JOIN consultants cons ON c.consultant_id = cons.id
       LEFT JOIN users u ON c.customer_id = u.id
       WHERE c.id = ? AND (c.customer_id = ? OR c.consultant_id IN (
         SELECT id FROM consultants WHERE user_id = ?
       ))`,
      [consultationId, userId, userId]
    );

    if (consultations.length === 0) {
      return errorResponse(
        res,
        '상담 정보를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultation = consultations[0];

    successResponse(res, '상담 상세 조회 완료', {
      consultation
    });

  } catch (error) {
    console.error('상담 상세 조회 에러:', error);
    errorResponse(
      res,
      '상담 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultations/rate
 * 상담 평가 (후기와 별도로 평가만 할 수 있음)
 */
router.post('/rate', authenticateToken, validateConsultationRate, async (req, res) => {
  try {
    const { consultation_id, rating, review } = req.body;
    const userId = req.user.id;

    // 상담 정보 확인 (완료된 본인 상담인지 확인)
    const [consultations] = await pool.execute(
      `SELECT c.id, c.customer_id, c.consultant_id, c.status,
       cons.consultant_number
       FROM consultations c
       LEFT JOIN consultants cons ON c.consultant_id = cons.id
       WHERE c.id = ? AND c.customer_id = ? AND c.status = '완료'`,
      [consultation_id, userId]
    );

    if (consultations.length === 0) {
      return errorResponse(
        res,
        '완료된 본인의 상담만 평가할 수 있습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 간단 평가 기록 (reviews 테이블과는 별도)
    // 여기서는 상담사 평점만 업데이트
    const consultation = consultations[0];

    // 상담사 평균 평점 업데이트
    const [avgResult] = await pool.execute(
      'SELECT AVG(review_rating) as avg_rating FROM reviews WHERE consultant_number = ?',
      [consultation.consultant_number]
    );

    // 새로운 평점을 포함한 평균 계산 (임시로 간단하게 계산)
    let newAvgRating = rating;
    if (avgResult[0].avg_rating) {
      newAvgRating = (parseFloat(avgResult[0].avg_rating) + rating) / 2;
    }

    await pool.execute(
      'UPDATE consultants SET consultation_rate = ? WHERE consultant_number = ?',
      [newAvgRating.toFixed(2), consultation.consultant_number]
    );

    successResponse(res, '상담 평가가 완료되었습니다.', {
      consultation_id,
      rating,
      review,
      updated_avg_rating: newAvgRating.toFixed(2)
    });

  } catch (error) {
    console.error('상담 평가 에러:', error);
    errorResponse(
      res,
      '상담 평가 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;