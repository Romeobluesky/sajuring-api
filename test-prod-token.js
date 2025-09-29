const jwt = require('jsonwebtoken');
require('dotenv').config();

// 실제 프로덕션 서버에서 사용하는 JWT 토큰 구조로 생성
const testUser = {
  userId: 1,  // 실제 데이터베이스의 사용자 ID
  login_id: 'atwmmcdy',
  username: '이유진',
  email: 'romeobluesky@gmail.com',
  role: 'USER'
};

const token = jwt.sign(testUser, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
});

console.log('Production Test JWT Token:');
console.log(token);
console.log('Token Length:', token.length);
console.log('\nAuthorization Header:');
console.log(`Bearer ${token}`);