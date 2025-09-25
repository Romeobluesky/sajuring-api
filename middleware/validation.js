const { body, param, query, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/helpers');
const { RESPONSE_CODES, HTTP_STATUS } = require('../utils/constants');

/**
 * 유효성 검사 결과 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    console.log('=== Validation 에러 디버깅 ===');
    console.log('요청 바디:', req.body);
    console.log('검증 에러들:', errors.array());
    console.log('========================');

    const errorMessages = errors.array().map(error => error.msg);
    return errorResponse(
      res,
      errorMessages.join(', '),
      RESPONSE_CODES.VALIDATION_ERROR,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  next();
};

/**
 * 회원가입 유효성 검사
 */
const validateRegister = [
  body('login_id')
    .isLength({ min: 3, max: 20 })
    .withMessage('아이디는 3-20자 사이여야 합니다.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('아이디는 영문, 숫자, 언더스코어만 허용됩니다.'),
    
  body('email')
    .isEmail()
    .withMessage('유효한 이메일 주소를 입력해주세요.')
    .normalizeEmail(),
    
  body('password')
    .isLength({ min: 8 })
    .withMessage('비밀번호는 최소 8자 이상이어야 합니다.')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('비밀번호는 영문과 숫자를 포함해야 합니다.'),
    
  body('nickname')
    .isLength({ min: 2, max: 20 })
    .withMessage('닉네임은 2-20자 사이여야 합니다.'),
    
  body('phone')
    .optional()
    .matches(/^01[0-9]-?[0-9]{4}-?[0-9]{4}$/)
    .withMessage('유효한 전화번호 형식이 아닙니다.'),
    
  body('birth_date')
    .optional()
    .isISO8601()
    .withMessage('유효한 날짜 형식이 아닙니다.'),
    
  body('gender')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('성별은 M(남성) 또는 F(여성)이어야 합니다.'),
    
  handleValidationErrors
];

/**
 * 로그인 유효성 검사
 */
const validateLogin = [
  // loginId 또는 email 필드 모두 지원
  body('loginId')
    .optional()
    .isEmail()
    .withMessage('유효한 이메일 주소를 입력해주세요.')
    .normalizeEmail(),

  body('email')
    .optional()
    .isEmail()
    .withMessage('유효한 이메일 주소를 입력해주세요.')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('비밀번호를 입력해주세요.'),

  // 커스텀 검증: loginId 또는 email 중 하나는 반드시 있어야 함
  body().custom((value, { req }) => {
    const { loginId, email } = req.body;
    if (!loginId && !email) {
      throw new Error('이메일을 입력해주세요.');
    }
    return true;
  }),

  handleValidationErrors
];

/**
 * 프로필 수정 유효성 검사
 */
const validateProfileUpdate = [
  body('nickname')
    .optional()
    .isLength({ min: 2, max: 20 })
    .withMessage('닉네임은 2-20자 사이여야 합니다.'),
    
  body('phone')
    .optional()
    .matches(/^01[0-9]-?[0-9]{4}-?[0-9]{4}$/)
    .withMessage('유효한 전화번호 형식이 아닙니다.'),
    
  body('birth_date')
    .optional()
    .isISO8601()
    .withMessage('유효한 날짜 형식이 아닙니다.'),
    
  body('gender')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('성별은 M(남성) 또는 F(여성)이어야 합니다.'),
    
  handleValidationErrors
];

/**
 * 상담사 검색 유효성 검사
 */
const validateConsultantSearch = [
  query('field')
    .optional()
    .isIn(['타로', '신점'])
    .withMessage('상담 분야는 타로 또는 신점이어야 합니다.'),
    
  query('grade')
    .optional()
    .isIn(['일반', 'VIP', 'VVIP'])
    .withMessage('등급은 일반, VIP, VVIP 중 하나여야 합니다.'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('페이지는 1 이상의 정수여야 합니다.'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('페이지 크기는 1-100 사이여야 합니다.'),
    
  handleValidationErrors
];

/**
 * ID 파라미터 유효성 검사
 */
const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('유효한 ID가 아닙니다.'),
    
  handleValidationErrors
];

/**
 * 링 구매 유효성 검사
 */
const validateRingPurchase = [
  body('amount')
    .isInt({ min: 1 })
    .withMessage('구매 금액은 1 이상이어야 합니다.'),
    
  body('rings')
    .isInt({ min: 1 })
    .withMessage('링 개수는 1 이상이어야 합니다.'),
    
  body('payment_method')
    .isIn(['card', 'bank', 'mobile'])
    .withMessage('유효한 결제 방법을 선택해주세요.'),
    
  handleValidationErrors
];

/**
 * 링 전송 유효성 검사
 */
const validateRingTransfer = [
  body('to_user_id')
    .isInt({ min: 1 })
    .withMessage('유효한 사용자 ID가 아닙니다.'),
    
  body('rings')
    .isInt({ min: 1 })
    .withMessage('전송할 링 개수는 1 이상이어야 합니다.'),
    
  body('message')
    .optional()
    .isLength({ max: 200 })
    .withMessage('메시지는 200자 이하여야 합니다.'),
    
  handleValidationErrors
];

/**
 * 문의사항 등록 유효성 검사
 */
const validateInquiry = [
  body('inquiries_type')
    .notEmpty()
    .withMessage('문의 유형을 선택해주세요.')
    .isLength({ max: 50 })
    .withMessage('문의 유형은 50자 이하여야 합니다.'),
    
  body('inquiries_title')
    .notEmpty()
    .withMessage('제목을 입력해주세요.')
    .isLength({ min: 5, max: 100 })
    .withMessage('제목은 5-100자 사이여야 합니다.'),
    
  body('inquiries_content')
    .notEmpty()
    .withMessage('내용을 입력해주세요.')
    .isLength({ min: 10, max: 2000 })
    .withMessage('내용은 10-2000자 사이여야 합니다.'),
    
  body('is_private')
    .optional()
    .isBoolean()
    .withMessage('공개 여부는 true 또는 false여야 합니다.'),
    
  handleValidationErrors
];

/**
 * 상담 평가 유효성 검사
 */
const validateConsultationRate = [
  body('consultation_id')
    .isInt({ min: 1 })
    .withMessage('유효한 상담 ID가 아닙니다.'),
    
  body('rating')
    .isFloat({ min: 1, max: 5 })
    .withMessage('평점은 1-5 사이의 숫자여야 합니다.'),
    
  body('review')
    .optional()
    .isLength({ max: 500 })
    .withMessage('리뷰는 500자 이하여야 합니다.'),
    
  handleValidationErrors
];

/**
 * 페이지네이션 유효성 검사
 */
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('페이지는 1 이상의 정수여야 합니다.'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('페이지 크기는 1-100 사이여야 합니다.'),
    
  handleValidationErrors
];

module.exports = {
  validateRegister,
  validateLogin,
  validateProfileUpdate,
  validateConsultantSearch,
  validateId,
  validateRingPurchase,
  validateRingTransfer,
  validateInquiry,
  validateConsultationRate,
  validatePagination,
  handleValidationErrors
};