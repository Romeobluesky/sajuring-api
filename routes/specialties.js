const express = require('express');
const { pool } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/specialties
 * 전문분야 목록 조회
 */
router.get('/', async (req, res) => {
  try {
    const [specialties] = await pool.execute(
      'SELECT * FROM specialties WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    );

    successResponse(res, '전문분야 목록 조회 완료', {
      specialties,
      count: specialties.length
    });

  } catch (error) {
    console.error('전문분야 조회 에러:', error);
    errorResponse(
      res,
      '전문분야 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultation-styles
 * 상담스타일 목록 조회
 */
router.get('/consultation-styles', async (req, res) => {
  try {
    const [consultationStyles] = await pool.execute(
      'SELECT * FROM consultation_styles WHERE is_active = 1 ORDER BY display_order ASC, id ASC'
    );

    successResponse(res, '상담스타일 목록 조회 완료', {
      consultation_styles: consultationStyles,
      count: consultationStyles.length
    });

  } catch (error) {
    console.error('상담스타일 조회 에러:', error);
    errorResponse(
      res,
      '상담스타일 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;