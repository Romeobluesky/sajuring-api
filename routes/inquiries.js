const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireSelfOrAdmin } = require('../middleware/roleCheck');
const { validateInquiry, validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION, INQUIRY_STATUS } = require('../utils/constants');

const router = express.Router();

/**
 * POST /api/inquiries
 * 문의사항 등록
 */
router.post('/', authenticateToken, validateInquiry, async (req, res) => {
  try {
    const userId = req.user.id;
    const { inquiries_type, inquiries_title, inquiries_content, is_private = false } = req.body;

    // 사용자 정보 조회 (이름, 전화번호, 이메일)
    const [users] = await pool.execute(
      'SELECT username, phone, email FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return errorResponse(
        res,
        '사용자 정보를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const user = users[0];

    // 문의사항 등록
    const [result] = await pool.execute(
      `INSERT INTO inquiries (user_id, username, phone, email, inquiries_type, 
       inquiries_title, inquiries_content, inquiries_state, is_private, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        userId,
        user.username,
        user.phone,
        user.email,
        inquiries_type,
        inquiries_title,
        inquiries_content,
        INQUIRY_STATUS.PENDING,
        is_private ? 1 : 0
      ]
    );

    const inquiryId = result.insertId;

    successResponse(res, '문의사항이 등록되었습니다.', {
      inquiry: {
        id: inquiryId,
        inquiries_type,
        inquiries_title,
        inquiries_content,
        inquiries_state: INQUIRY_STATUS.PENDING,
        is_private
      }
    });

  } catch (error) {
    console.error('문의사항 등록 에러:', error);
    errorResponse(
      res,
      '문의사항 등록 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/inquiries
 * 내 문의사항 목록 조회
 */
router.get('/', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status = null,
      type = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const offset = (page - 1) * limit;

    // WHERE 조건 구성
    let whereConditions = ['user_id = ?'];
    let queryParams = [userId];

    if (status) {
      whereConditions.push('inquiries_state = ?');
      queryParams.push(status);
    }

    if (type) {
      whereConditions.push('inquiries_type = ?');
      queryParams.push(type);
    }

    const whereClause = whereConditions.join(' AND ');

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM inquiries WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // 문의사항 목록 조회
    const [inquiries] = await pool.execute(
      `SELECT id, inquiries_type, inquiries_title, inquiries_state, 
       is_private, created_at, updated_at,
       inquiries_answer_at
       FROM inquiries 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    const pagination = createPagination(page, limit, total);

    successResponse(res, '내 문의사항 목록 조회 완료', {
      inquiries,
      filters: {
        status,
        type
      }
    }, pagination);

  } catch (error) {
    console.error('문의사항 목록 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/inquiries/:id
 * 문의사항 상세보기
 */
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    // 본인 문의사항 또는 관리자만 조회 가능
    let whereClause = 'id = ?';
    let queryParams = [inquiryId];

    if (!isAdmin) {
      whereClause += ' AND user_id = ?';
      queryParams.push(userId);
    }

    const [inquiries] = await pool.execute(
      `SELECT id, user_id, username, phone, email, inquiries_type, 
       inquiries_title, inquiries_content, inquiries_answer, 
       inquiries_answer_by, inquiries_answer_at, inquiries_state, 
       is_private, created_at, updated_at
       FROM inquiries 
       WHERE ${whereClause}`,
      queryParams
    );

    if (inquiries.length === 0) {
      return errorResponse(
        res,
        '문의사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const inquiry = inquiries[0];

    // 비공개 문의사항은 본인 또는 관리자만 조회 가능
    if (inquiry.is_private && !isAdmin && inquiry.user_id !== userId) {
      return errorResponse(
        res,
        '비공개 문의사항은 본인만 조회할 수 있습니다.',
        RESPONSE_CODES.AUTHORIZATION_ERROR,
        HTTP_STATUS.FORBIDDEN
      );
    }

    successResponse(res, '문의사항 상세 조회 완료', {
      inquiry
    });

  } catch (error) {
    console.error('문의사항 상세 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/inquiries/:id
 * 문의사항 수정 (답변 전만 가능)
 */
router.put('/:id', authenticateToken, validateId, validateInquiry, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;
    const { inquiries_type, inquiries_title, inquiries_content, is_private } = req.body;

    // 본인 문의사항인지 확인 및 답변 상태 확인
    const [inquiries] = await pool.execute(
      'SELECT id, user_id, inquiries_state FROM inquiries WHERE id = ? AND user_id = ?',
      [inquiryId, userId]
    );

    if (inquiries.length === 0) {
      return errorResponse(
        res,
        '문의사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const inquiry = inquiries[0];

    // 답변이 완료된 문의사항은 수정 불가
    if (inquiry.inquiries_state === INQUIRY_STATUS.ANSWERED) {
      return errorResponse(
        res,
        '답변이 완료된 문의사항은 수정할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 문의사항 수정
    await pool.execute(
      `UPDATE inquiries SET 
       inquiries_type = ?, inquiries_title = ?, inquiries_content = ?, 
       is_private = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        inquiries_type,
        inquiries_title,
        inquiries_content,
        is_private ? 1 : 0,
        inquiryId
      ]
    );

    // 수정된 문의사항 조회
    const [updatedInquiries] = await pool.execute(
      `SELECT id, inquiries_type, inquiries_title, inquiries_content, 
       inquiries_state, is_private, updated_at
       FROM inquiries WHERE id = ?`,
      [inquiryId]
    );

    successResponse(res, '문의사항이 수정되었습니다.', {
      inquiry: updatedInquiries[0]
    });

  } catch (error) {
    console.error('문의사항 수정 에러:', error);
    errorResponse(
      res,
      '문의사항 수정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * DELETE /api/inquiries/:id
 * 문의사항 삭제 (답변 전만 가능)
 */
router.delete('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;

    // 본인 문의사항인지 확인 및 답변 상태 확인
    const [inquiries] = await pool.execute(
      'SELECT id, user_id, inquiries_state FROM inquiries WHERE id = ? AND user_id = ?',
      [inquiryId, userId]
    );

    if (inquiries.length === 0) {
      return errorResponse(
        res,
        '문의사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const inquiry = inquiries[0];

    // 답변이 완료된 문의사항은 삭제 불가
    if (inquiry.inquiries_state !== INQUIRY_STATUS.PENDING) {
      return errorResponse(
        res,
        '답변이 진행중이거나 완료된 문의사항은 삭제할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 문의사항 삭제
    await pool.execute(
      'DELETE FROM inquiries WHERE id = ?',
      [inquiryId]
    );

    successResponse(res, '문의사항이 삭제되었습니다.');

  } catch (error) {
    console.error('문의사항 삭제 에러:', error);
    errorResponse(
      res,
      '문의사항 삭제 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/inquiries/stats/summary
 * 내 문의사항 통계 (상태별 개수)
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [stats] = await pool.execute(
      `SELECT 
       inquiries_state,
       COUNT(*) as count
       FROM inquiries 
       WHERE user_id = ?
       GROUP BY inquiries_state`,
      [userId]
    );

    // 기본 상태별 개수 초기화
    const summary = {
      [INQUIRY_STATUS.PENDING]: 0,
      [INQUIRY_STATUS.ANSWERED]: 0,
      [INQUIRY_STATUS.CLOSED]: 0,
      total: 0
    };

    // 통계 데이터 적용
    stats.forEach(stat => {
      summary[stat.inquiries_state] = stat.count;
      summary.total += stat.count;
    });

    successResponse(res, '문의사항 통계 조회 완료', {
      summary
    });

  } catch (error) {
    console.error('문의사항 통계 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 통계 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;