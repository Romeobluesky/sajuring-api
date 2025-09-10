const express = require('express');
const { pool } = require('../config/database');
const { optionalAuth } = require('../middleware/auth');
const { validateId } = require('../middleware/validation');
const { successResponse, errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, FAQ_STATUS } = require('../utils/constants');

const router = express.Router();

/**
 * GET /api/faq
 * FAQ 목록 조회 (faq_type 필터 지원)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      faq_type = null,
      search = null,
      limit = 50
    } = req.query;

    // WHERE 조건 구성
    let whereConditions = ['faq_state = ?'];
    let queryParams = [FAQ_STATUS.ACTIVE];

    if (faq_type) {
      whereConditions.push('faq_type = ?');
      queryParams.push(faq_type);
    }

    if (search) {
      whereConditions.push('(faq_title LIKE ? OR faq_answer LIKE ?)');
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, searchPattern);
    }

    const whereClause = whereConditions.join(' AND ');
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    // FAQ 목록 조회 (faq_index 순으로 정렬)
    const [faqs] = await pool.execute(
      `SELECT id, faq_index, faq_type, faq_title, faq_answer, faq_count, created_at, updated_at
       FROM faq 
       WHERE ${whereClause}
       ORDER BY faq_index ASC, created_at DESC
       LIMIT ${limitNum}`,
      queryParams
    );

    successResponse(res, 'FAQ 목록 조회 완료', {
      faqs,
      count: faqs.length,
      filters: {
        faq_type,
        search,
        limit: limitNum
      }
    });

  } catch (error) {
    console.error('FAQ 목록 조회 에러:', error);
    errorResponse(
      res,
      'FAQ 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/faq/types
 * FAQ 카테고리 목록 조회
 */
router.get('/types', optionalAuth, async (req, res) => {
  try {
    const [types] = await pool.execute(
      `SELECT DISTINCT faq_type, COUNT(*) as count
       FROM faq 
       WHERE faq_state = ?
       GROUP BY faq_type
       ORDER BY faq_type ASC`,
      [FAQ_STATUS.ACTIVE]
    );

    successResponse(res, 'FAQ 카테고리 목록 조회 완료', {
      types
    });

  } catch (error) {
    console.error('FAQ 카테고리 조회 에러:', error);
    errorResponse(
      res,
      'FAQ 카테고리 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/faq/:id
 * FAQ 상세보기 (조회수 증가)
 */
router.get('/:id', optionalAuth, validateId, async (req, res) => {
  try {
    const faqId = req.params.id;

    // 트랜잭션 시작
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // FAQ 정보 조회
      const [faqs] = await connection.execute(
        'SELECT id, faq_index, faq_type, faq_title, faq_answer, faq_count, created_at, updated_at FROM faq WHERE id = ? AND faq_state = ?',
        [faqId, FAQ_STATUS.ACTIVE]
      );

      if (faqs.length === 0) {
        await connection.rollback();
        return errorResponse(
          res,
          'FAQ를 찾을 수 없습니다.',
          RESPONSE_CODES.NOT_FOUND,
          HTTP_STATUS.NOT_FOUND
        );
      }

      // 조회수 증가
      await connection.execute(
        'UPDATE faq SET faq_count = faq_count + 1 WHERE id = ?',
        [faqId]
      );

      await connection.commit();

      const faq = faqs[0];
      faq.faq_count += 1; // 응답에 증가된 조회수 반영

      successResponse(res, 'FAQ 상세 조회 완료', {
        faq
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('FAQ 상세 조회 에러:', error);
    errorResponse(
      res,
      'FAQ 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/faq/popular
 * 인기 FAQ 조회 (조회수 높은 순)
 */
router.get('/popular', optionalAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 10, 50);

    const [faqs] = await pool.execute(
      `SELECT id, faq_type, faq_title, faq_count, created_at
       FROM faq 
       WHERE faq_state = ? AND faq_count > 0
       ORDER BY faq_count DESC, created_at DESC
       LIMIT ${limitNum}`,
      [FAQ_STATUS.ACTIVE]
    );

    successResponse(res, '인기 FAQ 목록 조회 완료', {
      faqs,
      count: faqs.length
    });

  } catch (error) {
    console.error('인기 FAQ 조회 에러:', error);
    errorResponse(
      res,
      '인기 FAQ 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;