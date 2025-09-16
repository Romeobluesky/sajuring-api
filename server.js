const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/database');

// 라우트 import
const authRoutes = require('./routes/auth');
const consultantRoutes = require('./routes/consultants');
const specialtiesRoutes = require('./routes/specialties');
const ringRoutes = require('./routes/rings');
const consultationsRoutes = require('./routes/consultations');
const settlementsRoutes = require('./routes/settlements');
const paymentsRoutes = require('./routes/payments');
const reviewsRoutes = require('./routes/reviews');
const faqRoutes = require('./routes/faq');
const inquiryRoutes = require('./routes/inquiries');
const eventRoutes = require('./routes/events');
const usersRoutes = require('./routes/users');
const noticesRoutes = require('./routes/notices');
const headerBannerRoutes = require('./routes/header-banners');
const testRoutes = require('./routes/test');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200
};

// 미들웨어 설정
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Health Check 엔드포인트
app.get('/health', (req, res) => {
  // 한국 시간(KST) 기준으로 timestamp 생성
  const koreaTime = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  res.json({
    status: 'OK',
    timestamp: koreaTime,
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/consultants', consultantRoutes);
app.use('/api/specialties', specialtiesRoutes);
app.use('/api/consultation-styles', specialtiesRoutes);
app.use('/api/rings', ringRoutes);
app.use('/api/consultations', consultationsRoutes);
app.use('/api/settlements', settlementsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/faq', faqRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notices', noticesRoutes);
app.use('/api/header-banners', headerBannerRoutes);
app.use('/api/test', testRoutes);

// 404 에러 핸들러
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: '요청하신 API 엔드포인트를 찾을 수 없습니다.',
    code: 'NOT_FOUND',
    statusCode: 404
  });
});

// 글로벌 에러 핸들러
app.use((error, req, res, next) => {
  console.error('Unhandled Error:', error);
  
  // 에러 응답
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? '서버 오류가 발생했습니다.' 
      : error.message,
    code: 'SERVER_ERROR',
    statusCode: 500
  });
});

// 서버 시작
const startServer = async () => {
  try {
    // 데이터베이스 연결 테스트
    console.log('🔍 데이터베이스 연결 확인 중...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ 데이터베이스 연결 실패. 서버를 시작할 수 없습니다.');
      process.exit(1);
    }

    // 서버 시작
    app.listen(PORT, () => {
      console.log(`🚀 사주링 API 서버가 포트 ${PORT}에서 실행 중입니다.`);
      console.log(`🌍 환경: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Health Check: http://localhost:${PORT}/health`);
      console.log(`📚 API Base URL: http://localhost:${PORT}/api`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('\n📋 주요 API 엔드포인트:');
        console.log('   POST /api/auth/register - 회원가입');
        console.log('   POST /api/auth/login - 로그인');
        console.log('   GET  /api/auth/me - 내 정보 조회');
        console.log('   GET  /api/consultants - 상담사 목록');
        console.log('   GET  /api/consultants/:id - 상담사 상세');
        console.log('   GET  /api/rings/balance - 링 잔액 조회');
        console.log('   POST /api/rings/purchase - 링 구매');
        console.log('   POST /api/rings/transfer - 링 전송');
        console.log('   GET  /api/faq - FAQ 목록');
        console.log('   POST /api/inquiries - 문의사항 등록');
        console.log('   GET  /api/events - 이벤트 목록');
        console.log('   GET  /api/header-banners - 헤더 배너 목록\n');
      }
    });

  } catch (error) {
    console.error('❌ 서버 시작 실패:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM 신호를 받았습니다. 서버를 정상적으로 종료합니다.');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT 신호를 받았습니다. 서버를 정상적으로 종료합니다.');
  process.exit(0);
});

// Unhandled Promise Rejection 처리
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught Exception 처리
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// 서버 시작
startServer();

module.exports = app;