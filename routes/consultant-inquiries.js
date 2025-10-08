const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION, USER_ROLES } = require('../utils/constants');

const router = express.Router();

// 상담사 문의 상태
const CONSULTANT_INQUIRY_STATUS = {
  PENDING: 'pending',
  ANSWERED: 'answered'
};

/**
 * POST /api/consultant-inquiries
 * 상담사에게 문의사항 등록 (일반 사용자가 상담사에게 문의)
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { consultant_id, content } = req.body;

    // 필수 필드 검증
    if (!consultant_id) {
      return errorResponse(
        res,
        '상담사 ID를 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (!content || content.trim().length === 0) {
      return errorResponse(
        res,
        '문의 내용을 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 내용 길이 검증 (30자 제한)
    if (content.length > 30) {
      return errorResponse(
        res,
        '문의 내용은 30자 이내로 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 상담사 존재 확인
    const [consultants] = await pool.execute(
      'SELECT consultant_number FROM consultants WHERE consultant_number = ?',
      [consultant_id]
    );

    if (consultants.length === 0) {
      return errorResponse(
        res,
        '해당 상담사를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 사용자 정보 조회 (nickname 포함)
    const [users] = await pool.execute(
      'SELECT username, nickname FROM users WHERE id = ?',
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
      `INSERT INTO consultant_inquiries (user_id, consultant_id, nickname, content, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        userId,
        consultant_id,
        user.nickname || user.username,  // nickname 우선, 없으면 username
        content,
        CONSULTANT_INQUIRY_STATUS.PENDING
      ]
    );

    const inquiryId = result.insertId;

    successResponse(res, '문의사항이 등록되었습니다.', {
      inquiry: {
        id: inquiryId,
        consultant_id: consultant_id,
        nickname: user.nickname || user.username,
        content: content,
        status: CONSULTANT_INQUIRY_STATUS.PENDING
      }
    }, {}, 201);

  } catch (error) {
    console.error('상담사 문의사항 등록 에러:', error);
    errorResponse(
      res,
      '문의사항 등록 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultant-inquiries
 * 내가 작성한 문의사항 목록 조회 (일반 사용자 본인)
 */
router.get('/', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // WHERE 조건 구성
    let whereConditions = ['ci.user_id = ?'];
    let queryParams = [userId];

    if (status) {
      whereConditions.push('ci.status = ?');
      queryParams.push(status);
    }

    const whereClause = whereConditions.join(' AND ');

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultant_inquiries ci WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // 문의사항 목록 조회 (상담사 정보 JOIN)
    const [inquiries] = await pool.execute(
      `SELECT ci.id, ci.consultant_id, ci.nickname, ci.content, ci.status,
       ci.reply_content, ci.replied_at, ci.created_at, ci.updated_at,
       c.name as consultant_nickname,
       c.stage_name as consultant_stagename
       FROM consultant_inquiries ci
       LEFT JOIN consultants c ON ci.consultant_id = c.consultant_number
       WHERE ${whereClause}
       ORDER BY ci.created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    const pagination = createPagination(pageNum, limitNum, total);

    successResponse(res, '상담사 문의사항 목록 조회 완료', {
      inquiries,
      filters: {
        status
      }
    }, pagination);

  } catch (error) {
    console.error('상담사 문의사항 목록 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultant-inquiries/all
 * 모든 상담사 문의사항 목록 조회 (관리자 전용)
 */
router.get('/all', authenticateToken, requireRole(['ADMIN']), validatePagination, async (req, res) => {
  try {
    const {
      status = null,
      consultant_id = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // WHERE 조건 구성
    let whereConditions = [];
    let queryParams = [];

    if (status) {
      whereConditions.push('ci.status = ?');
      queryParams.push(status);
    }

    if (consultant_id) {
      whereConditions.push('ci.consultant_id = ?');
      queryParams.push(consultant_id);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultant_inquiries ci ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // 문의사항 목록 조회 (상담사 정보 포함)
    const [inquiries] = await pool.execute(
      `SELECT ci.id, ci.user_id, ci.consultant_id, ci.nickname, ci.content,
       ci.status, ci.reply_content, ci.replied_at, ci.created_at, ci.updated_at,
       c.name as consultant_nickname,
       c.stage_name as consultant_stagename
       FROM consultant_inquiries ci
       LEFT JOIN consultants c ON ci.consultant_id = c.consultant_number
       ${whereClause}
       ORDER BY ci.created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    const pagination = createPagination(pageNum, limitNum, total);

    successResponse(res, '전체 상담사 문의사항 목록 조회 완료', {
      inquiries,
      filters: {
        status,
        consultant_id
      }
    }, pagination);

  } catch (error) {
    console.error('전체 상담사 문의사항 목록 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET/PUT /api/consultant-inquiries/by-consultant/:consultantId
 * 특정 상담사의 문의 목록 조회 (상담사 프로필 페이지용)
 * - 로그인한 사용자가 작성한 문의만 전체 공개
 * - 상담사 본인이 조회하는 경우 본인에게 온 문의 전체 공개
 * - 다른 사용자가 작성한 문의는 비밀글 처리
 *
 * GET과 PUT 메서드 모두 지원 (Flutter 앱 호환성)
 */
const getConsultantInquiriesHandler = async (req, res) => {
  try {
    const consultantId = parseInt(req.params.consultantId);
    const userId = req.user.id;
    const userRole = req.user.role;
    const {
      status = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    console.log('=== by-consultant 엔드포인트 디버깅 ===');
    console.log('consultantId (param):', req.params.consultantId);
    console.log('consultantId (parsed):', consultantId);
    console.log('userId:', userId);
    console.log('userRole:', userRole);

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // WHERE 조건 구성
    let whereConditions = ['ci.consultant_id = ?'];
    let queryParams = [consultantId];

    if (status) {
      whereConditions.push('ci.status = ?');
      queryParams.push(status);
    }

    const whereClause = whereConditions.join(' AND ');

    console.log('WHERE 절:', whereClause);
    console.log('Query Params:', queryParams);

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultant_inquiries ci WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    console.log('조회된 문의 개수:', total);

    // 문의사항 목록 조회 (상담사 정보 JOIN)
    const [inquiries] = await pool.execute(
      `SELECT ci.id, ci.user_id, ci.consultant_id, ci.nickname, ci.content,
       ci.status, ci.reply_content, ci.replied_at, ci.created_at, ci.updated_at,
       c.name as consultant_nickname,
       c.stage_name as consultant_stagename
       FROM consultant_inquiries ci
       LEFT JOIN consultants c ON ci.consultant_id = c.consultant_number
       WHERE ${whereClause}
       ORDER BY ci.created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    console.log('조회된 문의 목록:', inquiries.map(i => ({ id: i.id, consultant_id: i.consultant_id, nickname: i.nickname })));

    // 로그인한 사용자가 상담사인지 확인 (consultants.user_id는 users.login_id를 참조함!)
    let loggedInConsultantId = null;
    const userLoginId = req.user.login_id;  // JWT에서 login_id 가져오기

    console.log(`[상담사 조회] login_id: ${userLoginId}로 consultants 테이블 조회 중...`);
    const [consultantInfo] = await pool.execute(
      'SELECT id, user_id, stage_name FROM consultants WHERE user_id = ?',
      [userLoginId]  // users.id가 아닌 users.login_id로 조회!
    );
    console.log(`[상담사 조회 결과] 조회된 데이터:`, consultantInfo);

    if (consultantInfo.length > 0) {
      loggedInConsultantId = consultantInfo[0].id;
      console.log(`✅ 로그인한 사용자는 상담사입니다. consultant id: ${loggedInConsultantId}, stage_name: ${consultantInfo[0].stage_name}`);
    } else {
      console.log(`❌ 로그인한 사용자는 상담사가 아닙니다. (consultants 테이블에 user_id="${userLoginId}"가 없음)`);
    }

    console.log('=========================================');

    // 비밀글 처리: 관리자가 아니고, 본인이 작성하지 않았으며, 본인에게 온 문의가 아닌 경우 비밀글로 표시
    const processedInquiries = inquiries.map(inquiry => {
      const isAdmin = userRole === 'ADMIN';
      const isMyInquiry = inquiry.user_id === userId;  // 로그인한 사용자가 작성한 문의인지 확인
      const isMyConsultantInquiry = loggedInConsultantId && inquiry.consultant_id === loggedInConsultantId;  // 상담사 본인에게 온 문의인지 확인

      console.log(`[문의 ID: ${inquiry.id}] isAdmin: ${isAdmin}, isMyInquiry: ${isMyInquiry}, isMyConsultantInquiry: ${isMyConsultantInquiry}`);
      console.log(`  - loggedInConsultantId: ${loggedInConsultantId}, inquiry.consultant_id: ${inquiry.consultant_id}`);
      console.log(`  - userId: ${userId}, inquiry.user_id: ${inquiry.user_id}`);

      // 관리자, 본인이 작성한 문의, 또는 상담사 본인에게 온 문의인 경우 전체 공개
      if (isAdmin || isMyInquiry || isMyConsultantInquiry) {
        return {
          ...inquiry,
          is_private: false
        };
      }

      // 다른 사용자가 작성한 문의는 비밀글 처리
      return {
        id: inquiry.id,
        user_id: null,  // 숨김
        consultant_id: inquiry.consultant_id,
        nickname: inquiry.nickname,  // 작성자의 닉네임은 표시
        content: '비밀글입니다',  // 숨김
        status: inquiry.status,
        reply_content: inquiry.reply_content ? '비밀글입니다' : null,  // 답변이 있으면 비밀글 표시
        replied_at: inquiry.replied_at,
        created_at: inquiry.created_at,
        updated_at: inquiry.updated_at,
        consultant_nickname: inquiry.consultant_nickname,
        consultant_stagename: inquiry.consultant_stagename,
        is_private: true
      };
    });

    const pagination = createPagination(pageNum, limitNum, total);

    successResponse(res, '상담사 문의사항 목록 조회 완료', {
      inquiries: processedInquiries,
      consultant_id: consultantId,
      filters: {
        status
      }
    }, pagination);

  } catch (error) {
    console.error('상담사별 문의사항 목록 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

// GET과 PUT 메서드 모두 같은 핸들러 사용 (Flutter 앱 호환성)
router.get('/by-consultant/:consultantId', authenticateToken, validatePagination, getConsultantInquiriesHandler);
router.put('/by-consultant/:consultantId', authenticateToken, validatePagination, getConsultantInquiriesHandler);

/**
 * GET /api/consultant-inquiries/:id
 * 상담사 문의사항 상세보기
 */
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    const isConsultant = req.user.role === 'CONSULT';

    // 본인 문의사항 또는 관리자만 조회 가능
    let whereClause = 'ci.id = ?';
    let queryParams = [inquiryId];

    if (!isAdmin) {
      whereClause += ' AND ci.user_id = ?';
      queryParams.push(userId);
    }

    const [inquiries] = await pool.execute(
      `SELECT ci.id, ci.user_id, ci.consultant_id, ci.nickname, ci.content,
       ci.status, ci.reply_content, ci.replied_at, ci.created_at, ci.updated_at,
       c.stage_name as consultant_stage_name,
       u.email as consultant_email, u.phone as consultant_phone
       FROM consultant_inquiries ci
       LEFT JOIN consultants c ON ci.consultant_id = c.consultant_number
       LEFT JOIN users u ON ci.user_id = u.id
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

    successResponse(res, '상담사 문의사항 상세 조회 완료', {
      inquiry
    });

  } catch (error) {
    console.error('상담사 문의사항 상세 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/consultant-inquiries/:id
 * 문의사항 수정 (답변 전만 가능, 작성자 본인만)
 */
router.put('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;
    const { content } = req.body;

    // 필수 필드 검증
    if (!content || content.trim().length === 0) {
      return errorResponse(
        res,
        '문의 내용을 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 내용 길이 검증 (30자 제한)
    if (content.length > 30) {
      return errorResponse(
        res,
        '문의 내용은 30자 이내로 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 본인 문의사항인지 확인 및 답변 상태 확인
    const [inquiries] = await pool.execute(
      'SELECT id, user_id, status FROM consultant_inquiries WHERE id = ? AND user_id = ?',
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
    if (inquiry.status === CONSULTANT_INQUIRY_STATUS.ANSWERED) {
      return errorResponse(
        res,
        '답변이 완료된 문의사항은 수정할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 문의사항 수정
    await pool.execute(
      `UPDATE consultant_inquiries SET content = ?, updated_at = NOW()
       WHERE id = ?`,
      [content, inquiryId]
    );

    // 수정된 문의사항 조회
    const [updatedInquiries] = await pool.execute(
      `SELECT id, consultant_id, nickname, content, status, updated_at
       FROM consultant_inquiries WHERE id = ?`,
      [inquiryId]
    );

    successResponse(res, '문의사항이 수정되었습니다.', {
      inquiry: updatedInquiries[0]
    });

  } catch (error) {
    console.error('상담사 문의사항 수정 에러:', error);
    errorResponse(
      res,
      '문의사항 수정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * DELETE /api/consultant-inquiries/:id
 * 문의사항 삭제 (답변 전만 가능, 작성자 본인만)
 */
router.delete('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;

    // 본인 문의사항인지 확인 및 답변 상태 확인
    const [inquiries] = await pool.execute(
      'SELECT id, user_id, status FROM consultant_inquiries WHERE id = ? AND user_id = ?',
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
    if (inquiry.status !== CONSULTANT_INQUIRY_STATUS.PENDING) {
      return errorResponse(
        res,
        '답변이 완료된 문의사항은 삭제할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 문의사항 삭제
    await pool.execute(
      'DELETE FROM consultant_inquiries WHERE id = ?',
      [inquiryId]
    );

    successResponse(res, '문의사항이 삭제되었습니다.');

  } catch (error) {
    console.error('상담사 문의사항 삭제 에러:', error);
    errorResponse(
      res,
      '문의사항 삭제 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/consultant-inquiries/:id/reply
 * 상담사 문의사항 답변 등록 (관리자 전용)
 */
router.put('/:id/reply', authenticateToken, requireRole(['ADMIN']), validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const { reply_content } = req.body;

    // 필수 필드 검증
    if (!reply_content || reply_content.trim().length === 0) {
      return errorResponse(
        res,
        '답변 내용을 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 문의사항 존재 확인
    const [inquiries] = await pool.execute(
      'SELECT id, status FROM consultant_inquiries WHERE id = ?',
      [inquiryId]
    );

    if (inquiries.length === 0) {
      return errorResponse(
        res,
        '문의사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 답변 등록
    await pool.execute(
      `UPDATE consultant_inquiries
       SET reply_content = ?, status = ?, replied_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [reply_content, CONSULTANT_INQUIRY_STATUS.ANSWERED, inquiryId]
    );

    // 답변이 등록된 문의사항 조회
    const [updatedInquiries] = await pool.execute(
      `SELECT ci.id, ci.consultant_id, ci.nickname, ci.content, ci.status,
       ci.reply_content, ci.replied_at, ci.updated_at,
       c.stage_name as consultant_stage_name
       FROM consultant_inquiries ci
       LEFT JOIN consultants c ON ci.consultant_id = c.consultant_number
       WHERE ci.id = ?`,
      [inquiryId]
    );

    successResponse(res, '답변이 등록되었습니다.', {
      inquiry: updatedInquiries[0]
    });

  } catch (error) {
    console.error('상담사 문의사항 답변 등록 에러:', error);
    errorResponse(
      res,
      '답변 등록 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultant-inquiries/stats/summary
 * 내 문의사항 통계 (상태별 개수)
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [stats] = await pool.execute(
      `SELECT status, COUNT(*) as count
       FROM consultant_inquiries
       WHERE user_id = ?
       GROUP BY status`,
      [userId]
    );

    // 기본 상태별 개수 초기화
    const summary = {
      [CONSULTANT_INQUIRY_STATUS.PENDING]: 0,
      [CONSULTANT_INQUIRY_STATUS.ANSWERED]: 0,
      total: 0
    };

    // 통계 데이터 적용
    stats.forEach(stat => {
      summary[stat.status] = stat.count;
      summary.total += stat.count;
    });

    successResponse(res, '상담사 문의사항 통계 조회 완료', {
      summary
    });

  } catch (error) {
    console.error('상담사 문의사항 통계 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 통계 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;
