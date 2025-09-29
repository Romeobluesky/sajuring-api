const jwt = require('jsonwebtoken');

// .env 파일에서 JWT_SECRET 읽기
require('dotenv').config();

// 테스트용 사용자 정보
const testUser = {
  id: 1,
  login_id: 'test',
  username: '테스트유저',
  email: 'test@example.com',
  role: 'USER'
};

// JWT 토큰 생성
const token = jwt.sign(testUser, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
});

console.log('Generated JWT Token:');
console.log(token);
console.log('\nToken Length:', token.length);

// Bearer 토큰 형식으로 출력
console.log('\nAuthorization Header:');
console.log(`Bearer ${token}`);