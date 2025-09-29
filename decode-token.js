const jwt = require('jsonwebtoken');

// .env 파일에서 JWT_SECRET 읽기
require('dotenv').config();

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibG9naW5faWQiOiJ0ZXN0IiwidXNlcm5hbWUiOiLthYzsiqTtirjsnKDsoIAiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc1OTE1NDcxNiwiZXhwIjoxNzU5MjQxMTE2fQ.hK2GIpCQH-tegbre1Wxrj4LuR1GGp-ch4KhyAMXf_x4";

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log('Decoded JWT Token:');
  console.log(JSON.stringify(decoded, null, 2));

  console.log('\n=== Field Check ===');
  console.log('decoded.id:', decoded.id);
  console.log('decoded.userId:', decoded.userId);
  console.log('type of decoded.id:', typeof decoded.id);

} catch (error) {
  console.error('Token decode error:', error.message);
}