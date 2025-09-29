const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/debug/test-token/:userId
 * 테스트용 JWT 토큰 생성
 */
router.get('/test-token/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 사용자 ${userId}의 테스트 토큰 생성...`);

    // 사용자 정보 조회
    const [users] = await pool.execute(
      'SELECT id, login_id, username, email, role FROM users WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return errorResponse(res, '사용자를 찾을 수 없습니다.', RESPONSE_CODES.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const user = users[0];

    // JWT 토큰 생성
    const token = jwt.sign(
      {
        id: user.id,
        login_id: user.login_id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    console.log(`✅ 사용자 ${userId} 토큰 생성 완료:`, token.substring(0, 50) + '...');

    successResponse(res, `사용자 ${userId} 테스트 토큰 생성 완료`, {
      user: user,
      token: token,
      tokenLength: token.length
    });

  } catch (error) {
    console.error(`❌ 사용자 ${req.params.userId} 토큰 생성 에러:`, error);
    errorResponse(
      res,
      `토큰 생성 실패: ${error.message}`,
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/debug/tables
 * 테이블 목록 확인
 */
router.get('/tables', async (req, res) => {
  try {
    console.log('🔍 테이블 목록 조회 시작...');

    const [tables] = await pool.execute('SHOW TABLES');
    console.log('✅ 테이블 목록:', tables);

    successResponse(res, '테이블 목록 조회 성공', {
      tables: tables
    });

  } catch (error) {
    console.error('❌ 테이블 목록 조회 에러:', error);
    errorResponse(
      res,
      `테이블 목록 조회 실패: ${error.message}`,
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/debug/inquiries-table
 * inquiries 테이블 구조 확인
 */
router.get('/inquiries-table', async (req, res) => {
  try {
    console.log('🔍 inquiries 테이블 구조 확인...');

    const [structure] = await pool.execute('DESCRIBE inquiries');
    console.log('✅ inquiries 테이블 구조:', structure);

    const [sample] = await pool.execute('SELECT COUNT(*) as count FROM inquiries');
    console.log('✅ inquiries 레코드 수:', sample);

    successResponse(res, 'inquiries 테이블 확인 성공', {
      structure: structure,
      recordCount: sample[0].count
    });

  } catch (error) {
    console.error('❌ inquiries 테이블 확인 에러:', error);
    errorResponse(
      res,
      `inquiries 테이블 확인 실패: ${error.message}`,
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/debug/inquiries-test/:userId
 * 특정 사용자 문의사항 조회 테스트
 */
router.get('/inquiries-test/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log(`🔍 사용자 ${userId}의 문의사항 조회 테스트...`);

    // 실제 GET /api/inquiries와 동일한 쿼리 테스트
    const [inquiries] = await pool.execute(
      `SELECT id, inquiries_type, inquiries_title, inquiries_state,
       is_private, attachment_image, attachment_voice, notification_enabled,
       created_at, updated_at, inquiries_answer_at
       FROM inquiries
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    console.log(`✅ 사용자 ${userId} 문의사항:`, inquiries);

    successResponse(res, `사용자 ${userId} 문의사항 조회 성공`, {
      inquiries: inquiries,
      count: inquiries.length
    });

  } catch (error) {
    console.error(`❌ 사용자 ${req.params.userId} 문의사항 조회 에러:`, error);
    errorResponse(
      res,
      `문의사항 조회 실패: ${error.message}`,
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/debug/inquiries-sample
 * 문의사항 샘플 데이터 확인
 */
router.get('/inquiries-sample', async (req, res) => {
  try {
    console.log('🔍 문의사항 샘플 데이터 확인...');

    // 첫 5개 문의사항 조회
    const [sample] = await pool.execute(
      `SELECT id, user_id, username, inquiries_type, inquiries_title,
       inquiries_state, created_at
       FROM inquiries
       ORDER BY created_at DESC
       LIMIT 5`
    );

    console.log('✅ 샘플 문의사항:', sample);

    // user_id별 개수 확인
    const [userCounts] = await pool.execute(
      `SELECT user_id, COUNT(*) as count
       FROM inquiries
       GROUP BY user_id
       ORDER BY count DESC`
    );

    console.log('✅ user_id별 문의사항 개수:', userCounts);

    successResponse(res, '문의사항 샘플 데이터 조회 성공', {
      sample: sample,
      userCounts: userCounts
    });

  } catch (error) {
    console.error('❌ 문의사항 샘플 데이터 조회 에러:', error);
    errorResponse(
      res,
      `샘플 데이터 조회 실패: ${error.message}`,
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;