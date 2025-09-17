# 사주링 API 서버

사주/타로 상담 플랫폼을 위한 Node.js REST API 서버입니다.

## 📋 프로젝트 개요

Flutter 모바일 앱과 웹 관리자 시스템을 지원하는 RESTful API 서버로, 사용자 인증, 상담사 관리, 포인트 시스템, 상담 예약 등의 기능을 제공합니다.

## 🛠 기술 스택

- **Backend**: Node.js + Express.js
- **Database**: MySQL 8.0
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: bcryptjs 비밀번호 해싱
- **Process Manager**: PM2
- **CORS**: Flutter 앱 통신 지원

## 🚀 빠른 시작

### 1. 프로젝트 클론
```bash
git clone https://github.com/your-username/sajuring-api.git
cd sajuring-api
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 환경변수 설정
`.env` 파일을 생성하고 다음 형식으로 설정하세요:
```env
# Database
DB_HOST=your_database_host
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h

# Server
PORT=3013
NODE_ENV=development

# CORS
ALLOWED_ORIGINS=http://localhost:3013,http://10.0.2.2:3013,http://127.0.0.1:3013
```

> ⚠️ **보안 주의**: 실제 데이터베이스 정보와 JWT 시크릿은 절대 공개 저장소에 커밋하지 마세요!

### 4. 데이터베이스 연결 테스트
```bash
npm run test:db
```

### 5. 개발 서버 실행
```bash
# nodemon을 사용한 개발 서버
npm run dev

# 또는 일반 실행
npm start
```

## 📁 프로젝트 구조

```
sajuring-api/
├── server.js                 # 메인 서버 파일
├── package.json              # 프로젝트 설정 및 의존성
├── .env                      # 환경변수 (보안 주의)
├── routes/                   # API 라우트 핸들러
│   ├── auth.js              # 인증 API
│   ├── consultants.js       # 상담사 관리
│   ├── rings.js             # 포인트/링 시스템
│   ├── consultations.js     # 상담 관리
│   ├── faq.js               # FAQ 관리
│   ├── inquiries.js         # 문의사항 관리
│   └── events.js            # 이벤트 관리
├── middleware/              # Express 미들웨어
│   ├── auth.js              # JWT 인증 미들웨어
│   ├── validation.js        # 입력 검증
│   └── roleCheck.js         # 역할 기반 접근 제어
├── config/
│   └── database.js          # MySQL 연결 풀 설정
└── utils/
    ├── helpers.js           # 유틸리티 함수
    └── constants.js         # 애플리케이션 상수
```

## 🔌 주요 API 엔드포인트

### 인증 (Authentication)
- `POST /api/auth/register` - 회원가입
- `POST /api/auth/login` - 로그인
- `GET /api/auth/me` - 내 정보 조회

### 상담사 (Consultants)
- `GET /api/consultants` - 상담사 목록 (필터링 지원, consultation_count/review_count 포함)
- `GET /api/consultants/popular` - 인기 상담사 목록 (consultation_count/review_count 포함)
- `GET /api/consultants/:id` - 상담사 상세 정보 (consultation_count/review_count 포함)
- `GET /api/consultants/search` - 상담사 검색 (consultation_count/review_count 포함)
- `GET /api/consultants/field/:field` - 전문분야별 상담사 조회 (consultation_count/review_count 포함)
- `GET /api/specialties` - 전문분야 목록

### 링 시스템 (Point System)
- `GET /api/rings/balance` - 링 잔액 조회
- `POST /api/rings/purchase` - 링 구매
- `POST /api/rings/transfer` - 링 전송

### 기타 서비스
- `GET /api/faq` - FAQ 목록
- `POST /api/inquiries` - 문의사항 등록
- `GET /api/events` - 이벤트 목록

## 🗄 데이터베이스 구조

### 주요 테이블
- **users** - 사용자 정보 (USER/CONSULTANT/ADMIN 역할)
- **consultants** - 상담사 정보 및 프로필
- **specialties** - 상담 전문분야 (타로, 신점, 사주 등)
- **consultation_styles** - 상담 방식 (채팅, 음성, 화상 등)
- **consultations** - 상담 예약 및 진행 상태
- **payments** - 결제 및 포인트 거래 내역
- **reviews** - 상담 후기 및 평점
- **events** - 이벤트 및 공지사항
- **faq** - 자주 묻는 질문
- **inquiries** - 사용자 문의사항

## 🧪 테스트

### API 테스트
```bash
# Health Check
curl http://localhost:3013/health

# 데이터베이스 연결 테스트
npm run test:db
```

자세한 테스트 방법은 [API_TESTING_GUIDE.md](./API_TESTING_GUIDE.md)를 참조하세요.

## 🚀 배포

### 개발 환경
```bash
npm run dev
```

### 프로덕션 배포
PM2를 사용한 프로덕션 배포 방법은 [SERVER_DEPLOYMENT_GUIDE.md](./SERVER_DEPLOYMENT_GUIDE.md)를 참조하세요.

```bash
# PM2로 시작
pm2 start ecosystem.config.js --env production

# PM2 상태 확인
pm2 status
```

## 🔧 환경 설정

### 포트 관리
- **3003** - 웹사이트 (기존)
- **3013** - REST API 서버
- **3014** - 관리자 시스템 (기존)

### CORS 설정
Flutter 앱 개발을 위한 CORS 설정:
- Android 에뮬레이터: `http://10.0.2.2:3013`
- iOS 시뮬레이터: `http://localhost:3013`

## 🔐 보안

- JWT 토큰 기반 인증
- bcryptjs 비밀번호 해싱
- SQL Injection 방지 (Prepared Statements)
- 입력 검증 (express-validator)
- 역할 기반 접근 제어 (RBAC)

## 📚 문서

- [API 테스트 가이드](./API_TESTING_GUIDE.md)
- [서버 배포 가이드](./SERVER_DEPLOYMENT_GUIDE.md)
- [Flutter 연동 가이드](./FLUTTER_INTEGRATION_GUIDE.md)
- [환경 설정 가이드](./ENVIRONMENT_CONFIG_GUIDE.md)

## 🤝 기여

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 📞 연락처

프로젝트 관련 문의: [contact@sajuring.com](mailto:contact@sajuring.com)
