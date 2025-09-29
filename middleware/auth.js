const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, USER_STATUS } = require('../utils/constants');

/**
 * JWT 토큰 인증 미들웨어
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return errorResponse(
        res,
        '인증 토큰이 필요합니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // JWT 토큰 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 사용자 정보 조회 및 상태 확인
    const [users] = await pool.execute(
      'SELECT id, username, email, nickname, role, status, role_level FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (users.length === 0) {
      return errorResponse(
        res,
        '사용자를 찾을 수 없습니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    const user = users[0];

    // 사용자 상태 확인
    if (user.status !== USER_STATUS.ACTIVE) {
      return errorResponse(
        res,
        '비활성화된 계정입니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    // 요청 객체에 사용자 정보 추가
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      status: user.status,
      role_level: user.role_level
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return errorResponse(
        res,
        '유효하지 않은 토큰입니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }
    
    if (error.name === 'TokenExpiredError') {
      return errorResponse(
        res,
        '만료된 토큰입니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    console.error('인증 미들웨어 에러:', error);
    return errorResponse(
      res,
      '인증 처리 중 오류가 발생했습니다.',
      RESPONSE_CODES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

/**
 * 선택적 JWT 토큰 인증 미들웨어 (토큰이 있으면 검증, 없어도 통과)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    // 토큰이 있으면 검증
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [users] = await pool.execute(
      'SELECT id, username, email, nickname, role, status, role_level FROM users WHERE id = ? AND status = ?',
      [decoded.userId, USER_STATUS.ACTIVE]
    );

    if (users.length > 0) {
      req.user = {
        id: users[0].id,
        username: users[0].username,
        email: users[0].email,
        nickname: users[0].nickname,
        role: users[0].role,
        status: users[0].status,
        role_level: users[0].role_level
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    // 토큰 에러가 있어도 통과시키고 user를 null로 설정
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  optionalAuth
};