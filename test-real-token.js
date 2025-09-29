const jwt = require('jsonwebtoken');
require('dotenv').config();

// 실제 앱에서 사용하는 JWT 토큰 구조로 테스트 토큰 생성
const testUser = {
  userId: 1,  // decoded.userId로 접근할 수 있도록
  login_id: 'test',
  username: '테스트유저',
  email: 'test@example.com',
  role: 'USER'
};

const token = jwt.sign(testUser, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
});

console.log('Real structure JWT Token:');
console.log(token);
console.log('Token Length:', token.length);

// 디코딩해서 확인
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log('\nDecoded token:');
console.log('decoded.userId:', decoded.userId);
console.log('decoded.id:', decoded.id);