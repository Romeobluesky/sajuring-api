const express = require('express');
const { pool } = require('../config/database');
const { optionalAuth, authenticateToken } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/header-banners
 * 헤더 배너 목록 조회 (활성화된 배너만)
 */
router.get('/', optionalAuth, validatePagination, async (req, res) => {
  try {
    const {
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

    // 활성 기간 확인 (현재 날짜가 시작일과 종료일 사이, 또는 기간 무제한)
    whereConditions.push('(start_date IS NULL OR start_date <= CURDATE())');
    whereConditions.push('(end_date IS NULL OR end_date >= CURDATE() OR is_unlimited_period = 1)');

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 헤더 배너 목록 조회
    const [banners] = await pool.execute(
      `SELECT id, title, status, link_url, start_date, end_date, click_count,
       header_text, background_color, background_opacity, text_color, font_size,
       font_weight, has_button, button_text, button_background_color,
       button_text_color, is_unlimited_period, created_at, updated_at
       FROM header_banners
       WHERE ${whereClause}
       ORDER BY id DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM header_banners WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '헤더 배너 목록 조회 완료', {
      banners,
      count: banners.length,
      filters: {
        status,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('헤더 배너 목록 조회 에러:', error);
    errorResponse(
      res,
      '헤더 배너 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/header-banners/active
 * 현재 활성화된 헤더 배너 조회 (클라이언트용)
 */
router.get('/active', optionalAuth, async (req, res) => {
  try {
    // 현재 활성화된 배너 조회
    const [banners] = await pool.execute(
      `SELECT id, title, link_url, header_text, background_color,
       background_opacity, text_color, font_size, font_weight,
       has_button, button_text, button_background_color, button_text_color
       FROM header_banners
       WHERE status = 'active'
       AND (start_date IS NULL OR start_date <= CURDATE())
       AND (end_date IS NULL OR end_date >= CURDATE() OR is_unlimited_period = 1)
       ORDER BY id DESC
       LIMIT 1`
    );

    const banner = banners.length > 0 ? banners[0] : null;

    successResponse(res, '활성 헤더 배너 조회 완료', {
      banner,
      has_active_banner: banner !== null
    });

  } catch (error) {
    console.error('활성 헤더 배너 조회 에러:', error);
    errorResponse(
      res,
      '활성 헤더 배너 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/header-banners/:id
 * 헤더 배너 상세 조회
 */
router.get('/:id', optionalAuth, validateId, async (req, res) => {
  try {
    const bannerId = req.params.id;

    const [banners] = await pool.execute(
      `SELECT id, title, status, link_url, start_date, end_date, click_count,
       header_text, background_color, background_opacity, text_color, font_size,
       font_weight, has_button, button_text, button_background_color,
       button_text_color, is_unlimited_period, created_at, updated_at
       FROM header_banners WHERE id = ?`,
      [bannerId]
    );

    if (banners.length === 0) {
      return errorResponse(
        res,
        '헤더 배너를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const banner = banners[0];

    // 배너 상태 확인
    const now = new Date();
    const startDate = banner.start_date ? new Date(banner.start_date) : null;
    const endDate = banner.end_date ? new Date(banner.end_date) : null;

    let bannerStatus = 'active';
    if (startDate && startDate > now) {
      bannerStatus = 'upcoming';
    } else if (!banner.is_unlimited_period && endDate && endDate < now) {
      bannerStatus = 'expired';
    }

    banner.current_status = bannerStatus;
    banner.is_currently_active = (banner.status === 'active' && bannerStatus === 'active');

    successResponse(res, '헤더 배너 상세 조회 완료', {
      banner
    });

  } catch (error) {
    console.error('헤더 배너 상세 조회 에러:', error);
    errorResponse(
      res,
      '헤더 배너 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/header-banners/:id/click
 * 헤더 배너 클릭 수 증가
 */
router.post('/:id/click', optionalAuth, validateId, async (req, res) => {
  try {
    const bannerId = req.params.id;

    // 배너 존재 확인
    const [banners] = await pool.execute(
      'SELECT id, title, link_url, status FROM header_banners WHERE id = ?',
      [bannerId]
    );

    if (banners.length === 0) {
      return errorResponse(
        res,
        '헤더 배너를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const banner = banners[0];

    // 활성 상태인지 확인
    if (banner.status !== 'active') {
      return errorResponse(
        res,
        '비활성화된 배너입니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 클릭 수 증가
    await pool.execute(
      'UPDATE header_banners SET click_count = click_count + 1 WHERE id = ?',
      [bannerId]
    );

    // 업데이트된 클릭 수 조회
    const [updatedBanners] = await pool.execute(
      'SELECT click_count FROM header_banners WHERE id = ?',
      [bannerId]
    );

    successResponse(res, '헤더 배너 클릭 처리 완료', {
      banner: {
        id: bannerId,
        title: banner.title,
        link_url: banner.link_url,
        click_count: updatedBanners[0].click_count
      }
    });

  } catch (error) {
    console.error('헤더 배너 클릭 처리 에러:', error);
    errorResponse(
      res,
      '헤더 배너 클릭 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;