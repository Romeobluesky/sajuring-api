const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateRegister, validateLogin, validateProfileUpdate } = require('../middleware/validation');
const { successResponse, errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, USER_STATUS, USER_ROLES } = require('../utils/constants');

const router = express.Router();

/**
 * POST /api/auth/register
 * 회원가입
 */
router.post('/register', validateRegister, async (req, res) => {
  try {
    const { login_id, username, email, password, nickname, phone, birth_date, gender } = req.body;

    // 중복 확인 (login_id, email, nickname)
    const [existingUsers] = await pool.execute(
      'SELECT id, login_id, email, nickname FROM users WHERE login_id = ? OR email = ? OR nickname = ?',
      [login_id, email, nickname]
    );

    if (existingUsers.length > 0) {
      const duplicateUser = existingUsers[0];
      let duplicateField = [];

      if (duplicateUser.login_id === login_id) duplicateField.push('아이디');
      if (duplicateUser.email === email) duplicateField.push('이메일');
      if (duplicateUser.nickname === nickname) duplicateField.push('닉네임');

      return errorResponse(
        res,
        `이미 사용중인 ${duplicateField.join(', ')}입니다.`,
        RESPONSE_CODES.DUPLICATE_ERROR,
        HTTP_STATUS.CONFLICT
      );
    }

    // 비밀번호 해싱
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 사용자 생성
    const [result] = await pool.execute(
      `INSERT INTO users (login_id, username, email, password, nickname, phone, birth_date, gender,
       rings, role, status, policy, role_level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 1, NOW(), NOW())`,
      [
        login_id,
        username,
        email,
        hashedPassword,
        nickname,
        phone || null,
        birth_date || null,
        gender || null,
        USER_ROLES.USER,
        USER_STATUS.ACTIVE
      ]
    );

    const userId = result.insertId;

    // JWT 토큰 생성
    const token = jwt.sign(
      { userId, login_id, username, email, role: USER_ROLES.USER },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    successResponse(res, '회원가입이 완료되었습니다.', {
      user: {
        id: userId,
        login_id,
        username,
        email,
        nickname,
        role: USER_ROLES.USER,
        rings: 0
      },
      token
    });

  } catch (error) {
    console.error('회원가입 에러:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return errorResponse(
        res,
        '이미 사용중인 사용자명 또는 이메일입니다.',
        RESPONSE_CODES.DUPLICATE_ERROR,
        HTTP_STATUS.CONFLICT
      );
    }

    errorResponse(
      res,
      '회원가입 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/auth/login
 * 로그인 (email + password)
 */
router.post('/login', (req, res, next) => {
  // 로그인 요청 디버깅을 위한 로깅
  console.log('=== 로그인 요청 디버깅 ===');
  console.log('요청 헤더:', req.headers);
  console.log('요청 바디:', req.body);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('=======================');
  next();
}, validateLogin, async (req, res) => {
  try {
    const { loginId, email, password } = req.body;

    // loginId 또는 email 필드에서 이메일 값 추출
    const userEmail = loginId || email;
    console.log('추출된 이메일:', userEmail);

    // 사용자 조회 (login_id 또는 email)
    const [users] = await pool.execute(
      'SELECT id, login_id, username, email, password, nickname, role, status, rings, role_level FROM users WHERE (login_id = ? OR email = ?) AND status = ?',
      [userEmail, userEmail, USER_STATUS.ACTIVE]
    );

    if (users.length === 0) {
      return errorResponse(
        res,
        '이메일 또는 비밀번호가 일치하지 않습니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    const user = users[0];

    // 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return errorResponse(
        res,
        '이메일 또는 비밀번호가 일치하지 않습니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      {
        userId: user.id,
        login_id: user.login_id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    // 마지막 로그인 시간 업데이트
    await pool.execute(
      'UPDATE users SET updated_at = NOW() WHERE id = ?',
      [user.id]
    );

    successResponse(res, '로그인이 완료되었습니다.', {
      user: {
        id: user.id,
        login_id: user.login_id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        rings: user.rings,
        role_level: user.role_level
      },
      token
    });

  } catch (error) {
    console.error('로그인 에러:', error);
    errorResponse(
      res,
      '로그인 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/auth/check-login-id
 * 아이디 중복확인
 */
router.post('/check-login-id', [
  body('login_id')
    .isLength({ min: 3, max: 20 })
    .withMessage('아이디는 3-20자 사이여야 합니다.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('아이디는 영문, 숫자, 언더스코어만 허용됩니다.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(
        res,
        errors.array()[0].msg,
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    next();
  }
], async (req, res) => {
  try {
    const { login_id } = req.body;

    const [users] = await pool.execute(
      'SELECT id FROM users WHERE login_id = ?',
      [login_id]
    );

    if (users.length > 0) {
      return errorResponse(
        res,
        '이미 사용중인 아이디입니다.',
        RESPONSE_CODES.DUPLICATE_ERROR,
        HTTP_STATUS.CONFLICT
      );
    }

    successResponse(res, '사용 가능한 아이디입니다.', { available: true });

  } catch (error) {
    console.error('아이디 중복확인 에러:', error);
    errorResponse(
      res,
      '아이디 중복확인 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/auth/check-email
 * 이메일 중복확인
 */
router.post('/check-email', [
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 주소를 입력해주세요.')
    .normalizeEmail(),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(
        res,
        errors.array()[0].msg,
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    next();
  }
], async (req, res) => {
  try {
    const { email } = req.body;

    const [users] = await pool.execute(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (users.length > 0) {
      return errorResponse(
        res,
        '이미 사용중인 이메일입니다.',
        RESPONSE_CODES.DUPLICATE_ERROR,
        HTTP_STATUS.CONFLICT
      );
    }

    successResponse(res, '사용 가능한 이메일입니다.', { available: true });

  } catch (error) {
    console.error('이메일 중복확인 에러:', error);
    errorResponse(
      res,
      '이메일 중복확인 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/auth/check-nickname
 * 닉네임 중복확인
 */
router.post('/check-nickname', [
  body('nickname')
    .isLength({ min: 2, max: 20 })
    .withMessage('닉네임은 2-20자 사이여야 합니다.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return errorResponse(
        res,
        errors.array()[0].msg,
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    next();
  }
], async (req, res) => {
  try {
    const { nickname } = req.body;

    const [users] = await pool.execute(
      'SELECT id FROM users WHERE nickname = ?',
      [nickname]
    );

    if (users.length > 0) {
      return errorResponse(
        res,
        '이미 사용중인 닉네임입니다.',
        RESPONSE_CODES.DUPLICATE_ERROR,
        HTTP_STATUS.CONFLICT
      );
    }

    successResponse(res, '사용 가능한 닉네임입니다.', { available: true });

  } catch (error) {
    console.error('닉네임 중복확인 에러:', error);
    errorResponse(
      res,
      '닉네임 중복확인 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * POST /api/auth/logout
 * 로그아웃 (클라이언트에서 토큰 삭제)
 */
router.post('/logout', authenticateToken, (req, res) => {
  // JWT는 stateless이므로 서버에서 별도 처리 없음
  // 클라이언트에서 토큰 삭제하도록 안내
  successResponse(res, '로그아웃이 완료되었습니다.');
});

/**
 * GET /api/auth/me
 * 내 정보 조회
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [users] = await pool.execute(
      `SELECT id, login_id, username, email, nickname, phone, birth_date, gender,
       profile_image, rings, role, status, role_level, created_at, updated_at
       FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return errorResponse(
        res,
        '사용자를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const user = users[0];

    // 상담사인 경우 상담사 정보도 조회
    let consultantInfo = null;
    if (user.role === USER_ROLES.CONSULT) {
      const [consultants] = await pool.execute(
        `SELECT id, consultant_number, name, stage_name, grade, consultant_grade, 
         consultation_field, consultation_fee, consultation_rate 
         FROM consultants WHERE user_id = ?`,
        [userId]
      );

      if (consultants.length > 0) {
        consultantInfo = consultants[0];
      }
    }

    successResponse(res, '사용자 정보 조회 완료', {
      user: {
        id: user.id,
        login_id: user.login_id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        phone: user.phone,
        birth_date: user.birth_date,
        gender: user.gender,
        profile_image: user.profile_image,
        rings: user.rings,
        role: user.role,
        status: user.status,
        role_level: user.role_level,
        created_at: user.created_at,
        updated_at: user.updated_at
      },
      consultant: consultantInfo
    });

  } catch (error) {
    console.error('내 정보 조회 에러:', error);
    errorResponse(
      res,
      '사용자 정보 조회 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

/**
 * PUT /api/auth/profile
 * 프로필 수정
 */
router.put('/profile', authenticateToken, validateProfileUpdate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { nickname, phone, birth_date, gender } = req.body;

    // 업데이트할 필드만 처리
    const updateFields = [];
    const updateValues = [];

    if (nickname !== undefined) {
      updateFields.push('nickname = ?');
      updateValues.push(nickname);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (birth_date !== undefined) {
      updateFields.push('birth_date = ?');
      updateValues.push(birth_date);
    }
    if (gender !== undefined) {
      updateFields.push('gender = ?');
      updateValues.push(gender);
    }

    if (updateFields.length === 0) {
      return errorResponse(
        res,
        '수정할 정보가 없습니다.',
        RESPONSE_CODES.VALIDATION_ERROR,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    updateFields.push('updated_at = NOW()');
    updateValues.push(userId);

    await pool.execute(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // 업데이트된 사용자 정보 조회
    const [users] = await pool.execute(
      'SELECT id, login_id, username, email, nickname, phone, birth_date, gender, profile_image, rings, role FROM users WHERE id = ?',
      [userId]
    );

    successResponse(res, '프로필이 수정되었습니다.', {
      user: users[0]
    });

  } catch (error) {
    console.error('프로필 수정 에러:', error);
    errorResponse(
      res,
      '프로필 수정 중 오류가 발생했습니다.',
      RESPONSE_CODES.DATABASE_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
});

module.exports = router;