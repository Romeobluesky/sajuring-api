const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
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
 * 공지사항 유효성 검사
 */
const validateNotice = [
  body('title')
    .notEmpty()
    .withMessage('제목을 입력해주세요.')
    .isLength({ min: 5, max: 200 })
    .withMessage('제목은 5-200자 사이여야 합니다.'),

  body('content')
    .notEmpty()
    .withMessage('내용을 입력해주세요.')
    .isLength({ min: 10, max: 10000 })
    .withMessage('내용은 10-10000자 사이여야 합니다.'),

  body('type')
    .isIn(['general', 'consultant'])
    .withMessage('공지 대상은 general 또는 consultant여야 합니다.'),

  body('category')
    .optional()
    .isIn(['서비스', '이벤트', '시스템', '기타'])
    .withMessage('카테고리는 서비스, 이벤트, 시스템, 기타 중 하나여야 합니다.'),

  body('is_important')
    .optional()
    .isBoolean()
    .withMessage('중요 공지 여부는 true 또는 false여야 합니다.'),

  body('is_pinned')
    .optional()
    .isBoolean()
    .withMessage('상단 고정 여부는 true 또는 false여야 합니다.'),

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
 * GET /api/notices
 * 공지사항 목록 조회 (type, category 필터 지원)
 */
router.get('/', optionalAuth, validatePagination, async (req, res) => {
  try {
    const {
      type = null,
      category = null,
      status = 'active',
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // WHERE 조건 구성
    let whereConditions = ['1=1'];
    let queryParams = [];

    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    if (type) {
      whereConditions.push('type = ?');
      queryParams.push(type);
    }

    if (category) {
      whereConditions.push('category = ?');
      queryParams.push(category);
    }

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 공지사항 목록 조회 (고정 공지 우선, 중요 공지 다음, 생성일 최신순)
    const [notices] = await pool.execute(
      `SELECT id, title, content, type, category, status, is_important, is_pinned,
       views, author, created_at, updated_at
       FROM notices
       WHERE ${whereClause}
       ORDER BY is_pinned DESC, is_important DESC, created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM notices WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '공지사항 목록 조회 완료', {
      notices,
      count: notices.length,
      filters: {
        type,
        category,
        status,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('공지사항 목록 조회 에러:', error);
    errorResponse(
      res,
      '공지사항 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/notices/:id
 * 공지사항 상세보기 (조회수 증가)
 */
router.get('/:id', optionalAuth, validateId, async (req, res) => {
  try {
    const noticeId = req.params.id;

    const [notices] = await pool.execute(
      'SELECT * FROM notices WHERE id = ?',
      [noticeId]
    );

    if (notices.length === 0) {
      return errorResponse(
        res,
        '공지사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const notice = notices[0];

    // 조회수 증가
    await pool.execute(
      'UPDATE notices SET views = views + 1 WHERE id = ?',
      [noticeId]
    );

    notice.views = notice.views + 1;

    successResponse(res, '공지사항 상세 조회 완료', {
      notice
    });

  } catch (error) {
    console.error('공지사항 상세 조회 에러:', error);
    errorResponse(
      res,
      '공지사항 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/notices
 * 공지사항 등록 (관리자)
 */
router.post('/', authenticateToken, requireAdmin, validateNotice, async (req, res) => {
  try {
    const {
      title,
      content,
      type,
      category = '기타',
      is_important = false,
      is_pinned = false
    } = req.body;

    const author = req.user.username || req.user.login_id;

    const [result] = await pool.execute(
      `INSERT INTO notices (title, content, type, category, is_important, is_pinned, author)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, content, type, category, is_important, is_pinned, author]
    );

    successResponse(res, '공지사항이 등록되었습니다.', {
      notice: {
        id: result.insertId,
        title,
        type,
        category,
        is_important,
        is_pinned,
        author
      }
    });

  } catch (error) {
    console.error('공지사항 등록 에러:', error);
    errorResponse(
      res,
      '공지사항 등록 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/notices/:id
 * 공지사항 수정 (관리자)
 */
router.put('/:id', authenticateToken, requireAdmin, validateId, validateNotice, async (req, res) => {
  try {
    const noticeId = req.params.id;
    const {
      title,
      content,
      type,
      category = '기타',
      is_important = false,
      is_pinned = false
    } = req.body;

    // 공지사항 존재 확인
    const [notices] = await pool.execute(
      'SELECT id FROM notices WHERE id = ?',
      [noticeId]
    );

    if (notices.length === 0) {
      return errorResponse(
        res,
        '공지사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    await pool.execute(
      `UPDATE notices
       SET title = ?, content = ?, type = ?, category = ?,
           is_important = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title, content, type, category, is_important, is_pinned, noticeId]
    );

    successResponse(res, '공지사항이 수정되었습니다.', {
      notice: {
        id: noticeId,
        title,
        type,
        category,
        is_important,
        is_pinned
      }
    });

  } catch (error) {
    console.error('공지사항 수정 에러:', error);
    errorResponse(
      res,
      '공지사항 수정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * DELETE /api/notices/:id
 * 공지사항 삭제 (관리자)
 */
router.delete('/:id', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const noticeId = req.params.id;

    // 공지사항 존재 확인
    const [notices] = await pool.execute(
      'SELECT id, title FROM notices WHERE id = ?',
      [noticeId]
    );

    if (notices.length === 0) {
      return errorResponse(
        res,
        '공지사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    await pool.execute('DELETE FROM notices WHERE id = ?', [noticeId]);

    successResponse(res, '공지사항이 삭제되었습니다.', {
      deleted_notice: {
        id: noticeId,
        title: notices[0].title
      }
    });

  } catch (error) {
    console.error('공지사항 삭제 에러:', error);
    errorResponse(
      res,
      '공지사항 삭제 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/notices/:id/pin
 * 공지사항 고정/해제 (관리자)
 */
router.put('/:id/pin', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const noticeId = req.params.id;
    const { is_pinned } = req.body;

    if (typeof is_pinned !== 'boolean') {
      return errorResponse(
        res,
        '고정 여부는 true 또는 false여야 합니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 공지사항 존재 확인
    const [notices] = await pool.execute(
      'SELECT id, title FROM notices WHERE id = ?',
      [noticeId]
    );

    if (notices.length === 0) {
      return errorResponse(
        res,
        '공지사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    await pool.execute(
      'UPDATE notices SET is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [is_pinned, noticeId]
    );

    successResponse(res, `공지사항이 ${is_pinned ? '고정' : '고정 해제'}되었습니다.`, {
      notice: {
        id: noticeId,
        title: notices[0].title,
        is_pinned
      }
    });

  } catch (error) {
    console.error('공지사항 고정 설정 에러:', error);
    errorResponse(
      res,
      '공지사항 고정 설정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;