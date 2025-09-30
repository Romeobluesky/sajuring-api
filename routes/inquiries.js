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

// 업로드 설정 (절대 경로 사용)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // admin.sajuring.co.kr의 uploads 폴더 경로
    const uploadPath = '/home/sajuring-admin/public/uploads/inquiries';

    console.log('========== multer destination 설정 ==========');
    console.log('📁 절대 경로:', uploadPath);
    console.log('📁 __dirname:', __dirname);

    // 폴더 생성
    if (!fs.existsSync(uploadPath)) {
      console.log('⚠️ 폴더가 없어서 생성합니다:', uploadPath);
      try {
        fs.mkdirSync(uploadPath, { recursive: true, mode: 0o755 });
        console.log('✅ 폴더 생성 완료');
      } catch (error) {
        console.error('❌ 폴더 생성 실패:', error);
      }
    } else {
      console.log('✅ 폴더가 이미 존재합니다');

      // 폴더 권한 확인
      try {
        const stats = fs.statSync(uploadPath);
        console.log('📋 폴더 권한:', (stats.mode & parseInt('777', 8)).toString(8));
      } catch (error) {
        console.error('❌ 폴더 정보 조회 실패:', error);
      }
    }

    console.log('=============================================');
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const filename = file.fieldname + '-' + uniqueSuffix + extension;

    console.log('========== multer filename 생성 ==========');
    console.log('📝 생성된 파일명:', filename);
    console.log('   - 원본 파일명:', file.originalname);
    console.log('   - 필드명:', file.fieldname);
    console.log('   - 확장자:', extension);
    console.log('=========================================');

    cb(null, filename);
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

  // 단일 파일 업로드 (file 필드명 - 확장자로 타입 결정)
  if (file.fieldname === 'file') {
    if (allowedImageTypes.includes(extension)) {
      console.log('✅ 이미지 파일 허용 (file)');
      cb(null, true);
    } else if (allowedAudioTypes.includes(extension)) {
      console.log('✅ 음성 파일 허용 (file)');
      cb(null, true);
    } else {
      console.log('❌ 파일 거부 - 지원하지 않는 확장자:', extension);
      cb(new Error(`지원하지 않는 파일 형식입니다. 확장자: ${extension}`), false);
    }
  }
  // 이미지 필드 (attachment_image 또는 image)
  else if ((file.fieldname === 'attachment_image' || file.fieldname === 'image') && allowedImageTypes.includes(extension)) {
    console.log('✅ 이미지 파일 허용');
    cb(null, true);
  }
  // 음성 필드 (attachment_voice 또는 voice)
  else if ((file.fieldname === 'attachment_voice' || file.fieldname === 'voice') && allowedAudioTypes.includes(extension)) {
    console.log('✅ 음성 파일 허용');
    cb(null, true);
  }
  else {
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

  console.log('🔍 Content-Type 감지:', contentType);

  if (contentType.includes('multipart/form-data')) {
    console.log('📤 Multipart 요청 감지 - multer 미들웨어 적용');

    // multipart 요청인 경우 multer 적용
    upload.fields([
      { name: 'attachment_image', maxCount: 1 },
      { name: 'attachment_voice', maxCount: 1 }
    ])(req, res, (err) => {
      if (err) {
        console.error('❌ Multer 에러:', err);
        console.error('   - 에러 메시지:', err.message);
        console.error('   - 에러 코드:', err.code);
        return errorResponse(
          res,
          err.message.includes('형식') ? err.message : '파일 업로드 중 오류가 발생했습니다.',
          RESPONSE_CODES.VALIDATION_ERROR,
          HTTP_STATUS.BAD_REQUEST
        );
      }

      console.log('✅ Multer 처리 완료');
      console.log('📎 업로드된 파일 정보:', req.files);

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
        const imagePath = `/uploads/inquiries/${req.files.attachment_image[0].filename}`;
        const fullPath = `public${imagePath}`;
        req.body.attachment_image = imagePath;

        console.log('🖼️ 이미지 파일 처리:');
        console.log('   - 저장 경로:', fullPath);
        console.log('   - DB 경로:', imagePath);
        console.log('   - 파일 크기:', req.files.attachment_image[0].size, 'bytes');

        // 파일 실제 저장 확인
        if (fs.existsSync(fullPath)) {
          console.log('   ✅ 파일이 실제로 저장되었습니다!');
        } else {
          console.log('   ❌ 파일이 저장되지 않았습니다!');
        }
      }

      if (req.files && req.files.attachment_voice) {
        const voicePath = `/uploads/inquiries/${req.files.attachment_voice[0].filename}`;
        const fullPath = `public${voicePath}`;
        req.body.attachment_voice = voicePath;

        console.log('🎤 음성 파일 처리:');
        console.log('   - 저장 경로:', fullPath);
        console.log('   - DB 경로:', voicePath);
        console.log('   - 파일 크기:', req.files.attachment_voice[0].size, 'bytes');

        // 파일 실제 저장 확인
        if (fs.existsSync(fullPath)) {
          console.log('   ✅ 파일이 실제로 저장되었습니다!');
        } else {
          console.log('   ❌ 파일이 저장되지 않았습니다!');
        }
      }

      console.log('📋 최종 Body:', req.body);

      next();
    });
  } else {
    console.log('📄 JSON 요청 - multer 미적용');
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
    console.log('========== 파일 업로드 디버깅 ==========');
    console.log('1. req.files:', req.files);
    console.log('2. req.body:', req.body);

    // 파일 업로드 확인
    if (req.files && req.files.attachment_image) {
      const file = req.files.attachment_image[0];
      console.log('3. 업로드된 파일 정보:');
      console.log('   - fieldname:', file.fieldname);
      console.log('   - originalname:', file.originalname);
      console.log('   - filename:', file.filename);
      console.log('   - path:', file.path);
      console.log('   - size:', file.size);
      console.log('   - mimetype:', file.mimetype);

      // 파일이 실제로 존재하는지 확인
      const fileExists = fs.existsSync(file.path);
      console.log('4. 파일 존재 여부:', fileExists);

      if (fileExists) {
        const stats = fs.statSync(file.path);
        console.log('5. 실제 파일 크기:', stats.size, 'bytes');
        console.log('6. 파일 권한:', (stats.mode & parseInt('777', 8)).toString(8));
        console.log('7. ✅ 파일이 정상적으로 저장되었습니다!');
      } else {
        console.error('❌ 파일이 저장되지 않았습니다!');
        console.log('7. 저장 경로 확인:', file.path);
        console.log('8. 상위 폴더 존재 여부:', fs.existsSync(path.dirname(file.path)));

        // 상위 폴더 정보
        if (fs.existsSync(path.dirname(file.path))) {
          const dirStats = fs.statSync(path.dirname(file.path));
          console.log('9. 상위 폴더 권한:', (dirStats.mode & parseInt('777', 8)).toString(8));
        }
      }
    } else {
      console.error('❌ req.files에 attachment_image가 없습니다!');
    }

    if (req.files && req.files.attachment_voice) {
      const file = req.files.attachment_voice[0];
      console.log('음성 파일 정보:');
      console.log('   - path:', file.path);
      console.log('   - size:', file.size);
      console.log('   - exists:', fs.existsSync(file.path));
    }

    console.log('=====================================');

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
 * POST /api/inquiries/upload-image
 * 문의사항 이미지 업로드 (단일 필드)
 */
router.post('/upload-image', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(
        res,
        '업로드할 이미지가 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const imageUrl = `/uploads/inquiries/${req.file.filename}`;

    successResponse(res, '이미지 업로드가 완료되었습니다.', {
      attachment_image: imageUrl,
      url: imageUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

  } catch (error) {
    console.error('이미지 업로드 에러:', error);

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
      '이미지 업로드 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/inquiries/upload-voice
 * 문의사항 음성 업로드 (단일 필드)
 */
router.post('/upload-voice', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(
        res,
        '업로드할 음성 파일이 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const voiceUrl = `/uploads/inquiries/${req.file.filename}`;

    successResponse(res, '음성 파일 업로드가 완료되었습니다.', {
      attachment_voice: voiceUrl,
      url: voiceUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

  } catch (error) {
    console.error('음성 파일 업로드 에러:', error);

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
      '음성 파일 업로드 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/inquiries/upload
 * 문의사항 첨부파일 업로드 (다중 필드)
 */
router.post('/upload', authenticateToken, upload.fields([
  { name: 'attachment_image', maxCount: 1 },
  { name: 'attachment_voice', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'voice', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files;
    const uploadedFiles = {};

    // attachment_image 또는 image 필드명 지원
    if (files.attachment_image && files.attachment_image[0]) {
      uploadedFiles.attachment_image = `/uploads/inquiries/${files.attachment_image[0].filename}`;
      uploadedFiles.image = uploadedFiles.attachment_image; // 호환성
    } else if (files.image && files.image[0]) {
      uploadedFiles.image = `/uploads/inquiries/${files.image[0].filename}`;
      uploadedFiles.attachment_image = uploadedFiles.image; // 호환성
    }

    // attachment_voice 또는 voice 필드명 지원
    if (files.attachment_voice && files.attachment_voice[0]) {
      uploadedFiles.attachment_voice = `/uploads/inquiries/${files.attachment_voice[0].filename}`;
      uploadedFiles.voice = uploadedFiles.attachment_voice; // 호환성
    } else if (files.voice && files.voice[0]) {
      uploadedFiles.voice = `/uploads/inquiries/${files.voice[0].filename}`;
      uploadedFiles.attachment_voice = uploadedFiles.voice; // 호환성
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