const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * 후기 작성 유효성 검사
 */
const validateReview = [
  body('consultation_id')
    .isInt({ min: 1 })
    .withMessage('유효한 상담 ID가 아닙니다.'),

  body('review_content')
    .notEmpty()
    .withMessage('후기 내용을 입력해주세요.')
    .isLength({ min: 10, max: 1000 })
    .withMessage('후기 내용은 10-1000자 사이여야 합니다.'),

  body('review_rating')
    .isFloat({ min: 1, max: 5 })
    .withMessage('평점은 1-5 사이의 숫자여야 합니다.'),

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
 * 상담사 답변 유효성 검사
 */
const validateConsultantComment = [
  body('consultant_comment')
    .notEmpty()
    .withMessage('답변 내용을 입력해주세요.')
    .isLength({ min: 5, max: 500 })
    .withMessage('답변 내용은 5-500자 사이여야 합니다.'),

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
 * POST /api/reviews
 * 후기 작성
 */
router.post('/', authenticateToken, validateReview, async (req, res) => {
  try {
    const {
      consultation_id,
      review_content,
      review_rating
    } = req.body;

    const userId = req.user.id;

    // 상담 정보 확인 (본인이 참여한 완료된 상담인지 확인)
    const [consultations] = await pool.execute(
      `SELECT c.id, c.consultation_id, c.customer_id, c.consultant_id, c.status,
       c.consultation_type, c.consultation_method, c.consultation_date,
       cons.name as consultant_name, cons.consultant_number,
       u.username as customer_name
       FROM consultations c
       LEFT JOIN consultants cons ON c.consultant_id = cons.id
       LEFT JOIN users u ON c.customer_id = u.id
       WHERE c.id = ? AND c.customer_id = ? AND c.status = '완료'`,
      [consultation_id, userId]
    );

    if (consultations.length === 0) {
      return errorResponse(
        res,
        '완료된 본인의 상담만 후기를 작성할 수 있습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const consultation = consultations[0];

    // 이미 후기가 있는지 확인
    const [existingReviews] = await pool.execute(
      'SELECT id FROM reviews WHERE consultation_id = ?',
      [consultation_id]
    );

    if (existingReviews.length > 0) {
      return errorResponse(
        res,
        '이미 후기를 작성하셨습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 후기 등록
    const [result] = await pool.execute(
      `INSERT INTO reviews (
        consultation_id, customer_name, consultation_type, consultation_method,
        consultant_name, consultant_number, review_content, review_rating, consultation_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consultation_id,
        consultation.customer_name,
        consultation.consultation_type,
        consultation.consultation_method,
        consultation.consultant_name,
        consultation.consultant_number,
        review_content,
        review_rating,
        consultation.consultation_date
      ]
    );

    // 상담사 평균 평점 업데이트
    const [avgResult] = await pool.execute(
      'SELECT AVG(review_rating) as avg_rating FROM reviews WHERE consultant_number = ?',
      [consultation.consultant_number]
    );

    const avgRating = parseFloat(avgResult[0].avg_rating || 0).toFixed(2);

    await pool.execute(
      'UPDATE consultants SET consultation_rate = ? WHERE consultant_number = ?',
      [avgRating, consultation.consultant_number]
    );

    successResponse(res, '후기가 등록되었습니다.', {
      review: {
        id: result.insertId,
        consultation_id,
        consultant_name: consultation.consultant_name,
        review_content,
        review_rating,
        updated_avg_rating: avgRating
      }
    });

  } catch (error) {
    console.error('후기 등록 에러:', error);
    errorResponse(
      res,
      '후기 등록 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/reviews/my
 * 내 후기 목록 조회
 */
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.id; // JWT 토큰에서 사용자 ID 추출

    const [reviews] = await pool.execute(`
      SELECT
        r.id,
        r.consultation_id,
        r.review_content as content,
        r.review_rating as rating,
        r.consultant_comment,
        r.comment_date,
        r.is_best,
        r.created_at,
        r.updated_at,
        r.consultant_name,
        r.consultant_number,
        r.consultation_type,
        r.consultation_method,
        r.consultation_date,
        c.duration_time,
        cons.stage_name as consultant_stage_name
      FROM reviews r
      LEFT JOIN consultations c ON r.consultation_id = c.id
      LEFT JOIN consultants cons ON r.consultant_number = cons.consultant_number
      WHERE c.customer_id = ?
      ORDER BY r.created_at DESC
    `, [customerId]);

    successResponse(res, '내 리뷰 목록 조회 완료', {
      data: reviews
    });

  } catch (error) {
    console.error('내 리뷰 조회 오류:', error);
    errorResponse(
      res,
      '서버 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/reviews/consultant/:id
 * 상담사별 후기 조회
 */
router.get('/consultant/:id', optionalAuth, validateId, validatePagination, async (req, res) => {
  try {
    const consultantId = req.params.id;
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 상담사 정보 확인
    const [consultants] = await pool.execute(
      'SELECT id, name, consultant_number, consultation_rate FROM consultants WHERE id = ?',
      [consultantId]
    );

    if (consultants.length === 0) {
      return errorResponse(
        res,
        '상담사를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultant = consultants[0];

    // 후기 목록 조회
    const [reviews] = await pool.execute(
      `SELECT id, customer_name, consultation_type, consultation_method, review_content,
       review_rating, consultation_date, created_at, consultant_comment, comment_date, is_best
       FROM reviews
       WHERE consultant_number = ?
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      [consultant.consultant_number]
    );

    // 전체 후기 수 조회
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM reviews WHERE consultant_number = ?',
      [consultant.consultant_number]
    );
    const total = countResult[0].total;

    // 평점 분포 조회
    const [ratingDistribution] = await pool.execute(
      `SELECT review_rating, COUNT(*) as count
       FROM reviews
       WHERE consultant_number = ?
       GROUP BY review_rating
       ORDER BY review_rating DESC`,
      [consultant.consultant_number]
    );

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '상담사 후기 조회 완료', {
      consultant: {
        id: consultant.id,
        name: consultant.name,
        consultation_rate: consultant.consultation_rate
      },
      reviews,
      statistics: {
        total_reviews: total,
        average_rating: consultant.consultation_rate,
        rating_distribution: ratingDistribution
      },
      count: reviews.length
    }, pagination);

  } catch (error) {
    console.error('상담사 후기 조회 에러:', error);
    errorResponse(
      res,
      '상담사 후기 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/reviews/:id
 * 후기 상세보기
 */
router.get('/:id', optionalAuth, validateId, async (req, res) => {
  try {
    const reviewId = req.params.id;

    const [reviews] = await pool.execute(
      `SELECT * FROM reviews WHERE id = ?`,
      [reviewId]
    );

    if (reviews.length === 0) {
      return errorResponse(
        res,
        '후기를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const review = reviews[0];

    successResponse(res, '후기 상세 조회 완료', {
      review
    });

  } catch (error) {
    console.error('후기 상세 조회 에러:', error);
    errorResponse(
      res,
      '후기 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/reviews/:id
 * 후기 수정
 */
router.put('/:id', authenticateToken, validateId, validateReview, async (req, res) => {
  try {
    const reviewId = req.params.id;
    const {
      review_content,
      review_rating
    } = req.body;

    const userId = req.user.id;

    // 후기 정보 및 권한 확인
    const [reviews] = await pool.execute(
      `SELECT r.id, r.consultation_id, r.consultant_number, c.customer_id
       FROM reviews r
       LEFT JOIN consultations c ON r.consultation_id = c.id
       WHERE r.id = ? AND c.customer_id = ?`,
      [reviewId, userId]
    );

    if (reviews.length === 0) {
      return errorResponse(
        res,
        '본인이 작성한 후기만 수정할 수 있습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    const review = reviews[0];

    // 후기 수정
    await pool.execute(
      `UPDATE reviews
       SET review_content = ?, review_rating = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [review_content, review_rating, reviewId]
    );

    // 상담사 평균 평점 재계산
    const [avgResult] = await pool.execute(
      'SELECT AVG(review_rating) as avg_rating FROM reviews WHERE consultant_number = ?',
      [review.consultant_number]
    );

    const avgRating = parseFloat(avgResult[0].avg_rating || 0).toFixed(2);

    await pool.execute(
      'UPDATE consultants SET consultation_rate = ? WHERE consultant_number = ?',
      [avgRating, review.consultant_number]
    );

    successResponse(res, '후기가 수정되었습니다.', {
      review: {
        id: reviewId,
        review_content,
        review_rating,
        updated_avg_rating: avgRating
      }
    });

  } catch (error) {
    console.error('후기 수정 에러:', error);
    errorResponse(
      res,
      '후기 수정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/reviews/:id/comment
 * 상담사 답변 작성
 */
router.post('/:id/comment', authenticateToken, validateId, validateConsultantComment, async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { consultant_comment } = req.body;
    const userId = req.user.id;

    // 상담사 권한 확인 및 해당 후기가 본인에 대한 것인지 확인
    const [reviews] = await pool.execute(
      `SELECT r.id, r.consultant_number, c.id as consultant_id
       FROM reviews r
       LEFT JOIN consultants c ON r.consultant_number = c.consultant_number
       WHERE r.id = ? AND c.user_id = ?`,
      [reviewId, userId]
    );

    if (reviews.length === 0) {
      return errorResponse(
        res,
        '본인에 대한 후기에만 답변할 수 있습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 답변 등록
    await pool.execute(
      `UPDATE reviews
       SET consultant_comment = ?, comment_date = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [consultant_comment, reviewId]
    );

    successResponse(res, '답변이 등록되었습니다.', {
      review: {
        id: reviewId,
        consultant_comment
      }
    });

  } catch (error) {
    console.error('상담사 답변 등록 에러:', error);
    errorResponse(
      res,
      '상담사 답변 등록 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;