const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, safeJsonParse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');

const router = express.Router();

// Multer 설정 (상담사 공지 이미지 업로드)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/consultant_notices');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'consultant-notice-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드 가능합니다 (jpeg, jpg, png, gif)'));
    }
  }
});

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
      whereConditions.push('(name LIKE ? OR nickname LIKE ? OR stage_name LIKE ? OR introduction LIKE ? OR one_line_introduction LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // ORDER BY 조건 (안전한 정렬)
    const allowedSortFields = ['consultation_rate', 'consultation_fee', 'created_at', 'name'];
    const allowedOrders = ['asc', 'desc'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'consultation_rate';
    const sortOrder = allowedOrders.includes(order) ? order : 'desc';

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100); // 최대 100개 제한

    // 상담사 목록 조회 (상담 횟수와 리뷰 횟수 포함)
    const [consultants] = await pool.execute(
      `SELECT c.id, c.user_id, c.consultant_number, c.name, c.nickname, c.stage_name, c.phone, c.email,
       c.profile_image, c.intro_images, c.introduction, c.one_line_introduction, c.career, c.grade, c.consultant_grade,
       c.consultation_field, c.consultation_fee, c.rings, c.consultation_rate, c.status,
       c.specialties, c.consultation_styles, c.event_selected, c.ring_expert, c.shorts_connected, c.created_at, c.updated_at,
       COALESCE(consultation_stats.consultation_count, 0) as consultation_count,
       COALESCE(review_stats.review_count, 0) as review_count
       FROM consultants c
       LEFT JOIN (
           SELECT
               consultant_id,
               COUNT(*) as consultation_count
           FROM consultations
           WHERE status = '완료'
           GROUP BY consultant_id
       ) consultation_stats ON c.consultant_number = consultation_stats.consultant_id
       LEFT JOIN (
           SELECT
               consultant_number,
               COUNT(*) as review_count
           FROM reviews
           GROUP BY consultant_number
       ) review_stats ON c.consultant_number = review_stats.consultant_number
       WHERE ${whereClause}
       ORDER BY ${sortField} ${sortOrder}
       LIMIT ${limitNum}`,
      queryParams
    );

    // JSON 필드 파싱
    const consultantsWithParsedFields = consultants.map(consultant => ({
      ...consultant,
      intro_images: safeJsonParse(consultant.intro_images, []),
      specialties: Array.isArray(consultant.specialties) ? consultant.specialties : safeJsonParse(consultant.specialties, []),
      consultation_styles: Array.isArray(consultant.consultation_styles) ? consultant.consultation_styles : safeJsonParse(consultant.consultation_styles, [])
    }));

    successResponse(res, '상담사 목록 조회 완료', {
      consultants: consultantsWithParsedFields,
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
      `SELECT c.id, c.user_id, c.consultant_number, c.name, c.nickname, c.stage_name,
       c.profile_image, c.introduction, c.one_line_introduction, c.grade, c.consultant_grade,
       c.consultation_field, c.consultation_fee, c.consultation_rate, c.status,
       c.specialties, c.consultation_styles, c.event_selected, c.ring_expert, c.shorts_connected,
       COALESCE(consultation_stats.consultation_count, 0) as consultation_count,
       COALESCE(review_stats.review_count, 0) as review_count
       FROM consultants c
       LEFT JOIN (
           SELECT
               consultant_id,
               COUNT(*) as consultation_count
           FROM consultations
           WHERE status = '완료'
           GROUP BY consultant_id
       ) consultation_stats ON c.consultant_number = consultation_stats.consultant_id
       LEFT JOIN (
           SELECT
               consultant_number,
               COUNT(*) as review_count
           FROM reviews
           GROUP BY consultant_number
       ) review_stats ON c.consultant_number = review_stats.consultant_number
       WHERE ${whereClause}
       ORDER BY c.consultation_rate DESC, c.consultation_fee ASC
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
      `SELECT c.id, c.user_id, c.consultant_number, c.name, c.nickname, c.stage_name,
       c.profile_image, c.introduction, c.one_line_introduction, c.grade, c.consultant_grade,
       c.consultation_field, c.consultation_fee, c.consultation_rate, c.status,
       c.specialties, c.consultation_styles, c.event_selected, c.ring_expert, c.shorts_connected,
       COALESCE(consultation_stats.consultation_count, 0) as consultation_count,
       COALESCE(review_stats.review_count, 0) as review_count
       FROM consultants c
       LEFT JOIN (
           SELECT
               consultant_id,
               COUNT(*) as consultation_count
           FROM consultations
           WHERE status = '완료'
           GROUP BY consultant_id
       ) consultation_stats ON c.consultant_number = consultation_stats.consultant_id
       LEFT JOIN (
           SELECT
               consultant_number,
               COUNT(*) as review_count
           FROM reviews
           GROUP BY consultant_number
       ) review_stats ON c.consultant_number = review_stats.consultant_number
       WHERE c.event_selected = 1
       ORDER BY c.consultation_rate DESC
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
 * GET /api/consultants/consultant-events
 * 메인 배너용 이벤트 목록 조회 (must be before /:id route)
 */
router.get('/consultant-events', optionalAuth, validatePagination, async (req, res) => {
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

    // 진행중인 이벤트만 (종료일이 오늘 날짜 이후 또는 오늘 날짜인 경우 포함)
    whereConditions.push('(end_date IS NULL OR DATE(end_date) >= CURDATE())');

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 메인 배너 이벤트 목록 조회 (consultant_list 포함)
    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src, image_mobile_src,
       start_date, end_date, event_type, event_state, consultant_list,
       event_count, event_index, update_At
       FROM consultants_event
       WHERE ${whereClause}
       ORDER BY event_index ASC, start_date DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // consultant_list JSON 파싱 및 추가 정보 설정
    events.forEach(event => {
      event.consultant_list = safeJsonParse(event.consultant_list, []);
      // 상담사 수 추가
      event.consultant_count = event.consultant_list.length;
    });

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultants_event WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '메인 배너 이벤트 목록 조회 완료', {
      events,
      count: events.length,
      filters: {
        event_type,
        event_state,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('메인 배너 이벤트 목록 조회 에러:', error);
    errorResponse(
      res,
      '메인 배너 이벤트 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/consultant-events/my/participations
 * 내가 참여한 이벤트 목록 (must be before /:id route)
 */
router.get('/consultant-events/my/participations', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // JSON_CONTAINS 또는 JSON_SEARCH를 사용하여 참여한 이벤트 조회
    // MySQL 버전에 따라 다를 수 있으므로 LIKE로 대체
    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src,
       start_date, end_date, event_type, event_state, event_count,
       update_At
       FROM consultants_event
       WHERE guest_list LIKE ?
       ORDER BY start_date DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      [`%"user_id":${userId}%`]
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM consultants_event WHERE guest_list LIKE ?',
      [`%"user_id":${userId}%`]
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '내가 참여한 이벤트 목록 조회 완료', {
      events,
      count: events.length
    }, pagination);

  } catch (error) {
    console.error('참여 이벤트 조회 에러:', error);
    errorResponse(
      res,
      '참여 이벤트 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/consultant-events/:id
 * 메인 배너 이벤트 상세 조회 (must be before /:id route)
 */
router.get('/consultant-events/:id', optionalAuth, validateId, async (req, res) => {
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
        '이벤트를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const event = events[0];

    // JSON 필드 파싱
    event.consultant_list = safeJsonParse(event.consultant_list, []);
    event.guest_list = safeJsonParse(event.guest_list, []);

    // consultant_list에 상담사 정보가 포함되어 있음을 명시
    // 구조: [{"id": "9", "name": "신연서", "nickname": "연화", "consultant_number": "008"}, ...]
    event.consultant_count = event.consultant_list.length;

    // consultant_list의 id로 consultants 테이블에서 상담사 상세 정보 조회
    let consultantDetails = [];
    if (event.consultant_list.length > 0) {
      const consultantIds = event.consultant_list.map(consultant => consultant.id);
      const placeholders = consultantIds.map(() => '?').join(',');

      const [consultants] = await pool.execute(
        `SELECT c.id, c.user_id, c.consultant_number, c.name, c.nickname, c.stage_name,
         c.profile_image, c.intro_images, c.introduction, c.one_line_introduction,
         c.career, c.grade, c.consultant_grade, c.consultation_field, c.consultation_fee,
         c.consultation_rate, c.status, c.specialties, c.consultation_styles,
         c.event_selected, c.ring_expert, c.shorts_connected,
         COALESCE(consultation_stats.consultation_count, 0) as consultation_count,
         COALESCE(review_stats.review_count, 0) as review_count
         FROM consultants c
         LEFT JOIN (
             SELECT
                 consultant_id,
                 COUNT(*) as consultation_count
             FROM consultations
             WHERE status = '완료'
             GROUP BY consultant_id
         ) consultation_stats ON c.consultant_number = consultation_stats.consultant_id
         LEFT JOIN (
             SELECT
                 consultant_number,
                 COUNT(*) as review_count
             FROM reviews
             GROUP BY consultant_number
         ) review_stats ON c.consultant_number = review_stats.consultant_number
         WHERE c.id IN (${placeholders})
         ORDER BY c.consultation_rate DESC, c.created_at DESC`,
        consultantIds
      );

      // JSON 필드 파싱
      consultants.forEach(consultant => {
        consultant.intro_images = safeJsonParse(consultant.intro_images, []);
        consultant.specialties = Array.isArray(consultant.specialties) ? consultant.specialties : safeJsonParse(consultant.specialties, []);
        consultant.consultation_styles = Array.isArray(consultant.consultation_styles) ? consultant.consultation_styles : safeJsonParse(consultant.consultation_styles, []);
      });

      consultantDetails = consultants;
    }

    // 이벤트에 상담사 상세 정보 추가
    event.consultant_details = consultantDetails;

    // 이벤트 상태 확인 (날짜만 비교, 시간 제외)
    const now = new Date();
    now.setHours(0, 0, 0, 0); // 오늘 날짜 00:00:00

    const startDate = new Date(event.start_date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = event.end_date ? new Date(event.end_date) : null;
    if (endDate) {
      endDate.setHours(0, 0, 0, 0);
    }

    let eventStatus = 'active';
    if (startDate > now) {
      eventStatus = 'upcoming';
    } else if (endDate && endDate < now) {
      eventStatus = 'ended';
    }

    event.current_status = eventStatus;

    // 참여 가능 여부 (사용자 로그인한 경우)
    let canParticipate = false;
    let isParticipating = false;

    if (req.user && eventStatus === 'active') {
      canParticipate = true;

      // 이미 참여 중인지 확인 (guest_list에서)
      const guestList = event.guest_list || [];
      isParticipating = guestList.some(guest =>
        guest.user_id === req.user.id || guest.id === req.user.id
      );
    }

    event.participation = {
      can_participate: canParticipate,
      is_participating: isParticipating
    };

    // 이벤트 조회수 증가
    await pool.execute(
      'UPDATE consultants_event SET event_count = event_count + 1 WHERE id = ?',
      [eventId]
    );

    successResponse(res, '이벤트 상세 조회 완료', {
      event
    });

  } catch (error) {
    console.error('이벤트 상세 조회 에러:', error);
    errorResponse(
      res,
      '이벤트 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultants/consultant-events/:id/join
 * 메인 배너 이벤트 참여 (must be before /:id route)
 */
router.post('/consultant-events/:id/join', authenticateToken, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // 이벤트 정보 조회
    const [events] = await pool.execute(
      'SELECT id, event_title, guest_list, end_date, event_state FROM consultants_event WHERE id = ?',
      [eventId]
    );

    if (events.length === 0) {
      return errorResponse(
        res,
        '이벤트를 찾을 수 없습니다.',
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

    // 이벤트 종료일 확인 (오늘 날짜까지 포함)
    if (event.end_date) {
      const endDate = new Date(event.end_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // 오늘 날짜의 00:00:00으로 설정
      endDate.setHours(0, 0, 0, 0); // 종료일의 00:00:00으로 설정

      if (endDate < today) {
        return errorResponse(
          res,
          '종료된 이벤트입니다.',
          RESPONSE_CODES.VALIDATION_ERROR,
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }

    // 현재 참여자 목록 파싱
    const guestList = safeJsonParse(event.guest_list, []);

    // 이미 참여 중인지 확인
    const isAlreadyParticipating = guestList.some(guest =>
      guest.user_id === userId || guest.id === userId
    );

    if (isAlreadyParticipating) {
      return errorResponse(
        res,
        '이미 참여중인 이벤트입니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 사용자 정보 조회
    const [users] = await pool.execute(
      'SELECT id, username, nickname FROM users WHERE id = ?',
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

    // 참여자 목록에 추가
    const newGuest = {
      id: user.id,
      user_id: userId,
      username: user.username,
      nickname: user.nickname,
      joined_at: new Date().toISOString()
    };

    guestList.push(newGuest);

    // 이벤트 업데이트
    await pool.execute(
      'UPDATE consultants_event SET guest_list = ? WHERE id = ?',
      [JSON.stringify(guestList), eventId]
    );

    successResponse(res, '이벤트 참여가 완료되었습니다.', {
      event: {
        id: eventId,
        title: event.event_title
      },
      participant: newGuest
    });

  } catch (error) {
    console.error('이벤트 참여 에러:', error);
    errorResponse(
      res,
      '이벤트 참여 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultants/consultant-events/:id/leave
 * 메인 배너 이벤트 참여 취소 (must be before /:id route)
 */
router.post('/consultant-events/:id/leave', authenticateToken, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // 이벤트 정보 조회
    const [events] = await pool.execute(
      'SELECT id, event_title, guest_list FROM consultants_event WHERE id = ?',
      [eventId]
    );

    if (events.length === 0) {
      return errorResponse(
        res,
        '이벤트를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const event = events[0];

    // 현재 참여자 목록 파싱
    const guestList = safeJsonParse(event.guest_list, []);

    // 참여 중인지 확인
    const participantIndex = guestList.findIndex(guest =>
      guest.user_id === userId || guest.id === userId
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
    guestList.splice(participantIndex, 1);

    // 이벤트 업데이트
    await pool.execute(
      'UPDATE consultants_event SET guest_list = ? WHERE id = ?',
      [JSON.stringify(guestList), eventId]
    );

    successResponse(res, '이벤트 참여가 취소되었습니다.', {
      event: {
        id: eventId,
        title: event.event_title
      }
    });

  } catch (error) {
    console.error('이벤트 참여 취소 에러:', error);
    errorResponse(
      res,
      '이벤트 참여 취소 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/consultants/:id/status
 * 상담사 상태 업데이트 (본인 또는 관리자만 가능)
 * - waiting: 대기중 (토글 ON)
 * - away: 부재중 (토글 OFF)
 * - consulting: 상담중 (통화 시스템에서 자동 설정)
 * - suspended: 정지 (관리자만 설정 가능)
 */
router.put('/:id/status', authenticateToken, validateId, async (req, res) => {
  try {
    const consultantId = req.params.id;
    const { status } = req.body;

    // 상태 검증
    const validStatuses = ['waiting', 'away', 'consulting', 'suspended'];
    if (!status || !validStatuses.includes(status)) {
      return errorResponse(
        res,
        '유효하지 않은 상태입니다. (waiting, away, consulting, suspended 중 선택)',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 상담사 존재 확인 및 권한 확인
    const [consultants] = await pool.execute(
      'SELECT id, user_id, status as current_status FROM consultants WHERE id = ?',
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

    // 본인 확인 (상담사 본인이거나 관리자만 수정 가능)
    // role_level: 8 = 상담사, 10 = 관리자
    // consultants.user_id는 users.login_id를 참조
    const isConsultantRole = req.user.role_level === 8;
    const isAdmin = req.user.role_level === 10;
    const isOwner = req.user.login_id === consultant.user_id;

    // 디버깅 로그
    console.log('=== 권한 체크 디버깅 ===');
    console.log('req.user.login_id:', req.user.login_id);
    console.log('req.user.role_level:', req.user.role_level);
    console.log('consultant.user_id:', consultant.user_id);
    console.log('isConsultantRole:', isConsultantRole);
    console.log('isOwner:', isOwner);
    console.log('isAdmin:', isAdmin);

    // 상담사(role_level=8) 본인이거나, 관리자(role_level=10)만 수정 가능
    if (!(isConsultantRole && isOwner) && !isAdmin) {
      return errorResponse(
        res,
        '권한이 없습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // suspended 상태는 관리자만 설정 가능
    if (status === 'suspended' && !isAdmin) {
      return errorResponse(
        res,
        '정지 상태는 관리자만 설정할 수 있습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 상태 업데이트
    await pool.execute(
      'UPDATE consultants SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, consultantId]
    );

    successResponse(res, '상담사 상태가 업데이트되었습니다.', {
      consultant_id: consultantId,
      previous_status: consultant.current_status,
      new_status: status
    });

  } catch (error) {
    console.error('상담사 상태 업데이트 에러:', error);
    errorResponse(
      res,
      '상담사 상태 업데이트 중 오류가 발생했습니다.',
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
      `SELECT c.*,
       COALESCE(consultation_stats.consultation_count, 0) as consultation_count,
       COALESCE(review_stats.review_count, 0) as review_count
       FROM consultants c
       LEFT JOIN (
           SELECT
               consultant_id,
               COUNT(*) as consultation_count
           FROM consultations
           WHERE status = '완료'
           GROUP BY consultant_id
       ) consultation_stats ON c.consultant_number = consultation_stats.consultant_id
       LEFT JOIN (
           SELECT
               consultant_number,
               COUNT(*) as review_count
           FROM reviews
           GROUP BY consultant_number
       ) review_stats ON c.consultant_number = review_stats.consultant_number
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

    // JSON 필드 파싱
    consultant.intro_images = safeJsonParse(consultant.intro_images, []);
    consultant.specialties = Array.isArray(consultant.specialties) ? consultant.specialties : safeJsonParse(consultant.specialties, []);
    consultant.consultation_styles = Array.isArray(consultant.consultation_styles) ? consultant.consultation_styles : safeJsonParse(consultant.consultation_styles, []);

    // 민감한 정보 제거 (이메일, 전화번호는 관리자나 본인만)
    const isOwner = req.user && req.user.id === consultant.user_id;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      delete consultant.email;
      delete consultant.phone;
      delete consultant.user_id;
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

    // 상담사 목록 조회 (상담 횟수와 리뷰 횟수 포함)
    const [consultants] = await pool.execute(
      `SELECT c.id, c.user_id, c.consultant_number, c.name, c.nickname, c.stage_name,
       c.profile_image, c.introduction, c.one_line_introduction, c.grade, c.consultant_grade,
       c.consultation_field, c.consultation_fee, c.consultation_rate, c.status,
       c.specialties, c.consultation_styles, c.event_selected, c.ring_expert, c.shorts_connected,
       COALESCE(consultation_stats.consultation_count, 0) as consultation_count,
       COALESCE(review_stats.review_count, 0) as review_count
       FROM consultants c
       LEFT JOIN (
           SELECT
               consultant_id,
               COUNT(*) as consultation_count
           FROM consultations
           WHERE status = '완료'
           GROUP BY consultant_id
       ) consultation_stats ON c.consultant_number = consultation_stats.consultant_id
       LEFT JOIN (
           SELECT
               consultant_number,
               COUNT(*) as review_count
           FROM reviews
           GROUP BY consultant_number
       ) review_stats ON c.consultant_number = review_stats.consultant_number
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
 * GET /api/consultants/search
 * 상담사 검색 및 필터
 */
router.get('/search', optionalAuth, validatePagination, async (req, res) => {
  try {
    const {
      keyword = null,
      consultation_field = null,
      consultant_grade = null,
      specialties = null,
      consultation_styles = null,
      min_rating = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // WHERE 조건 구성
    let whereConditions = ['c.status = "active"'];
    let queryParams = [];

    if (keyword) {
      whereConditions.push('(c.name LIKE ? OR c.stage_name LIKE ? OR c.introduction LIKE ? OR c.one_line_introduction LIKE ?)');
      const keywordPattern = `%${keyword}%`;
      queryParams.push(keywordPattern, keywordPattern, keywordPattern, keywordPattern);
    }

    if (consultation_field) {
      whereConditions.push('c.consultation_field = ?');
      queryParams.push(consultation_field);
    }

    if (consultant_grade) {
      whereConditions.push('c.consultant_grade = ?');
      queryParams.push(consultant_grade);
    }

    if (min_rating) {
      whereConditions.push('c.consultation_rate >= ?');
      queryParams.push(parseFloat(min_rating));
    }

    if (specialties) {
      const specialtyIds = specialties.split(',');
      const specialtyConditions = specialtyIds.map(() => 'JSON_CONTAINS(c.specialties, ?)').join(' OR ');
      whereConditions.push(`(${specialtyConditions})`);
      specialtyIds.forEach(id => queryParams.push(`"${id}"`));
    }

    if (consultation_styles) {
      const styleIds = consultation_styles.split(',');
      const styleConditions = styleIds.map(() => 'JSON_CONTAINS(c.consultation_styles, ?)').join(' OR ');
      whereConditions.push(`(${styleConditions})`);
      styleIds.forEach(id => queryParams.push(`"${id}"`));
    }

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 상담사 검색 (상담 횟수와 리뷰 횟수 포함)
    const [consultants] = await pool.execute(
      `SELECT c.*,
       COALESCE(consultation_stats.consultation_count, 0) as consultation_count,
       COALESCE(review_stats.review_count, 0) as review_count
       FROM consultants c
       LEFT JOIN (
           SELECT
               consultant_id,
               COUNT(*) as consultation_count
           FROM consultations
           WHERE status = '완료'
           GROUP BY consultant_id
       ) consultation_stats ON c.consultant_number = consultation_stats.consultant_id
       LEFT JOIN (
           SELECT
               consultant_number,
               COUNT(*) as review_count
           FROM reviews
           GROUP BY consultant_number
       ) review_stats ON c.consultant_number = review_stats.consultant_number
       WHERE ${whereClause}
       ORDER BY c.consultation_rate DESC, c.consultation_hours DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultants c WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '상담사 검색 완료', {
      consultants,
      count: consultants.length,
      search_filters: {
        keyword,
        consultation_field,
        consultant_grade,
        specialties,
        consultation_styles,
        min_rating,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('상담사 검색 에러:', error);
    errorResponse(
      res,
      '상담사 검색 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultants/:consultantId/notice
 * 상담사 공지 조회
 */
router.get('/:consultantId/notice', optionalAuth, validateId, async (req, res) => {
  try {
    const { consultantId } = req.params;

    // 상담사 존재 확인
    const [consultants] = await pool.execute(
      'SELECT id FROM consultants WHERE id = ?',
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

    // 공지 조회
    const [notices] = await pool.execute(
      `SELECT * FROM notices
       WHERE type = 'consultant_notice'
       AND consultant_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [consultantId]
    );

    if (notices.length === 0) {
      return errorResponse(
        res,
        '공지사항이 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const notice = notices[0];
    notice.images = safeJsonParse(notice.images, []);

    successResponse(res, '상담사 공지 조회 완료', {
      notice
    });

  } catch (error) {
    console.error('상담사 공지 조회 에러:', error);
    errorResponse(
      res,
      '상담사 공지 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultants/:consultantId/notice
 * 상담사 공지 저장/수정
 */
router.post('/:consultantId/notice', authenticateToken, validateId, async (req, res) => {
  try {
    const { consultantId } = req.params;
    const { content, images } = req.body;

    if (!content || content.trim() === '') {
      return errorResponse(
        res,
        '공지 내용을 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 상담사 존재 확인 및 권한 확인
    const [consultants] = await pool.execute(
      'SELECT id, user_id FROM consultants WHERE id = ?',
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

    // 본인 확인 (상담사 본인이거나 관리자만 수정 가능)
    if (req.user.id !== consultant.user_id && req.user.role !== 'ADMIN') {
      return errorResponse(
        res,
        '권한이 없습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    const imagesJson = images && images.length > 0 ? JSON.stringify(images) : null;

    // 기존 공지 확인
    const [existingNotices] = await pool.execute(
      `SELECT id FROM notices
       WHERE type = 'consultant_notice'
       AND consultant_id = ?`,
      [consultantId]
    );

    if (existingNotices.length > 0) {
      // UPDATE
      await pool.execute(
        `UPDATE notices
         SET content = ?, images = ?, updated_at = NOW()
         WHERE id = ?`,
        [content, imagesJson, existingNotices[0].id]
      );

      successResponse(res, '상담사 공지가 수정되었습니다.', {
        notice_id: existingNotices[0].id
      });
    } else {
      // INSERT
      const [result] = await pool.execute(
        `INSERT INTO notices (type, consultant_id, content, images, created_at, updated_at)
         VALUES ('consultant_notice', ?, ?, ?, NOW(), NOW())`,
        [consultantId, content, imagesJson]
      );

      successResponse(res, '상담사 공지가 저장되었습니다.', {
        notice_id: result.insertId
      });
    }

  } catch (error) {
    console.error('상담사 공지 저장 에러:', error);
    errorResponse(
      res,
      '상담사 공지 저장 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultants/:consultantId/notice/upload-image
 * 상담사 공지 이미지 업로드
 */
router.post('/:consultantId/notice/upload-image', authenticateToken, validateId, upload.single('image'), async (req, res) => {
  try {
    const { consultantId } = req.params;

    if (!req.file) {
      return errorResponse(
        res,
        '이미지 파일을 업로드해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 상담사 존재 확인 및 권한 확인
    const [consultants] = await pool.execute(
      'SELECT id, user_id FROM consultants WHERE id = ?',
      [consultantId]
    );

    if (consultants.length === 0) {
      // 업로드된 파일 삭제
      fs.unlinkSync(req.file.path);
      return errorResponse(
        res,
        '상담사를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultant = consultants[0];

    // 본인 확인
    if (req.user.id !== consultant.user_id && req.user.role !== 'ADMIN') {
      // 업로드된 파일 삭제
      fs.unlinkSync(req.file.path);
      return errorResponse(
        res,
        '권한이 없습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    const imageUrl = `/uploads/consultant_notices/${req.file.filename}`;

    successResponse(res, '이미지 업로드 완료', {
      url: imageUrl,
      filename: req.file.filename
    });

  } catch (error) {
    console.error('이미지 업로드 에러:', error);
    // 업로드된 파일이 있으면 삭제
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('파일 삭제 실패:', unlinkError);
      }
    }
    errorResponse(
      res,
      '이미지 업로드 중 오류가 발생했습니다.',
      RESPONSE_CODES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * DELETE /api/consultants/:consultantId/notice/delete-image
 * 상담사 공지 이미지 삭제
 */
router.delete('/:consultantId/notice/delete-image', authenticateToken, validateId, async (req, res) => {
  try {
    const { consultantId } = req.params;
    const { filename } = req.body;

    if (!filename) {
      return errorResponse(
        res,
        '파일명을 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 상담사 존재 확인 및 권한 확인
    const [consultants] = await pool.execute(
      'SELECT id, user_id FROM consultants WHERE id = ?',
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

    // 본인 확인
    if (req.user.id !== consultant.user_id && req.user.role !== 'ADMIN') {
      return errorResponse(
        res,
        '권한이 없습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 파일 경로 검증 (경로 조작 방지)
    const safeFilename = path.basename(filename);
    const filePath = path.join(__dirname, '../uploads/consultant_notices', safeFilename);

    // 파일 존재 확인 및 삭제
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      successResponse(res, '이미지가 삭제되었습니다.', {
        filename: safeFilename
      });
    } else {
      return errorResponse(
        res,
        '파일을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

  } catch (error) {
    console.error('이미지 삭제 에러:', error);
    errorResponse(
      res,
      '이미지 삭제 중 오류가 발생했습니다.',
      RESPONSE_CODES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});


module.exports = router;
