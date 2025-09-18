const { RESPONSE_CODES, HTTP_STATUS } = require('./constants');

/**
 * 성공 응답 생성
 */
const successResponse = (res, message = '성공', data = null, pagination = null) => {
  const response = {
    success: true,
    message,
    data
  };
  
  if (pagination) {
    response.pagination = pagination;
  }
  
  return res.status(HTTP_STATUS.OK).json(response);
};

/**
 * 에러 응답 생성
 */
const errorResponse = (res, message = '에러 발생', code = RESPONSE_CODES.SERVER_ERROR, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR) => {
  return res.status(statusCode).json({
    success: false,
    error: message,
    code,
    statusCode
  });
};

/**
 * 페이지네이션 정보 생성
 */
const createPagination = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    current_page: parseInt(page),
    per_page: parseInt(limit),
    total_items: parseInt(total),
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1
  };
};

/**
 * JSON 필드 안전하게 파싱
 */
const safeJsonParse = (jsonString, defaultValue = null) => {
  try {
    if (!jsonString) return defaultValue;

    // 이미 객체나 배열인 경우 그대로 반환
    if (typeof jsonString === 'object') {
      return jsonString;
    }

    // JSON 문자열이 아닌 경우 (이미지 경로 등) 빈 배열 반환
    if (typeof jsonString === 'string' && !jsonString.startsWith('[') && !jsonString.startsWith('{')) {
      return defaultValue;
    }

    return JSON.parse(jsonString);
  } catch (error) {
    // 파싱 에러시 기본값 반환
    return defaultValue;
  }
};

/**
 * JSON 필드 안전하게 문자열화
 */
const safeJsonStringify = (data) => {
  try {
    return data ? JSON.stringify(data) : null;
  } catch (error) {
    console.error('JSON 문자열화 에러:', error);
    return null;
  }
};

/**
 * 한국 시간으로 현재 시간 반환
 */
const getKoreanTime = () => {
  return new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
};

/**
 * 검색 쿼리 생성 (LIKE 검색용)
 */
const createSearchQuery = (searchTerm) => {
  return searchTerm ? `%${searchTerm}%` : null;
};

/**
 * 이메일 형식 검증
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * 전화번호 형식 검증 (한국 형식)
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^01[0-9]-?[0-9]{4}-?[0-9]{4}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * 비밀번호 강도 검증
 */
const isValidPassword = (password) => {
  // 최소 8자, 영문+숫자 조합
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/;
  return passwordRegex.test(password);
};

/**
 * 사용자명 형식 검증
 */
const isValidUsername = (username) => {
  // 영문, 숫자, 언더스코어만 허용, 3-20자
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

/**
 * 파일 확장자 검증
 */
const isValidImageExtension = (filename) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return allowedExtensions.includes(extension);
};

/**
 * SQL Injection 방지를 위한 입력 검증
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  // 기본적인 SQL 키워드 및 특수문자 제거
  const dangerous = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)|['";<>]/gi;
  return input.replace(dangerous, '');
};

module.exports = {
  successResponse,
  errorResponse,
  createPagination,
  safeJsonParse,
  safeJsonStringify,
  getKoreanTime,
  createSearchQuery,
  isValidEmail,
  isValidPhone,
  isValidPassword,
  isValidUsername,
  isValidImageExtension,
  sanitizeInput
};