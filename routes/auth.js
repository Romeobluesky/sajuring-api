const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
    const { username, email, password, nickname, phone, birth_date, gender } = req.body;

    // 중복 확인 (username, email)
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return errorResponse(
        res,
        '이미 사용중인 사용자명 또는 이메일입니다.',
        RESPONSE_CODES.DUPLICATE_ERROR,
        HTTP_STATUS.CONFLICT
      );
    }

    // 비밀번호 해싱
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 사용자 생성
    const [result] = await pool.execute(
      `INSERT INTO users (username, email, password, nickname, phone, birth_date, gender, 
       rings, role, status, policy, role_level, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, 1, NOW(), NOW())`,
      [
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
      { userId, username, email, role: USER_ROLES.USER },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    successResponse(res, '회원가입이 완료되었습니다.', {
      user: {
        id: userId,
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
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { loginId, password } = req.body;

    // 사용자 조회 (email만)
    const [users] = await pool.execute(
      'SELECT id, username, email, password, nickname, role, status, rings, role_level FROM users WHERE email = ? AND status = ?',
      [loginId, USER_STATUS.ACTIVE]
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
      `SELECT id, username, email, nickname, phone, birth_date, gender, 
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
      'SELECT id, username, email, nickname, phone, birth_date, gender, profile_image, rings, role FROM users WHERE id = ?',
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