const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination, safeJsonParse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION } = require('../utils/constants');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Multer 설정 (첨부 파일 업로드)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/consultant_applications');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'application-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 제한
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('이미지 또는 문서 파일만 업로드 가능합니다 (jpeg, jpg, png, gif, pdf, doc, docx)'));
    }
  }
});

/**
 * 관리자 권한 체크 미들웨어
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role_level < 10) {
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
 * 상담사 신청 유효성 검사
 */
const validateApplication = [
  body('name')
    .notEmpty()
    .withMessage('이름을 입력해주세요.')
    .isLength({ min: 2, max: 50 })
    .withMessage('이름은 2-50자 사이여야 합니다.'),

  body('phone')
    .notEmpty()
    .withMessage('연락처를 입력해주세요.')
    .matches(/^[0-9]{10,11}$/)
    .withMessage('올바른 연락처 형식이 아닙니다.'),

  body('email')
    .notEmpty()
    .withMessage('이메일을 입력해주세요.')
    .isEmail()
    .withMessage('올바른 이메일 형식이 아닙니다.'),

  body('consultation_field')
    .notEmpty()
    .withMessage('상담 분야를 선택해주세요.')
    .isIn(['타로', '신점'])
    .withMessage('상담 분야는 타로 또는 신점이어야 합니다.'),

  body('career_years')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('경력은 0-100년 사이여야 합니다.'),

  body('introduction')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('소개는 2000자 이하여야 합니다.'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(error => error.msg);
      return errorResponse(
        res,
        errorMessages.join(', '),
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    next();
  }
];

/**
 * POST /api/consultant-applications/apply
 * 상담사 신청 (multipart/form-data)
 */
router.post('/apply', authenticateToken, upload.single('profile_image'), async (req, res) => {
  try {
    // JWT에서 사용자 정보 추출
    const userLoginId = req.user.login_id;  // users.login_id (문자열)
    const userNickname = req.user.nickname;  // users.nickname (문자열)

    // 중복 신청 체크 (pending, reviewing 상태가 있는지 확인)
    const [existingApplications] = await pool.execute(
      `SELECT id, status FROM consultant_applications
       WHERE users_id = ? AND status IN ('pending', 'reviewing')
       ORDER BY created_at DESC
       LIMIT 1`,
      [userLoginId]
    );

    if (existingApplications.length > 0) {
      return errorResponse(
        res,
        '이미 신청 내역이 있습니다. 기존 신청이 처리된 후 다시 신청해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const {
      title,
      applicant_name,
      stage_name,
      consultation_field,
      region,
      introduction,
      phone,
      email,
      content,
      portfolio_url,
      users_id,  // 클라이언트에서 전송한 users_id (옵션)
      nickname   // 클라이언트에서 전송한 nickname (옵션)
    } = req.body;

    // 필수 필드 검증
    if (!title || !applicant_name || !consultation_field || !phone || !email) {
      return errorResponse(
        res,
        '필수 항목을 모두 입력해주세요. (제목, 이름, 상담분야, 연락처, 이메일)',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 프로필 이미지 처리 (multer로 업로드된 파일)
    const profile_image_path = req.file ? req.file.path : null;

    // users_id와 nickname은 JWT 값 우선, 없으면 클라이언트 값 사용
    const finalUsersId = users_id || userLoginId;
    const finalNickname = nickname || userNickname;

    // 상담사 신청 등록
    const [result] = await pool.execute(
      `INSERT INTO consultant_applications (
        users_id, nickname, title, applicant_name, stage_name, consultation_field,
        region, profile_image_path, introduction, phone, email,
        content, portfolio_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalUsersId,
        finalNickname,
        title,
        applicant_name,
        stage_name || null,
        consultation_field,
        region || null,
        profile_image_path || null,
        introduction || null,
        phone,
        email,
        content || null,
        portfolio_url || null
      ]
    );

    successResponse(res, '상담사 신청이 완료되었습니다. 검토 후 연락드리겠습니다.', {
      application: {
        id: result.insertId,
        status: 'pending',
        submitted_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('상담사 신청 에러:', error);
    errorResponse(
      res,
      '상담사 신청 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultant-applications/statistics
 * 상담사 신청 통계 조회 (인증 불필요)
 * 주의: /:id보다 먼저 정의해야 함!
 */
router.get('/statistics', async (req, res) => {
  try {
    const { start_date = null, end_date = null } = req.query;

    // 기간 설정
    let periodStart, periodEnd;

    if (start_date && end_date) {
      periodStart = start_date;
      periodEnd = end_date;
    } else {
      // 기본값: 현재 달 1일부터 말일까지
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      periodStart = `${year}-${String(month).padStart(2, '0')}-01`;

      // 말일 계산
      const lastDay = new Date(year, month, 0).getDate();
      periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }

    // 신청수 통계 (created_at 기준 - 이번 달에 신청한 건수)
    const [applicationStats] = await pool.execute(
      `SELECT
        COUNT(*) as total_applications,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'reviewing' THEN 1 ELSE 0 END) as under_review_count
       FROM consultant_applications
       WHERE DATE(created_at) BETWEEN ? AND ?`,
      [periodStart, periodEnd]
    );

    // 승인/거절 통계 (processed_at 기준 - 이번 달에 승인/거절된 건수)
    const [processedStats] = await pool.execute(
      `SELECT
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
       FROM consultant_applications
       WHERE DATE(processed_at) BETWEEN ? AND ?
         AND processed_at IS NOT NULL`,
      [periodStart, periodEnd]
    );

    // 상담 분야별 통계 (created_at 기준)
    const [fieldStats] = await pool.execute(
      `SELECT
        consultation_field,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
       FROM consultant_applications
       WHERE DATE(created_at) BETWEEN ? AND ?
       GROUP BY consultation_field`,
      [periodStart, periodEnd]
    );

    // 월별 신청 추이 (최근 6개월)
    const [monthlyStats] = await pool.execute(
      `SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
       FROM consultant_applications
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month DESC`,
      []
    );

    // 승인율 계산 (신청 건수 대비 승인 건수)
    const total = parseInt(applicationStats[0].total_applications) || 0;
    const approved = parseInt(processedStats[0].approved_count) || 0;
    const approvalRate = total > 0 ? ((approved / total) * 100).toFixed(2) : 0;

    // 평균 처리 시간 (이번 달에 처리된 신청 기준)
    const [avgProcessingTime] = await pool.execute(
      `SELECT
        AVG(TIMESTAMPDIFF(DAY, created_at, processed_at)) as avg_days
       FROM consultant_applications
       WHERE status IN ('approved', 'rejected')
         AND processed_at IS NOT NULL
         AND DATE(processed_at) BETWEEN ? AND ?`,
      [periodStart, periodEnd]
    );

    // 최근 신청 현황 (최근 7일)
    const [recentStats] = await pool.execute(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as count
       FROM consultant_applications
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      []
    );

    successResponse(res, '상담사 신청 통계 조회 완료', {
      period: {
        start: periodStart,
        end: periodEnd
      },
      total_statistics: {
        total_applications: parseInt(applicationStats[0].total_applications) || 0,
        pending: parseInt(applicationStats[0].pending_count) || 0,
        under_review: parseInt(applicationStats[0].under_review_count) || 0,
        approved: parseInt(processedStats[0].approved_count) || 0,
        rejected: parseInt(processedStats[0].rejected_count) || 0,
        approval_rate: parseFloat(approvalRate)
      },
      field_statistics: fieldStats.map(field => ({
        consultation_field: field.consultation_field,
        total_count: parseInt(field.count) || 0,
        approved_count: parseInt(field.approved_count) || 0,
        approval_rate: field.count > 0
          ? parseFloat(((field.approved_count / field.count) * 100).toFixed(2))
          : 0
      })),
      monthly_trend: monthlyStats.map(month => ({
        month: month.month,
        total_count: parseInt(month.total_count) || 0,
        approved_count: parseInt(month.approved_count) || 0,
        rejected_count: parseInt(month.rejected_count) || 0
      })),
      processing_time: {
        average_days: avgProcessingTime[0].avg_days
          ? parseFloat(avgProcessingTime[0].avg_days).toFixed(1)
          : null
      },
      recent_applications: recentStats.map(stat => ({
        date: stat.date,
        count: parseInt(stat.count) || 0
      }))
    });

  } catch (error) {
    console.error('신청 통계 조회 에러:', error);
    errorResponse(
      res,
      '신청 통계 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultant-applications/my-status
 * 내 상담사 신청 상태 조회 (JWT 토큰 기반)
 */
router.get('/my-status', authenticateToken, async (req, res) => {
  try {
    const userLoginId = req.user.login_id;  // users.login_id (문자열)

    // 디버깅 로그
    console.log('🔍 /my-status 호출 - users_id:', userLoginId, 'user:', req.user);

    // 현재 사용자의 가장 최근 신청 조회
    const [applications] = await pool.execute(
      `SELECT
        id, users_id, nickname, title, applicant_name, stage_name,
        consultation_field, region, profile_image_path,
        introduction, phone, email, content, portfolio_url,
        status, admin_note, processed_by, processed_at,
        created_at, updated_at
       FROM consultant_applications
       WHERE users_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [userLoginId]
    );

    console.log('📊 조회 결과:', applications.length, '건');

    if (applications.length === 0) {
      return successResponse(res, '신청 내역이 없습니다.', {
        has_application: false,
        application: null
      });
    }

    successResponse(res, '신청 상태 조회 완료', {
      has_application: true,
      application: applications[0]
    });

  } catch (error) {
    console.error('신청 상태 조회 에러:', error);
    errorResponse(
      res,
      '신청 상태 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultant-applications
 * 신청 목록 조회 (인증 불필요 - 공개 API)
 */
router.get('/', validatePagination, async (req, res) => {
  try {
    const {
      status = null,
      consultation_field = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    // WHERE 조건 구성
    let whereConditions = [];
    let queryParams = [];

    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    if (consultation_field) {
      whereConditions.push('consultation_field = ?');
      queryParams.push(consultation_field);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (page - 1) * limitNum;

    // 신청 목록 조회
    const [applications] = await pool.execute(
      `SELECT
        id, users_id, title, applicant_name, stage_name,
        consultation_field, region, profile_image_path,
        introduction, phone, email, content, portfolio_url,
        status, admin_note, processed_by, processed_at,
        created_at, updated_at
       FROM consultant_applications
       ${whereClause}
       ORDER BY
         CASE status
           WHEN 'pending' THEN 1
           WHEN 'reviewing' THEN 2
           WHEN 'approved' THEN 3
           WHEN 'rejected' THEN 4
         END,
         created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM consultant_applications ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    const pagination = createPagination(page, limitNum, total);

    successResponse(res, '신청 목록 조회 완료', {
      applications,
      count: applications.length,
      filters: {
        status,
        consultation_field,
        limit: limitNum
      }
    }, pagination);

  } catch (error) {
    console.error('신청 목록 조회 에러:', error);
    errorResponse(
      res,
      '신청 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/consultant-applications/:id
 * 신청 상세 조회
 */
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const userLoginId = req.user.login_id;
    const isAdmin = req.user.role_level >= 10;

    const [applications] = await pool.execute(
      `SELECT
        a.*,
        u.username, u.login_id, u.email as user_email,
        reviewer.username as reviewer_name
       FROM consultant_applications a
       LEFT JOIN users u ON a.users_id = u.login_id
       LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id
       WHERE a.id = ?`,
      [applicationId]
    );

    if (applications.length === 0) {
      return errorResponse(
        res,
        '신청 내역을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const application = applications[0];

    // 권한 확인 (본인 또는 관리자)
    if (!isAdmin && application.users_id !== userLoginId) {
      return errorResponse(
        res,
        '권한이 없습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // JSON 필드 파싱
    application.specialties = safeJsonParse(application.specialties, []);
    application.certifications = safeJsonParse(application.certifications, []);

    successResponse(res, '신청 상세 조회 완료', {
      application
    });

  } catch (error) {
    console.error('신청 상세 조회 에러:', error);
    errorResponse(
      res,
      '신청 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/consultant-applications/:id
 * 신청 정보 수정 (승인 전만 가능)
 */
router.put('/:id', authenticateToken, validateId, validateApplication, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const userLoginId = req.user.login_id;

    const {
      name,
      phone,
      email,
      consultation_field,
      career_years = 0,
      career_description = '',
      introduction = '',
      specialties = [],
      certifications = []
    } = req.body;

    // 신청 정보 확인
    const [applications] = await pool.execute(
      'SELECT id, users_id, status FROM consultant_applications WHERE id = ?',
      [applicationId]
    );

    if (applications.length === 0) {
      return errorResponse(
        res,
        '신청 내역을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const application = applications[0];

    // 권한 확인 (본인만)
    if (application.users_id !== userLoginId) {
      return errorResponse(
        res,
        '본인의 신청만 수정할 수 있습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 상태 확인 (승인되지 않은 경우만 수정 가능)
    if (application.status === 'approved') {
      return errorResponse(
        res,
        '이미 승인된 신청은 수정할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 신청 정보 수정
    await pool.execute(
      `UPDATE consultant_applications
       SET name = ?, phone = ?, email = ?, consultation_field = ?,
           career_years = ?, career_description = ?, introduction = ?,
           specialties = ?, certifications = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name,
        phone,
        email,
        consultation_field,
        career_years,
        career_description,
        introduction,
        JSON.stringify(specialties),
        JSON.stringify(certifications),
        applicationId
      ]
    );

    successResponse(res, '신청 정보가 수정되었습니다.', {
      application_id: applicationId
    });

  } catch (error) {
    console.error('신청 정보 수정 에러:', error);
    errorResponse(
      res,
      '신청 정보 수정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/consultant-applications/:id/status
 * 신청 상태 변경 (관리자 전용)
 */
router.put('/:id/status', authenticateToken, requireAdmin, validateId, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const adminId = req.user.id;
    const { status, rejection_reason = '', admin_notes = '' } = req.body;

    // 상태 검증
    const validStatuses = ['pending', 'under_review', 'approved', 'rejected'];
    if (!status || !validStatuses.includes(status)) {
      return errorResponse(
        res,
        `상태는 ${validStatuses.join(', ')} 중 하나여야 합니다.`,
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // rejection_reason 검증 (거절 시 필수)
    if (status === 'rejected' && !rejection_reason) {
      return errorResponse(
        res,
        '거절 사유를 입력해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 신청 정보 확인
    const [applications] = await pool.execute(
      'SELECT id, users_id, status, name, email FROM consultant_applications WHERE id = ?',
      [applicationId]
    );

    if (applications.length === 0) {
      return errorResponse(
        res,
        '신청 내역을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const application = applications[0];

    // 상태 변경
    await pool.execute(
      `UPDATE consultant_applications
       SET status = ?, rejection_reason = ?, admin_notes = ?,
           reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [status, rejection_reason, admin_notes, adminId, applicationId]
    );

    // 승인 시 consultants 테이블에 추가
    if (status === 'approved') {
      // 사용자 정보 조회 (users_id는 이미 login_id 문자열)
      const [users] = await pool.execute(
        'SELECT login_id FROM users WHERE login_id = ?',
        [application.users_id]
      );

      if (users.length > 0) {
        // consultant_number 생성 (최대값 + 1)
        const [maxConsultantNumber] = await pool.execute(
          'SELECT MAX(CAST(consultant_number AS UNSIGNED)) as max_num FROM consultants'
        );
        const nextNumber = (maxConsultantNumber[0].max_num || 0) + 1;
        const consultantNumber = String(nextNumber).padStart(3, '0');

        // consultants 테이블에 추가
        await pool.execute(
          `INSERT INTO consultants (
            user_id, consultant_number, name, phone, email,
            consultation_field, career, introduction, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
          [
            users[0].login_id,
            consultantNumber,
            application.name,
            application.phone || '',
            application.email || '',
            application.consultation_field || '타로',
            application.career_description || '',
            application.introduction || ''
          ]
        );
      }
    }

    successResponse(res, `신청이 ${status === 'approved' ? '승인' : status === 'rejected' ? '거절' : '처리'}되었습니다.`, {
      application_id: applicationId,
      status,
      reviewed_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('신청 상태 변경 에러:', error);
    errorResponse(
      res,
      '신청 상태 변경 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * DELETE /api/consultant-applications/:id
 * 신청 취소/삭제
 */
router.delete('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const userLoginId = req.user.login_id;
    const isAdmin = req.user.role_level >= 10;

    // 신청 정보 확인
    const [applications] = await pool.execute(
      'SELECT id, users_id, status FROM consultant_applications WHERE id = ?',
      [applicationId]
    );

    if (applications.length === 0) {
      return errorResponse(
        res,
        '신청 내역을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const application = applications[0];

    // 권한 확인 (본인 또는 관리자)
    if (!isAdmin && application.users_id !== userLoginId) {
      return errorResponse(
        res,
        '권한이 없습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    // 승인된 신청은 삭제 불가
    if (application.status === 'approved') {
      return errorResponse(
        res,
        '이미 승인된 신청은 삭제할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 신청 삭제
    await pool.execute(
      'DELETE FROM consultant_applications WHERE id = ?',
      [applicationId]
    );

    successResponse(res, '신청이 취소/삭제되었습니다.', {
      deleted_application_id: applicationId
    });

  } catch (error) {
    console.error('신청 취소/삭제 에러:', error);
    errorResponse(
      res,
      '신청 취소/삭제 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/consultant-applications/:id/upload
 * 첨부 파일 업로드
 */
router.post('/:id/upload', authenticateToken, validateId, upload.single('file'), async (req, res) => {
  try {
    const applicationId = req.params.id;
    const userLoginId = req.user.login_id;

    if (!req.file) {
      return errorResponse(
        res,
        '파일을 업로드해주세요.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 신청 정보 확인
    const [applications] = await pool.execute(
      'SELECT id, users_id, status FROM consultant_applications WHERE id = ?',
      [applicationId]
    );

    if (applications.length === 0) {
      // 업로드된 파일 삭제
      fs.unlinkSync(req.file.path);
      return errorResponse(
        res,
        '신청 내역을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const application = applications[0];

    // 권한 확인
    if (application.users_id !== userLoginId) {
      fs.unlinkSync(req.file.path);
      return errorResponse(
        res,
        '권한이 없습니다.',
        RESPONSE_CODES.FORBIDDEN,
        HTTP_STATUS.FORBIDDEN
      );
    }

    const fileUrl = `/uploads/consultant_applications/${req.file.filename}`;

    successResponse(res, '파일 업로드 완료', {
      url: fileUrl,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size
    });

  } catch (error) {
    console.error('파일 업로드 에러:', error);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('파일 삭제 실패:', unlinkError);
      }
    }
    errorResponse(
      res,
      '파일 업로드 중 오류가 발생했습니다.',
      RESPONSE_CODES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;
