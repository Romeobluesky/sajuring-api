const { errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS, USER_ROLES } = require('../utils/constants');

/**
 * 최소 역할 레벨 요구 미들웨어
 */
const requireRoleLevel = (minLevel) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(
        res,
        '인증이 필요합니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    if (req.user.role_level < minLevel) {
      return errorResponse(
        res,
        '권한이 부족합니다.',
        RESPONSE_CODES.AUTHORIZATION_ERROR,
        HTTP_STATUS.FORBIDDEN
      );
    }

    next();
  };
};

/**
 * 특정 역할 요구 미들웨어
 */
const requireRole = (roles) => {
  // 단일 역할 또는 역할 배열 지원
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(
        res,
        '인증이 필요합니다.',
        RESPONSE_CODES.AUTHENTICATION_ERROR,
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        '해당 기능에 접근할 권한이 없습니다.',
        RESPONSE_CODES.AUTHORIZATION_ERROR,
        HTTP_STATUS.FORBIDDEN
      );
    }

    next();
  };
};

/**
 * 관리자 권한 요구 미들웨어
 */
const requireAdmin = requireRole(USER_ROLES.ADMIN);

/**
 * 상담사 이상 권한 요구 미들웨어
 */
const requireConsultantOrAdmin = requireRole([USER_ROLES.CONSULT, USER_ROLES.ADMIN]);

/**
 * 사용자 본인 또는 관리자만 접근 가능
 */
const requireSelfOrAdmin = (req, res, next) => {
  if (!req.user) {
    return errorResponse(
      res,
      '인증이 필요합니다.',
      RESPONSE_CODES.AUTHENTICATION_ERROR,
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const targetUserId = parseInt(req.params.userId || req.params.id);
  const currentUserId = req.user.id;
  const isAdmin = req.user.role === USER_ROLES.ADMIN;

  if (currentUserId !== targetUserId && !isAdmin) {
    return errorResponse(
      res,
      '본인의 정보만 접근할 수 있습니다.',
      RESPONSE_CODES.AUTHORIZATION_ERROR,
      HTTP_STATUS.FORBIDDEN
    );
  }

  next();
};

/**
 * 상담사 본인 또는 관리자만 접근 가능
 */
const requireConsultantSelfOrAdmin = async (req, res, next) => {
  if (!req.user) {
    return errorResponse(
      res,
      '인증이 필요합니다.',
      RESPONSE_CODES.AUTHENTICATION_ERROR,
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const targetConsultantId = parseInt(req.params.consultantId || req.params.id);
  const currentUserId = req.user.id;
  const isAdmin = req.user.role === USER_ROLES.ADMIN;

  if (isAdmin) {
    return next(); // 관리자는 모든 상담사 정보 접근 가능
  }

  try {
    const { pool } = require('../config/database');
    const [consultants] = await pool.execute(
      'SELECT user_id FROM consultants WHERE id = ?',
      [targetConsultantId]
    );

    if (consultants.length === 0) {
      return errorResponse(
        res,
        '상담사를 찾을 수 없습니다.',
        RESPONSE_CODES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND
      );
    }

    const consultantUserId = consultants[0].user_id;

    if (currentUserId !== consultantUserId) {
      return errorResponse(
        res,
        '본인의 상담사 정보만 접근할 수 있습니다.',
        RESPONSE_CODES.AUTHORIZATION_ERROR,
        HTTP_STATUS.FORBIDDEN
      );
    }

    next();
  } catch (error) {
    console.error('상담사 권한 확인 에러:', error);
    return errorResponse(
      res,
      '권한 확인 중 오류가 발생했습니다.',
      RESPONSE_CODES.SERVER_ERROR,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
};

module.exports = {
  requireRoleLevel,
  requireRole,
  requireAdmin,
  requireConsultantOrAdmin,
  requireSelfOrAdmin,
  requireConsultantSelfOrAdmin
};