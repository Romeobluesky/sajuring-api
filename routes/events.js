const express = require('express');
const { pool } = require('../config/database');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination, safeJsonParse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/events/users
 * 사용자 이벤트 목록 조회 (users_event 테이블)
 */
router.get('/users', async (req, res) => {
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
    whereConditions.push('(end_date IS NULL OR end_date >= CURDATE())');

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 사용자 이벤트 목록 조회 (users_event 테이블)
    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src, image_mobile_src,
       start_date, end_date, event_type, event_state, consultant_list,
       guest_list, event_count, event_index, update_At
       FROM users_event
       WHERE ${whereClause}
       ORDER BY start_date DESC, id DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM users_event WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // JSON 필드 파싱
    const processedEvents = events.map(event => {
      event.consultant_list = safeJsonParse(event.consultant_list, []);
      event.guest_list = safeJsonParse(event.guest_list, []);
      event.consultant_count = event.consultant_list.length;
      event.participant_count = event.guest_list.length;

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

      return event;
    });

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '사용자 이벤트 목록 조회 완료', {
      events: processedEvents,
      count: processedEvents.length,
      filters: {
        event_type,
        event_state,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('사용자 이벤트 목록 조회 에러:', error);
    errorResponse(
      res,
      '사용자 이벤트 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/events
 * 진행중인 이벤트 목록 조회 (더 이상 사용하지 않음)
 */
router.get('/', async (req, res) => {
  return errorResponse(
    res,
    'event 테이블은 더 이상 사용되지 않습니다. /api/users/users-event를 사용해주세요.',
    RESPONSE_CODES.NOT_FOUND,
    HTTP_STATUS.NOT_FOUND
  );
});

/**
 * GET /api/events/:id
 * 이벤트 상세 조회
 */
router.get('/:id', optionalAuth, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;

    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src, image_mobile_src,
       start_date, end_date, event_type, event_state, consultant_list,
       guest_list, event_count, event_index, update_At
       FROM users_event WHERE id = ?`,
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

    // 참여 가능 여부 (로그인한 사용자인 경우)
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
 * POST /api/events/:id/join
 * 이벤트 참여
 */
router.post('/:id/join', authenticateToken, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // 이벤트 정보 조회
    const [events] = await pool.execute(
      'SELECT id, event_title, guest_list, end_date, event_state FROM users_event WHERE id = ?',
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
    const guesList = safeJsonParse(event.guest_list, []);

    // 이미 참여 중인지 확인
    const isAlreadyParticipating = guesList.some(guest => 
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
      user_id: user.id,
      username: user.username,
      nickname: user.nickname,
      joined_at: new Date().toISOString()
    };

    guesList.push(newGuest);

    // 이벤트 업데이트
    await pool.execute(
      'UPDATE users_event SET guest_list = ?, event_count = event_count + 1 WHERE id = ?',
      [JSON.stringify(guesList), eventId]
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
 * POST /api/events/:id/leave
 * 이벤트 참여 취소
 */
router.post('/:id/leave', authenticateToken, validateId, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    // 이벤트 정보 조회
    const [events] = await pool.execute(
      'SELECT id, event_title, guest_list FROM users_event WHERE id = ?',
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
    const guesList = safeJsonParse(event.guest_list, []);

    // 참여 중인지 확인
    const participantIndex = guesList.findIndex(guest => 
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
    guesList.splice(participantIndex, 1);

    // 이벤트 업데이트
    await pool.execute(
      'UPDATE users_event SET guest_list = ?, event_count = GREATEST(event_count - 1, 0) WHERE id = ?',
      [JSON.stringify(guesList), eventId]
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
 * GET /api/events/my/participations
 * 내가 참여한 이벤트 목록
 */
router.get('/my/participations', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const offset = (page - 1) * limit;

    // JSON_CONTAINS 또는 JSON_SEARCH를 사용하여 참여한 이벤트 조회
    // MySQL 버전에 따라 다를 수 있으므로 LIKE로 대체
    const [events] = await pool.execute(
      `SELECT id, event_title, event_context, image_web_src,
       start_date, end_date, event_type, event_state, event_count,
       update_At
       FROM users_event
       WHERE guest_list LIKE ?
       ORDER BY start_date DESC
       LIMIT ${parseInt(limit)}`,
      [`%"user_id":${userId}%`]
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM users_event WHERE guest_list LIKE ?',
      [`%"user_id":${userId}%`]
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limit, total);

    successResponse(res, '내가 참여한 이벤트 목록 조회 완료', {
      events
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

module.exports = router;