const express = require('express');
const { pool } = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const { validateId } = require('../middleware/validation');
const { successResponse, errorResponse, safeJsonParse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/consultants
 * 상담사 목록 조회 (필터링 지원)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      field = null,
      consultation_field = null,
      grade = null,
      consultant_grade = null,
      search = null,
      sort = 'consultation_rate',
      order = 'desc',
      limit = 20
    } = req.query;

    // WHERE 조건 구성
    let whereConditions = ['1=1'];
    let queryParams = [];

    // consultation_field 또는 field 파라미터 둘 다 지원
    const fieldValue = consultation_field || field;
    if (fieldValue) {
      whereConditions.push('consultation_field = ?');
      queryParams.push(fieldValue);
    }

    if (grade) {
      whereConditions.push('grade = ?');
      queryParams.push(grade);
    }

    if (consultant_grade) {
      whereConditions.push('consultant_grade = ?');
      queryParams.push(consultant_grade);
    }

    if (search) {
      whereConditions.push('(name LIKE ? OR nickname LIKE ? OR stage_name LIKE ? OR introduction LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // ORDER BY 조건 (안전한 정렬)
    const allowedSortFields = ['consultation_rate', 'consultation_fee', 'created_at', 'name'];
    const allowedOrders = ['asc', 'desc'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'consultation_rate';
    const sortOrder = allowedOrders.includes(order) ? order : 'desc';

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100); // 최대 100개 제한

    // 상담사 목록 조회
    const [consultants] = await pool.execute(
      `SELECT id, consultant_number, name, nickname, stage_name, phone, email,
       profile_image, intro_images, introduction, career, grade, consultant_grade,
       consultation_field, consultation_fee, rings, consultation_rate,
       event_selected, ring_expert, shorts_connected, created_at, updated_at
       FROM consultants 
       WHERE ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       LIMIT ${limitNum}`,
      queryParams
    );

    // intro_images JSON 파싱
    const consultantsWithParsedImages = consultants.map(consultant => ({
      ...consultant,
      intro_images: safeJsonParse(consultant.intro_images, [])
    }));

    successResponse(res, '상담사 목록 조회 완료', {
      consultants: consultantsWithParsedImages,
      count: consultants.length,
      filters: {
        field: fieldValue,
        consultation_field: fieldValue,
        grade,
        consultant_grade,
        search,
        sort: sortField,
        order: sortOrder,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('상담사 목록 조회 에러:', error);
    errorResponse(
      res,
      '상담사 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/popular
 * 인기 상담사 조회 (consultation_rate 높은 순)
 */
router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const {
      field = null,
      consultation_field = null,
      limit = 10
    } = req.query;

    let whereConditions = ['consultation_rate > 0'];
    let queryParams = [];

    // consultation_field 또는 field 파라미터 둘 다 지원
    const fieldValue = consultation_field || field;
    if (fieldValue) {
      whereConditions.push('consultation_field = ?');
      queryParams.push(fieldValue);
    }

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 10, 50);

    const [consultants] = await pool.execute(
      `SELECT id, consultant_number, name, nickname, stage_name,
       profile_image, introduction, grade, consultant_grade,
       consultation_field, consultation_fee, consultation_rate,
       event_selected, ring_expert, shorts_connected
       FROM consultants 
       WHERE ${whereClause}
       ORDER BY consultation_rate DESC, consultation_fee ASC
       LIMIT ${limitNum}`,
      queryParams
    );

    successResponse(res, '인기 상담사 목록 조회 완료', {
      consultants,
      count: consultants.length
    });

  } catch (error) {
    console.error('인기 상담사 조회 에러:', error);
    errorResponse(
      res,
      '인기 상담사 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/events
 * 이벤트 선정 상담사 조회 (event_selected = 1)
 */
router.get('/events', optionalAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 20, 50);

    const [consultants] = await pool.execute(
      `SELECT id, consultant_number, name, nickname, stage_name,
       profile_image, introduction, grade, consultant_grade,
       consultation_field, consultation_fee, consultation_rate,
       event_selected, ring_expert, shorts_connected
       FROM consultants 
       WHERE event_selected = 1
       ORDER BY consultation_rate DESC
       LIMIT ${limitNum}`
    );

    successResponse(res, '이벤트 선정 상담사 목록 조회 완료', {
      consultants,
      count: consultants.length
    });

  } catch (error) {
    console.error('이벤트 상담사 조회 에러:', error);
    errorResponse(
      res,
      '이벤트 상담사 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/:id
 * 상담사 상세 정보 조회
 */
router.get('/:id', optionalAuth, validateId, async (req, res) => {
  try {
    const consultantId = req.params.id;

    const [consultants] = await pool.execute(
      `SELECT c.*, u.username, u.email, u.status as user_status
       FROM consultants c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = ?`,
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

    // intro_images JSON 파싱
    consultant.intro_images = safeJsonParse(consultant.intro_images, []);

    // 민감한 정보 제거 (이메일, 전화번호는 관리자나 본인만)
    const isOwner = req.user && req.user.id === consultant.user_id;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      delete consultant.email;
      delete consultant.phone;
      delete consultant.user_id;
      delete consultant.username;
    }

    successResponse(res, '상담사 정보 조회 완료', {
      consultant
    });

  } catch (error) {
    console.error('상담사 상세 조회 에러:', error);
    errorResponse(
      res,
      '상담사 정보 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/field/:field
 * 전문분야별 상담사 조회
 */
router.get('/field/:field', optionalAuth, async (req, res) => {
  try {
    const { field } = req.params;
    const {
      grade = null,
      sort = 'consultation_rate',
      order = 'desc',
      limit = 20
    } = req.query;

    // 유효한 분야 확인
    const validFields = ['타로', '신점'];
    if (!validFields.includes(field)) {
      return errorResponse(
        res,
        '유효하지 않은 전문분야입니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    let whereConditions = ['consultation_field = ?'];
    let queryParams = [field];

    if (grade) {
      whereConditions.push('grade = ?');
      queryParams.push(grade);
    }

    const whereClause = whereConditions.join(' AND ');

    // 안전한 정렬
    const allowedSortFields = ['consultation_rate', 'consultation_fee', 'created_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'consultation_rate';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    // 상담사 목록 조회
    const [consultants] = await pool.execute(
      `SELECT id, consultant_number, name, nickname, stage_name,
       profile_image, introduction, grade, consultant_grade,
       consultation_field, consultation_fee, consultation_rate,
       event_selected, ring_expert, shorts_connected
       FROM consultants 
       WHERE ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       LIMIT ${limitNum}`,
      queryParams
    );

    successResponse(res, `${field} 전문 상담사 목록 조회 완료`, {
      field,
      consultants,
      count: consultants.length
    });

  } catch (error) {
    console.error('전문분야별 상담사 조회 에러:', error);
    errorResponse(
      res,
      '전문분야별 상담사 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;