const express = require('express');
const { pool } = require('../config/database');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, safeJsonParse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');

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

/**
 * GET /api/consultants/events
 * 상담사 전용 이벤트 목록 조회
 */
router.get('/events', optionalAuth, validatePagination, async (req, res) => {
  try {
    const {
      event_type = null,
      event_state = 'active',
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // WHERE 조건 구성
    let whereConditions = ['1=1'];
    let queryParams = [];

    if (event_state) {
      whereConditions.push('event_state = ?');
      queryParams.push(event_state);
    }

    if (event_type) {
      whereConditions.push('event_type = ?');
      queryParams.push(event_type);
    }

    // 진행중인 이벤트만 (종료일이 현재보다 미래)
    whereConditions.push('(end_date IS NULL OR end_date >= NOW())');

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 상담사 이벤트 목록 조회
    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src, image_mobile_src,
       start_date, end_date, event_type, event_state, event_count, event_index, update_At
       FROM consultants_event
       WHERE ${whereClause}
       ORDER BY event_index ASC, start_date DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultants_event WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '상담사 이벤트 목록 조회 완료', {
      events,
      count: events.length,
      filters: {
        event_type,
        event_state,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('상담사 이벤트 목록 조회 에러:', error);
    errorResponse(
      res,
      '상담사 이벤트 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/events/:id
 * 상담사 이벤트 상세 조회
 */
router.get('/events/:id', optionalAuth, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;

    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src, image_mobile_src,
       start_date, end_date, event_type, event_state, consultant_list,
       guest_list, event_count, event_index, update_At
       FROM consultants_event WHERE id = ?`,
      [eventId]
    );

    if (events.length === 0) {
      return errorResponse(
        res,
        '상담사 이벤트를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const event = events[0];

    // JSON 필드 파싱
    event.consultant_list = safeJsonParse(event.consultant_list, []);
    event.guest_list = safeJsonParse(event.guest_list, []);

    // 이벤트 상태 확인
    const now = new Date();
    const startDate = new Date(event.start_date);
    const endDate = event.end_date ? new Date(event.end_date) : null;

    let eventStatus = 'active';
    if (startDate > now) {
      eventStatus = 'upcoming';
    } else if (endDate && endDate < now) {
      eventStatus = 'ended';
    }

    event.current_status = eventStatus;

    // 참여 가능 여부 (상담사 로그인한 경우)
    let canParticipate = false;
    let isParticipating = false;

    if (req.user && eventStatus === 'active') {
      // 상담사 권한 확인
      if (req.user.role === 'CONSULTANT') {
        canParticipate = true;

        // 이미 참여 중인지 확인 (consultant_list에서)
        const consultantList = event.consultant_list || [];
        isParticipating = consultantList.some(consultant =>
          consultant.user_id === req.user.id || consultant.id === req.user.id
        );
      }
    }

    event.participation = {
      can_participate: canParticipate,
      is_participating: isParticipating,
      requires_consultant_role: true
    };

    successResponse(res, '상담사 이벤트 상세 조회 완료', {
      event
    });

  } catch (error) {
    console.error('상담사 이벤트 상세 조회 에러:', error);
    errorResponse(
      res,
      '상담사 이벤트 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultants/events/:id/join
 * 상담사 이벤트 참여
 */
router.post('/events/:id/join', authenticateToken, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // 상담사 권한 확인
    if (req.user.role !== 'CONSULTANT') {
      return errorResponse(
        res,
        '상담사만 참여할 수 있는 이벤트입니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 이벤트 정보 조회
    const [events] = await pool.execute(
      'SELECT id, event_title, consultant_list, end_date, event_state FROM consultants_event WHERE id = ?',
      [eventId]
    );

    if (events.length === 0) {
      return errorResponse(
        res,
        '상담사 이벤트를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const event = events[0];

    // 이벤트 상태 확인
    if (event.event_state !== 'active') {
      return errorResponse(
        res,
        '참여할 수 없는 이벤트입니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 이벤트 종료일 확인
    if (event.end_date && new Date(event.end_date) < new Date()) {
      return errorResponse(
        res,
        '종료된 이벤트입니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 현재 참여자 목록 파싱
    const consultantList = safeJsonParse(event.consultant_list, []);

    // 이미 참여 중인지 확인
    const isAlreadyParticipating = consultantList.some(consultant =>
      consultant.user_id === userId || consultant.id === userId
    );

    if (isAlreadyParticipating) {
      return errorResponse(
        res,
        '이미 참여중인 이벤트입니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 상담사 정보 조회
    const [consultants] = await pool.execute(
      'SELECT id, name, nickname, stage_name, grade, consultation_field FROM consultants WHERE user_id = ?',
      [userId]
    );

    if (consultants.length === 0) {
      return errorResponse(
        res,
        '상담사 정보를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultant = consultants[0];

    // 참여자 목록에 추가
    const newConsultant = {
      id: consultant.id,
      user_id: userId,
      name: consultant.name,
      nickname: consultant.nickname,
      stage_name: consultant.stage_name,
      grade: consultant.grade,
      consultation_field: consultant.consultation_field,
      joined_at: new Date().toISOString()
    };

    consultantList.push(newConsultant);

    // 이벤트 업데이트
    await pool.execute(
      'UPDATE consultants_event SET consultant_list = ?, event_count = event_count + 1 WHERE id = ?',
      [JSON.stringify(consultantList), eventId]
    );

    successResponse(res, '상담사 이벤트 참여가 완료되었습니다.', {
      event: {
        id: eventId,
        title: event.event_title
      },
      participant: newConsultant
    });

  } catch (error) {
    console.error('상담사 이벤트 참여 에러:', error);
    errorResponse(
      res,
      '상담사 이벤트 참여 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultants/events/:id/leave
 * 상담사 이벤트 참여 취소
 */
router.post('/events/:id/leave', authenticateToken, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // 상담사 권한 확인
    if (req.user.role !== 'CONSULTANT') {
      return errorResponse(
        res,
        '상담사만 접근할 수 있습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 이벤트 정보 조회
    const [events] = await pool.execute(
      'SELECT id, event_title, consultant_list FROM consultants_event WHERE id = ?',
      [eventId]
    );

    if (events.length === 0) {
      return errorResponse(
        res,
        '상담사 이벤트를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const event = events[0];

    // 현재 참여자 목록 파싱
    const consultantList = safeJsonParse(event.consultant_list, []);

    // 참여 중인지 확인
    const participantIndex = consultantList.findIndex(consultant =>
      consultant.user_id === userId || consultant.id === userId
    );

    if (participantIndex === -1) {
      return errorResponse(
        res,
        '참여하지 않은 이벤트입니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 참여자 목록에서 제거
    consultantList.splice(participantIndex, 1);

    // 이벤트 업데이트
    await pool.execute(
      'UPDATE consultants_event SET consultant_list = ?, event_count = GREATEST(event_count - 1, 0) WHERE id = ?',
      [JSON.stringify(consultantList), eventId]
    );

    successResponse(res, '상담사 이벤트 참여가 취소되었습니다.', {
      event: {
        id: eventId,
        title: event.event_title
      }
    });

  } catch (error) {
    console.error('상담사 이벤트 참여 취소 에러:', error);
    errorResponse(
      res,
      '상담사 이벤트 참여 취소 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/events/my/participations
 * 내가 참여한 상담사 이벤트 목록
 */
router.get('/events/my/participations', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // 상담사 권한 확인
    if (req.user.role !== 'CONSULTANT') {
      return errorResponse(
        res,
        '상담사만 접근할 수 있습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // JSON_CONTAINS 또는 JSON_SEARCH를 사용하여 참여한 이벤트 조회
    // MySQL 버전에 따라 다를 수 있으므로 LIKE로 대체
    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src,
       start_date, end_date, event_type, event_state, event_count,
       update_At
       FROM consultants_event
       WHERE consultant_list LIKE ?
       ORDER BY start_date DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      [`%"user_id":${userId}%`]
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM consultants_event WHERE consultant_list LIKE ?',
      [`%"user_id":${userId}%`]
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '내가 참여한 상담사 이벤트 목록 조회 완료', {
      events,
      count: events.length
    }, pagination);

  } catch (error) {
    console.error('참여 상담사 이벤트 조회 에러:', error);
    errorResponse(
      res,
      '참여 상담사 이벤트 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;