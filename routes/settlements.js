const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');

const router = express.Router();

/**
 * 관리자 권한 체크 미들웨어
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN' && req.user.role_level < 8) {
    return errorResponse(
      res,
      '관리자 권한이 필요합니다.',
      RESPONSE_CODES.FORBIDDEN,
      HTTP_STATUS.FORBIDDEN
    );
  }
  next();
};

/**
 * 상담사 또는 관리자 권한 체크
 */
const requireConsultantOrAdmin = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN' || req.user.role_level >= 8;

    if (isAdmin) {
      return next();
    }

    // 상담사인지 확인
    const [consultants] = await pool.execute(
      'SELECT id FROM consultants WHERE user_id = ?',
      [req.user.id]
    );

    if (consultants.length === 0) {
      return errorResponse(
        res,
        '상담사 또는 관리자 권한이 필요합니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    req.consultant = consultants[0];
    next();
  } catch (error) {
    console.error('권한 확인 에러:', error);
    errorResponse(
      res,
      '권한 확인 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * GET /api/settlements/monthly/:month
 * 월별 정산 조회
 */
router.get('/monthly/:month', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const month = req.params.month; // YYYY-MM 형식

    // 월별 정산 스냅샷 조회
    const [snapshots] = await pool.execute(
      `SELECT * FROM monthly_settlement_snapshots
       WHERE settlement_month = ?
       ORDER BY consultant_id`,
      [month]
    );

    // 월별 정산 요약 조회
    const [summary] = await pool.execute(
      'SELECT * FROM monthly_settlement_summary WHERE settlement_month = ?',
      [month]
    );

    successResponse(res, '월별 정산 조회 완료', {
      month,
      summary: summary[0] || null,
      snapshots,
      count: snapshots.length
    });

  } catch (error) {
    console.error('월별 정산 조회 에러:', error);
    errorResponse(
      res,
      '월별 정산 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/settlements/consultant/:id/:month
 * 특정 상담사 월별 정산
 */
router.get('/consultant/:id/:month', authenticateToken, requireConsultantOrAdmin, async (req, res) => {
  try {
    const consultantId = req.params.id;
    const month = req.params.month; // YYYY-MM 형식
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role_level >= 8;

    // 권한 확인 (본인 정산만 조회 가능, 관리자는 모든 정산 조회 가능)
    if (!isAdmin) {
      const [consultants] = await pool.execute(
        'SELECT id FROM consultants WHERE id = ? AND user_id = ?',
        [consultantId, userId]
      );

      if (consultants.length === 0) {
        return errorResponse(
          res,
          '본인의 정산 내역만 조회할 수 있습니다.',
          RESPONSE_CODES.FORBIDDEN,
          HTTP_STATUS.FORBIDDEN
        );
      }
    }

    // 정산 스냅샷 조회
    const [snapshots] = await pool.execute(
      `SELECT * FROM monthly_settlement_snapshots
       WHERE consultant_id = ? AND settlement_month = ?`,
      [consultantId, month]
    );

    if (snapshots.length === 0) {
      return errorResponse(
        res,
        '해당 월의 정산 데이터를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const snapshot = snapshots[0];

    // 상세 상담 내역 파싱
    let consultationDetails = [];
    try {
      consultationDetails = JSON.parse(snapshot.consultation_details || '[]');
    } catch (e) {
      consultationDetails = [];
    }

    successResponse(res, '상담사 월별 정산 조회 완료', {
      consultant_id: consultantId,
      month,
      settlement: snapshot,
      consultation_details: consultationDetails
    });

  } catch (error) {
    console.error('상담사 월별 정산 조회 에러:', error);
    errorResponse(
      res,
      '상담사 월별 정산 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/settlements/calculate/:month
 * 월별 정산 계산 실행 (관리자)
 */
router.post('/calculate/:month', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const month = req.params.month; // YYYY-MM 형식

    // 해당 월의 모든 상담 데이터 조회
    const [consultations] = await pool.execute(
      `SELECT c.*, cons.consultant_number, cons.name as consultant_name,
       cons.stage_name, cons.consultant_grade
       FROM consultations c
       LEFT JOIN consultants cons ON c.consultant_id = cons.id
       WHERE DATE_FORMAT(c.consultation_date, '%Y-%m') = ? AND c.status = '완료'`,
      [month]
    );

    if (consultations.length === 0) {
      return errorResponse(
        res,
        '해당 월에 완료된 상담이 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 상담사별 정산 데이터 그룹화
    const consultantGroups = {};

    consultations.forEach(consultation => {
      const consultantId = consultation.consultant_id;
      if (!consultantGroups[consultantId]) {
        consultantGroups[consultantId] = {
          consultant_id: consultantId,
          consultant_number: consultation.consultant_number,
          consultant_name: consultation.consultant_name,
          consultant_stage_name: consultation.stage_name,
          consultant_grade: consultation.consultant_grade,
          consultations: [],
          total_count: 0,
          total_seconds: 0,
          total_minutes: 0,
          total_customer_payment: 0,
          total_settlement_amount: 0
        };
      }

      const group = consultantGroups[consultantId];
      group.consultations.push(consultation);
      group.total_count += 1;

      // duration_time (HH:mm:ss)를 초 단위로 변환 (정산은 30초 단위이므로 정확성 필요)
      let durationSeconds = 0;
      if (consultation.duration_time) {
        const timeParts = consultation.duration_time.split(':');
        if (timeParts.length === 3) {
          const hours = parseInt(timeParts[0]) || 0;
          const minutes = parseInt(timeParts[1]) || 0;
          const seconds = parseInt(timeParts[2]) || 0;
          durationSeconds = hours * 3600 + minutes * 60 + seconds;
        }
      } else if (consultation.duration_minutes) {
        // fallback: 기존 duration_minutes가 있으면 사용 (분을 초로 변환)
        durationSeconds = (consultation.duration_minutes || 0) * 60;
      }

      group.total_seconds += durationSeconds;
      group.total_minutes += Math.ceil(durationSeconds / 60); // 분은 참고용으로만
      group.total_customer_payment += consultation.amount || 0;

      // 임시 정산율 70% 적용
      group.total_settlement_amount += Math.floor((consultation.amount || 0) * 0.7);
    });

    // 기존 정산 데이터 삭제
    await pool.execute(
      'DELETE FROM monthly_settlement_snapshots WHERE settlement_month = ?',
      [month]
    );

    // 새로운 정산 스냅샷 생성
    for (const consultantId in consultantGroups) {
      const group = consultantGroups[consultantId];

      await pool.execute(
        `INSERT INTO monthly_settlement_snapshots (
          settlement_month, consultant_id, consultant_number, consultant_name,
          consultant_stage_name, consultant_grade_snapshot, total_consultation_count,
          total_consultation_seconds, total_consultation_minutes,
          total_customer_payment, total_settlement_amount, settlement_rate_percent,
          consultation_details, processed_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          month,
          group.consultant_id,
          group.consultant_number,
          group.consultant_name,
          group.consultant_stage_name,
          group.consultant_grade,
          group.total_count,
          group.total_seconds,
          group.total_minutes,
          group.total_customer_payment,
          group.total_settlement_amount,
          70, // 임시 정산율
          JSON.stringify(group.consultations),
          req.user.username || req.user.login_id
        ]
      );
    }

    // 월별 정산 요약 업데이트
    const totalConsultants = Object.keys(consultantGroups).length;
    const totalCount = Object.values(consultantGroups).reduce((sum, g) => sum + g.total_count, 0);
    const totalCustomerPayment = Object.values(consultantGroups).reduce((sum, g) => sum + g.total_customer_payment, 0);
    const totalSettlementAmount = Object.values(consultantGroups).reduce((sum, g) => sum + g.total_settlement_amount, 0);

    await pool.execute(
      `INSERT INTO monthly_settlement_summary (
        settlement_month, total_consultants, total_consultation_count,
        total_customer_payment, total_settlement_amount, total_platform_fee
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        total_consultants = VALUES(total_consultants),
        total_consultation_count = VALUES(total_consultation_count),
        total_customer_payment = VALUES(total_customer_payment),
        total_settlement_amount = VALUES(total_settlement_amount),
        total_platform_fee = VALUES(total_platform_fee)`,
      [
        month,
        totalConsultants,
        totalCount,
        totalCustomerPayment,
        totalSettlementAmount,
        totalCustomerPayment - totalSettlementAmount
      ]
    );

    successResponse(res, '월별 정산 계산이 완료되었습니다.', {
      month,
      summary: {
        total_consultants: totalConsultants,
        total_consultation_count: totalCount,
        total_customer_payment: totalCustomerPayment,
        total_settlement_amount: totalSettlementAmount
      }
    });

  } catch (error) {
    console.error('월별 정산 계산 에러:', error);
    errorResponse(
      res,
      '월별 정산 계산 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/settlements/history/:consultant_id
 * 상담사 정산 이력
 */
router.get('/history/:consultant_id', authenticateToken, requireConsultantOrAdmin, async (req, res) => {
  try {
    const consultantId = req.params.consultant_id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role_level >= 8;

    // 권한 확인
    if (!isAdmin) {
      const [consultants] = await pool.execute(
        'SELECT id FROM consultants WHERE id = ? AND user_id = ?',
        [consultantId, userId]
      );

      if (consultants.length === 0) {
        return errorResponse(
          res,
          '본인의 정산 이력만 조회할 수 있습니다.',
          RESPONSE_CODES.FORBIDDEN,
          HTTP_STATUS.FORBIDDEN
        );
      }
    }

    // 정산 이력 조회
    const [settlements] = await pool.execute(
      `SELECT settlement_month, total_consultation_count, total_consultation_minutes,
       total_customer_payment, total_settlement_amount, settlement_status,
       created_at, settlement_processed_at
       FROM monthly_settlement_snapshots
       WHERE consultant_id = ?
       ORDER BY settlement_month DESC`,
      [consultantId]
    );

    successResponse(res, '상담사 정산 이력 조회 완료', {
      consultant_id: consultantId,
      settlements,
      count: settlements.length
    });

  } catch (error) {
    console.error('상담사 정산 이력 조회 에러:', error);
    errorResponse(
      res,
      '상담사 정산 이력 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;