const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { requireSelfOrAdmin } = require('../middleware/roleCheck');
const { validateInquiry, validateId, validatePagination } = require('../middleware/validation');
const { successResponse, errorResponse, createPagination } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, PAGINATION, INQUIRY_STATUS } = require('../utils/constants');

const router = express.Router();

// 업로드 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'public/uploads/inquiries/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// 파일 필터링
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedAudioTypes = ['.mp3', '.m4a', '.wav', '.aac', '.ogg'];
  const extension = path.extname(file.originalname).toLowerCase();

  console.log('파일 필터링 체크:');
  console.log('필드명:', file.fieldname);
  console.log('원본 파일명:', file.originalname);
  console.log('확장자:', extension);

  if (file.fieldname === 'attachment_image' && allowedImageTypes.includes(extension)) {
    console.log('✅ 이미지 파일 허용');
    cb(null, true);
  } else if (file.fieldname === 'attachment_voice' && allowedAudioTypes.includes(extension)) {
    console.log('✅ 음성 파일 허용');
    cb(null, true);
  } else {
    console.log('❌ 파일 거부 - 필드명:', file.fieldname, '확장자:', extension);
    cb(new Error(`지원하지 않는 파일입니다. 필드명: ${file.fieldname}, 확장자: ${extension}`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * Content-Type 감지 미들웨어
 */
const detectContentType = (req, res, next) => {
  const contentType = req.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    // multipart 요청인 경우 multer 적용
    upload.fields([
      { name: 'attachment_image', maxCount: 1 },
      { name: 'attachment_voice', maxCount: 1 }
    ])(req, res, (err) => {
      if (err) {
        console.error('Multer 에러:', err);
        return errorResponse(
          res,
          err.message.includes('형식') ? err.message : '파일 업로드 중 오류가 발생했습니다.',
          RESPONSE_CODES.VALIDATION_ERROR,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      // multipart 요청에서는 문자열로 전송되므로 파싱 필요
      if (req.body.sms_agree) {
        req.body.sms_agree = req.body.sms_agree === 'true';
      }
      if (req.body.notification_enabled) {
        req.body.notification_enabled = req.body.notification_enabled === 'true';
      }
      if (req.body.is_private) {
        req.body.is_private = req.body.is_private === 'true';
      }

      // 파일 경로 설정
      if (req.files && req.files.attachment_image) {
        req.body.attachment_image = `/uploads/inquiries/${req.files.attachment_image[0].filename}`;
      }
      if (req.files && req.files.attachment_voice) {
        req.body.attachment_voice = `/uploads/inquiries/${req.files.attachment_voice[0].filename}`;
      }

      console.log('Multipart 요청 파싱 결과:');
      console.log('Body:', req.body);
      console.log('Files:', req.files);

      next();
    });
  } else {
    // JSON 요청인 경우 그대로 진행
    next();
  }
};

/**
 * POST /api/inquiries
 * 문의사항 등록 (JSON 및 multipart/form-data 지원)
 */
router.post('/', authenticateToken, detectContentType, validateInquiry, async (req, res) => {
  try {
    const userId = req.user.id;
    // 클라이언트 친화적 필드명 지원
    const {
      // 기존 서버 필드명
      inquiries_type,
      inquiries_title,
      inquiries_content,
      is_private = false,
      // 클라이언트 친화적 필드명
      inquiry_type,
      title,
      content,
      sms_agree,
      // 공통 필드
      attachment_image = null,
      attachment_voice = null,
      notification_enabled = true
    } = req.body;

    // 필드명 매핑 (클라이언트 우선)
    const finalInquiryType = inquiry_type || inquiries_type;
    const finalTitle = title || inquiries_title;
    const finalContent = content || inquiries_content;
    const finalIsPrivate = sms_agree !== undefined ? !sms_agree : is_private;

    // 사용자 정보 조회 (이름, 전화번호, 이메일)
    const [users] = await pool.execute(
      'SELECT username, phone, email FROM users WHERE id = ?',
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

    // 문의사항 등록
    const [result] = await pool.execute(
      `INSERT INTO inquiries (user_id, username, phone, email, inquiries_type,
       inquiries_title, inquiries_content, inquiries_state, is_private,
       attachment_image, attachment_voice, notification_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        userId,
        user.username,
        user.phone,
        user.email,
        finalInquiryType,
        finalTitle,
        finalContent,
        INQUIRY_STATUS.PENDING,
        finalIsPrivate ? 1 : 0,
        attachment_image,
        attachment_voice,
        notification_enabled ? 1 : 0
      ]
    );

    const inquiryId = result.insertId;

    successResponse(res, '문의사항이 등록되었습니다.', {
      inquiry: {
        id: inquiryId,
        inquiry_type: finalInquiryType,
        title: finalTitle,
        content: finalContent,
        inquiries_state: INQUIRY_STATUS.PENDING,
        is_private: finalIsPrivate,
        sms_agree: !finalIsPrivate,
        attachment_image,
        attachment_voice,
        notification_enabled
      }
    }, {}, 201);

  } catch (error) {
    console.error('문의사항 등록 에러:', error);
    errorResponse(
      res,
      '문의사항 등록 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/inquiries
 * 내 문의사항 목록 조회
 */
router.get('/', authenticateToken, validatePagination, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status = null,
      type = null,
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // WHERE 조건 구성
    let whereConditions = ['user_id = ?'];
    let queryParams = [userId];

    if (status) {
      whereConditions.push('inquiries_state = ?');
      queryParams.push(status);
    }

    if (type) {
      whereConditions.push('inquiries_type = ?');
      queryParams.push(type);
    }

    const whereClause = whereConditions.join(' AND ');

    // 전체 개수 조회
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM inquiries WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // 문의사항 목록 조회
    const [inquiries] = await pool.execute(
      `SELECT id, inquiries_type, inquiries_title, inquiries_content,
       inquiries_answer, inquiries_state, is_private,
       attachment_image, attachment_voice, notification_enabled,
       created_at, updated_at, inquiries_answer_at
       FROM inquiries
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ${limitNum} OFFSET ${offset}`,
      queryParams
    );

    const pagination = createPagination(pageNum, limitNum, total);

    successResponse(res, '내 문의사항 목록 조회 완료', {
      inquiries,
      filters: {
        status,
        type
      }
    }, pagination);

  } catch (error) {
    console.error('문의사항 목록 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 목록 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/inquiries/:id
 * 문의사항 상세보기
 */
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN';

    // 본인 문의사항 또는 관리자만 조회 가능
    let whereClause = 'id = ?';
    let queryParams = [inquiryId];

    if (!isAdmin) {
      whereClause += ' AND user_id = ?';
      queryParams.push(userId);
    }

    const [inquiries] = await pool.execute(
      `SELECT id, user_id, username, phone, email, inquiries_type,
       inquiries_title, inquiries_content, inquiries_answer,
       inquiries_answer_by, inquiries_answer_at, inquiries_state,
       is_private, attachment_image, attachment_voice, notification_enabled,
       created_at, updated_at
       FROM inquiries
       WHERE ${whereClause}`,
      queryParams
    );

    if (inquiries.length === 0) {
      return errorResponse(
        res,
        '문의사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const inquiry = inquiries[0];

    // 비공개 문의사항은 본인 또는 관리자만 조회 가능
    if (inquiry.is_private && !isAdmin && inquiry.user_id !== userId) {
      return errorResponse(
        res,
        '비공개 문의사항은 본인만 조회할 수 있습니다.',
        RESPONSE_CODES.AUTHORIZATION_ERROR,
        HTTP_STATUS.FORBIDDEN
      );
    }

    successResponse(res, '문의사항 상세 조회 완료', {
      inquiry
    });

  } catch (error) {
    console.error('문의사항 상세 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 상세 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/inquiries/:id
 * 문의사항 수정 (답변 전만 가능)
 */
router.put('/:id', authenticateToken, validateId, validateInquiry, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;
    const {
      inquiries_type,
      inquiries_title,
      inquiries_content,
      is_private,
      attachment_image,
      attachment_voice,
      notification_enabled
    } = req.body;

    // 본인 문의사항인지 확인 및 답변 상태 확인
    const [inquiries] = await pool.execute(
      'SELECT id, user_id, inquiries_state FROM inquiries WHERE id = ? AND user_id = ?',
      [inquiryId, userId]
    );

    if (inquiries.length === 0) {
      return errorResponse(
        res,
        '문의사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const inquiry = inquiries[0];

    // 답변이 완료된 문의사항은 수정 불가
    if (inquiry.inquiries_state === INQUIRY_STATUS.ANSWERED) {
      return errorResponse(
        res,
        '답변이 완료된 문의사항은 수정할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 문의사항 수정
    await pool.execute(
      `UPDATE inquiries SET
       inquiries_type = ?, inquiries_title = ?, inquiries_content = ?,
       is_private = ?, attachment_image = ?, attachment_voice = ?,
       notification_enabled = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        inquiries_type,
        inquiries_title,
        inquiries_content,
        is_private ? 1 : 0,
        attachment_image,
        attachment_voice,
        notification_enabled ? 1 : 0,
        inquiryId
      ]
    );

    // 수정된 문의사항 조회
    const [updatedInquiries] = await pool.execute(
      `SELECT id, inquiries_type, inquiries_title, inquiries_content,
       inquiries_state, is_private, attachment_image, attachment_voice,
       notification_enabled, updated_at
       FROM inquiries WHERE id = ?`,
      [inquiryId]
    );

    successResponse(res, '문의사항이 수정되었습니다.', {
      inquiry: updatedInquiries[0]
    });

  } catch (error) {
    console.error('문의사항 수정 에러:', error);
    errorResponse(
      res,
      '문의사항 수정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * DELETE /api/inquiries/:id
 * 문의사항 삭제 (답변 전만 가능)
 */
router.delete('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const inquiryId = req.params.id;
    const userId = req.user.id;

    // 본인 문의사항인지 확인 및 답변 상태 확인
    const [inquiries] = await pool.execute(
      'SELECT id, user_id, inquiries_state FROM inquiries WHERE id = ? AND user_id = ?',
      [inquiryId, userId]
    );

    if (inquiries.length === 0) {
      return errorResponse(
        res,
        '문의사항을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const inquiry = inquiries[0];

    // 답변이 완료된 문의사항은 삭제 불가
    if (inquiry.inquiries_state !== INQUIRY_STATUS.PENDING) {
      return errorResponse(
        res,
        '답변이 진행중이거나 완료된 문의사항은 삭제할 수 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // 문의사항 삭제
    await pool.execute(
      'DELETE FROM inquiries WHERE id = ?',
      [inquiryId]
    );

    successResponse(res, '문의사항이 삭제되었습니다.');

  } catch (error) {
    console.error('문의사항 삭제 에러:', error);
    errorResponse(
      res,
      '문의사항 삭제 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * GET /api/inquiries/stats/summary
 * 내 문의사항 통계 (상태별 개수)
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [stats] = await pool.execute(
      `SELECT 
       inquiries_state,
       COUNT(*) as count
       FROM inquiries 
       WHERE user_id = ?
       GROUP BY inquiries_state`,
      [userId]
    );

    // 기본 상태별 개수 초기화
    const summary = {
      [INQUIRY_STATUS.PENDING]: 0,
      [INQUIRY_STATUS.ANSWERED]: 0,
      [INQUIRY_STATUS.CLOSED]: 0,
      total: 0
    };

    // 통계 데이터 적용
    stats.forEach(stat => {
      summary[stat.inquiries_state] = stat.count;
      summary.total += stat.count;
    });

    successResponse(res, '문의사항 통계 조회 완료', {
      summary
    });

  } catch (error) {
    console.error('문의사항 통계 조회 에러:', error);
    errorResponse(
      res,
      '문의사항 통계 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/inquiries/upload
 * 문의사항 첨부파일 업로드
 */
router.post('/upload', authenticateToken, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'voice', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files;
    const uploadedFiles = {};

    if (files.image && files.image[0]) {
      uploadedFiles.image = `/uploads/inquiries/${files.image[0].filename}`;
    }

    if (files.voice && files.voice[0]) {
      uploadedFiles.voice = `/uploads/inquiries/${files.voice[0].filename}`;
    }

    if (Object.keys(uploadedFiles).length === 0) {
      return errorResponse(
        res,
        '업로드할 파일이 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    successResponse(res, '파일 업로드가 완료되었습니다.', {
      files: uploadedFiles
    });

  } catch (error) {
    console.error('파일 업로드 에러:', error);

    if (error.message === '지원하지 않는 파일 형식입니다.') {
      return errorResponse(
        res,
        '지원하지 않는 파일 형식입니다. 이미지(jpg, png, gif, webp)와 음성(mp3, m4a, wav, aac, ogg) 파일만 업로드 가능합니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(
        res,
        '파일 크기가 너무 큽니다. 최대 10MB까지 업로드 가능합니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    errorResponse(
      res,
      '파일 업로드 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * DELETE /api/inquiries/files/:filename
 * 첨부파일 삭제
 */
router.delete('/files/:filename', authenticateToken, async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('public/uploads/inquiries/', filename);

    // 파일 존재 확인
    if (!fs.existsSync(filePath)) {
      return errorResponse(
        res,
        '파일을 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    // 파일 삭제
    fs.unlinkSync(filePath);

    successResponse(res, '파일이 삭제되었습니다.');

  } catch (error) {
    console.error('파일 삭제 에러:', error);
    errorResponse(
      res,
      '파일 삭제 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;