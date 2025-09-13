# 사주링 API 테스트 가이드

## 개요

이 문서는 사주링 Node.js API 서버를 테스트하는 다양한 방법을 제공합니다. 개발 과정에서 API가 올바르게 작동하는지 확인할 수 있습니다.

## 🚀 서버 시작하기

### 1. 개발 서버 실행
```bash
# 개발 서버 (nodemon 사용)
npm run dev

# 또는 일반 실행
npm start
```

### 2. 서버 상태 확인
```bash
# Health Check
curl http://localhost:3013/health

# 또는 브라우저에서
http://localhost:3013/health
```

## 🧪 테스트 방법

### 1. Postman을 사용한 테스트

#### Postman 컬렉션 설정

**Base URL 설정:**
- 환경 변수: `{{base_url}}` = `http://localhost:3013`

**공통 헤더:**
```
Content-Type: application/json
Authorization: Bearer {{token}}  // 인증이 필요한 API용
```

#### 주요 테스트 시나리오

**🔐 인증 테스트**

1. **회원가입**
```json
POST {{base_url}}/api/auth/register
{
  "email": "test@example.com",
  "password": "password123!",
  "login_id": "testuser",
  "username": "테스트사용자",
  "nickname": "테스터",
  "phone": "010-1234-5678",
  "birth_date": "1990-01-01",
  "gender": "M",
  "policy": "Y"
}
```

2. **로그인**
```json
POST {{base_url}}/api/auth/login
{
  "loginId": "testuser",
  "password": "password123!"
}
```

3. **내 정보 조회**
```
GET {{base_url}}/api/auth/me
Headers: Authorization: Bearer {{token}}
```

**👨‍💼 상담사 테스트**

1. **상담사 목록**
```
GET {{base_url}}/api/consultants?page=1&limit=10&consultation_field=타로
```

2. **상담사 상세**
```
GET {{base_url}}/api/consultants/1
```

3. **전문분야 목록**
```
GET {{base_url}}/api/specialties
```

**💍 링 시스템 테스트**

1. **링 잔액 조회**
```
GET {{base_url}}/api/rings/balance
Headers: Authorization: Bearer {{token}}
```

2. **링 구매**
```json
POST {{base_url}}/api/rings/purchase
Headers: Authorization: Bearer {{token}}
{
  "charge_amount": 100,
  "payment_method": "card",
  "is_sajuring_pay": 0
}
```

### 2. cURL을 사용한 테스트

#### Health Check
```bash
curl -X GET http://localhost:3013/health
```

#### 회원가입
```bash
curl -X POST http://localhost:3013/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "curl@example.com",
    "password": "password123!",
    "login_id": "curluser",
    "username": "cURL사용자",
    "nickname": "cURL테스터",
    "phone": "010-9876-5432",
    "birth_date": "1995-05-15",
    "gender": "F",
    "policy": "Y"
  }'
```

#### 로그인
```bash
curl -X POST http://localhost:3013/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "loginId": "curluser",
    "password": "password123!"
  }'
```

#### 상담사 목록 (토큰 필요시)
```bash
curl -X GET "http://localhost:3013/api/consultants?page=1&limit=5" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 3. Node.js 테스트 스크립트

#### 테스트 스크립트 생성
```javascript
// test/api-test.js
const axios = require('axios');

const BASE_URL = 'http://localhost:3013';
let authToken = '';

// 테스트 헬퍼 함수
const apiTest = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) config.data = data;
    
    const response = await axios(config);
    console.log(`✅ ${method} ${endpoint}:`, response.status, response.data);
    return response.data;
  } catch (error) {
    console.log(`❌ ${method} ${endpoint}:`, error.response?.status, error.response?.data);
    return null;
  }
};

// 테스트 시나리오
const runTests = async () => {
  console.log('🚀 API 테스트 시작\n');
  
  // 1. Health Check
  await apiTest('GET', '/health');
  
  // 2. 회원가입
  const registerData = {
    email: 'nodetest@example.com',
    password: 'password123!',
    login_id: 'nodeuser',
    username: 'Node테스터',
    nickname: 'Node',
    phone: '010-1111-2222',
    birth_date: '1992-03-20',
    gender: 'M',
    policy: 'Y'
  };
  
  const registerResult = await apiTest('POST', '/api/auth/register', registerData);
  
  // 3. 로그인
  const loginResult = await apiTest('POST', '/api/auth/login', {
    loginId: 'nodeuser',
    password: 'password123!'
  });
  
  if (loginResult?.data?.token) {
    authToken = loginResult.data.token;
    console.log('🔑 토큰 획득:', authToken.substring(0, 20) + '...');
  }
  
  // 4. 인증이 필요한 API 테스트
  if (authToken) {
    await apiTest('GET', '/api/auth/me', null, {
      'Authorization': `Bearer ${authToken}`
    });
    
    await apiTest('GET', '/api/rings/balance', null, {
      'Authorization': `Bearer ${authToken}`
    });
  }
  
  // 5. 공개 API 테스트
  await apiTest('GET', '/api/consultants?page=1&limit=3');
  await apiTest('GET', '/api/specialties');
  await apiTest('GET', '/api/faq');
  await apiTest('GET', '/api/events');
  
  console.log('\n✨ 테스트 완료');
};

runTests();
```

#### 테스트 실행
```bash
# axios 설치
npm install axios

# 테스트 실행
node test/api-test.js
```

### 4. 브라우저 개발자 도구 테스트

#### JavaScript 콘솔에서 테스트

```javascript
// 회원가입 테스트
fetch('http://localhost:3013/api/auth/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'browser@example.com',
    password: 'password123!',
    login_id: 'browseruser',
    username: '브라우저사용자',
    nickname: '브라우저',
    phone: '010-3333-4444',
    birth_date: '1988-12-10',
    gender: 'F',
    policy: 'Y'
  })
})
.then(response => response.json())
.then(data => console.log('회원가입 결과:', data));

// 상담사 목록 테스트
fetch('http://localhost:3013/api/consultants?page=1&limit=5')
.then(response => response.json())
.then(data => console.log('상담사 목록:', data));
```

## 📊 데이터베이스 테스트

### 1. 데이터베이스 연결 테스트
```bash
npm run test:db
```

### 2. 테이블 확인 API
```bash
# 전체 테이블 목록
curl http://localhost:3013/api/test/tables

# 사용자 수 확인
curl http://localhost:3013/api/test/users-count

# 상담사 수 확인
curl http://localhost:3013/api/test/consultants-count
```

## 🔧 테스트 환경 설정

### 1. 환경 변수 확인
`.env` 파일이 올바르게 설정되어 있는지 확인:
```env
DB_HOST=1.234.2.37
DB_PORT=3306
DB_NAME=sajuring_db
DB_USER=sajuring2025
DB_PASSWORD="!@#sajuring2025"
JWT_SECRET=sajuring-super-secret-jwt-key-2025
JWT_EXPIRES_IN=24h
PORT=3013
NODE_ENV=development
```

### 2. CORS 설정 확인
Flutter 앱에서 테스트할 경우:
- Android 에뮬레이터: `http://10.0.2.2:3001`
- iOS 시뮬레이터: `http://localhost:3013`

## 🧩 통합 테스트 시나리오

### 완전한 사용자 플로우 테스트
```bash
# 1. 서버 시작
npm run dev

# 2. Health Check
curl http://localhost:3013/health

# 3. 회원가입
curl -X POST http://localhost:3013/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"flow@test.com","password":"pass123!","login_id":"flowuser","username":"플로우테스터","nickname":"플로우","phone":"010-5555-6666","birth_date":"1993-07-25","gender":"M","policy":"Y"}'

# 4. 로그인 (토큰 획득)
curl -X POST http://localhost:3013/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"flowuser","password":"pass123!"}'

# 5. 내 정보 조회 (토큰 사용)
curl -X GET http://localhost:3013/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

# 6. 상담사 찾기
curl "http://localhost:3013/api/consultants?consultation_field=타로&page=1&limit=3"

# 7. 링 잔액 확인
curl -X GET http://localhost:3013/api/rings/balance \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🐛 문제 해결

### 자주 발생하는 오류

1. **서버 연결 오류**
   - 서버가 실행 중인지 확인: `npm run dev`
   - 포트 충돌 확인: `netstat -ano | findstr :3013`

2. **데이터베이스 연결 오류**
   - `.env` 파일 설정 확인
   - 데이터베이스 서버 접근 가능 여부 확인

3. **인증 오류**
   - JWT 토큰 만료 확인
   - Authorization 헤더 형식 확인: `Bearer TOKEN`

4. **CORS 오류**
   - 클라이언트 URL이 CORS 설정에 포함되어 있는지 확인

### 로그 확인
```bash
# 서버 로그 실시간 확인
npm run dev

# 특정 로그 필터링 (Linux/Mac)
npm run dev | grep "ERROR"
```

## 📝 테스트 체크리스트

### 기본 기능 테스트
- [ ] Health Check API
- [ ] 회원가입 API
- [ ] 로그인 API
- [ ] 내 정보 조회 API
- [ ] 상담사 목록 API
- [ ] 상담사 상세 API
- [ ] 전문분야 목록 API
- [ ] 링 잔액 조회 API
- [ ] FAQ 목록 API
- [ ] 이벤트 목록 API

### 데이터 검증 테스트
- [ ] 필수 필드 누락 시 오류 응답
- [ ] 잘못된 이메일 형식 오류 응답
- [ ] 중복 회원가입 오류 응답
- [ ] 잘못된 로그인 정보 오류 응답
- [ ] 토큰 없이 보호된 API 접근 시 오류 응답

### 성능 테스트
- [ ] 응답 시간 측정 (< 500ms)
- [ ] 대량 데이터 조회 테스트
- [ ] 동시 접속 테스트

이 가이드를 통해 API의 모든 기능을 체계적으로 테스트할 수 있습니다. 각 방법은 상황에 맞게 선택하여 사용하시면 됩니다.