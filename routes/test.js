const express = require('express');
const { pool } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/test/tables
 * 테이블 목록 조회
 */
router.get('/tables', async (req, res) => {
  try {
    const [tables] = await pool.execute('SHOW TABLES');
    
    successResponse(res, '테이블 목록 조회 완료', {
      tables: tables.map(table => Object.values(table)[0])
    });

  } catch (error) {
    console.error('테이블 목록 조회 에러:', error);
    errorResponse(
      res,
      '테이블 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/test/users-count
 * 사용자 수 조회
 */
router.get('/users-count', async (req, res) => {
  try {
    const [result] = await pool.execute('SELECT COUNT(*) as count FROM users');
    
    successResponse(res, '사용자 수 조회 완료', {
      count: result[0].count
    });

  } catch (error) {
    console.error('사용자 수 조회 에러:', error);
    errorResponse(
      res,
      '사용자 수 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/test/consultants-count
 * 상담사 수 조회
 */
router.get('/consultants-count', async (req, res) => {
  try {
    const [result] = await pool.execute('SELECT COUNT(*) as count FROM consultants');
    
    successResponse(res, '상담사 수 조회 완료', {
      count: result[0].count
    });

  } catch (error) {
    console.error('상담사 수 조회 에러:', error);
    errorResponse(
      res,
      '상담사 수 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;