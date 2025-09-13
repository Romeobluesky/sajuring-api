# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

사주링(Sajuring) Node.js API 서버 - Flutter 앱을 위한 사주/타로 상담 플랫폼 RESTful API

## Technology Stack

- **Backend**: Node.js + Express.js
- **Database**: MySQL (sajuring_db - 기존 운영중인 DB)
- **Authentication**: JWT 토큰 기반
- **Security**: bcryptjs 비밀번호 해싱
- **CORS**: Flutter 앱과의 통신

## Database Configuration

```javascript
// config/database.js
const dbConfig = {
  host: '1.234.2.37',
  port: 3306,
  database: 'sajuring_db',
  user: 'sajuring2025',
  password: '!@#sajuring2025'
};
```

## Key Database Tables

1. **users** - 사용자 정보 (role: USER/CONSULTANT/ADMIN, login_id로 로그인)
2. **consultants** - 상담사 정보 (타로/신점 전문분야, JSON 기반 전문분야/상담스타일)
3. **specialties** - 전문분야 마스터 테이블 (타로, 신점 등)
4. **consultation_styles** - 상담스타일 마스터 테이블
5. **consultations** - 상담 내역 관리 (고객-상담사 매칭, 결제 연동)
6. **payments** - 결제 정보 관리 (링 구매, 상담료 결제)
7. **reviews** - 상담 후기 관리 (평점, 리뷰 내용)
8. **event** - 이벤트 관리 (상담사/사용자 이벤트)
9. **faq** - FAQ 관리
10. **inquiries** - 문의사항 관리
11. **notices** - 공지사항 관리
12. **header_banners** - 헤더 배너 관리

## Development Commands

```bash
# Install dependencies
npm install

# Development server with nodemon
npm run dev

# Production server
npm start

# Test database connection
npm run test:db
```

## Project Structure

```
sajuring-api/
├── server.js                 # Main server file
├── package.json
├── .env                      # Environment variables
├── routes/                   # API route handlers
│   ├── auth.js              # Authentication APIs
│   ├── consultants.js       # Consultant management
│   ├── rings.js             # Point/Ring system
│   ├── consultations.js     # Consultation management
│   ├── faq.js               # FAQ management
│   ├── inquiries.js         # Inquiry management
│   └── events.js            # Event management
├── middleware/              # Express middleware
│   ├── auth.js              # JWT authentication
│   ├── validation.js        # Input validation
│   └── roleCheck.js         # Role-based access control
├── config/
│   └── database.js          # MySQL connection pool
└── utils/
    ├── helpers.js           # Utility functions
    └── constants.js         # App constants
```

## API Endpoints

### Authentication
- POST /api/auth/register - 회원가입 (login_id 기반)
- POST /api/auth/login - 로그인 (login_id 또는 email)
- GET /api/auth/me - 내 정보 조회

### Consultants
- GET /api/consultants - 상담사 목록 (전문분야/스타일 필터링 지원)
- GET /api/consultants/:id - 상담사 상세 정보
- GET /api/consultants/search - 검색 및 필터
- GET /api/specialties - 전문분야 목록
- GET /api/consultation-styles - 상담스타일 목록

### Consultations
- POST /api/consultations/start - 상담 시작
- POST /api/consultations/end - 상담 종료
- GET /api/consultations/history - 내 상담 기록
- POST /api/consultations/rate - 상담 평가

### Payments & Rings
- GET /api/rings/balance - 내 링 잔액
- POST /api/rings/purchase - 링 구매
- POST /api/rings/transfer - 링 전송
- GET /api/payments/history - 결제 내역

### Reviews
- GET /api/reviews/consultant/:id - 상담사별 후기
- POST /api/reviews - 후기 작성
- PUT /api/reviews/:id - 후기 수정

### Others
- GET /api/faq - FAQ 목록
- POST /api/inquiries - 문의사항 등록
- GET /api/events - 이벤트 목록
- GET /api/notices - 공지사항 목록
- GET /api/header-banners - 헤더 배너 목록

## Environment Variables (.env)

```
DB_HOST=1.234.2.37
DB_PORT=3306
DB_NAME=sajuring_db
DB_USER=sajuring2025
DB_PASSWORD="!@#sajuring2025"
JWT_SECRET=sajuring-super-secret-jwt-key-2025
JWT_EXPIRES_IN=24h
PORT=3000
NODE_ENV=development
```

## Key Features

1. **JWT 기반 인증** - 토큰 기반 사용자 인증
2. **역할 기반 접근 제어** - USER/CONSULT/ADMIN 역할
3. **링(포인트) 시스템** - 사용자-상담사간 포인트 거래
4. **상담사 필터링** - 전문분야/등급별 검색
5. **JSON 필드 처리** - intro_images, consultant_list 등

## Security Considerations

- bcryptjs로 비밀번호 해싱
- JWT 토큰 만료 관리
- SQL Injection 방지 (prepared statements)
- 입력 검증 (express-validator)
- CORS 설정

## Development Notes

- 한국 시간(UTC+9) 기준 처리
- MySQL Connection Pool 사용
- JSON 필드의 적절한 파싱 및 검증
- 기존 운영중인 관리자 페이지와 호환성 유지