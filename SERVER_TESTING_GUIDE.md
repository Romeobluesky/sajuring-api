# 서버 배포 후 테스트 가이드

## 개요

1.234.2.37 서버에 sajuring-api를 배포한 후 API가 정상적으로 작동하는지 확인하는 종합 테스트 가이드입니다.

## 🚀 1단계: 기본 서버 상태 확인

### 1.1 서버 접속 및 서비스 상태
```bash
# 서버 접속
ssh sajuring-api@1.234.2.37

# PM2 상태 확인
pm2 status

# sajuring-api 프로세스 확인
pm2 info sajuring-api

# 로그 확인
pm2 logs sajuring-api --lines 20
```

### 1.2 포트 및 네트워크 확인
```bash
# 포트 3013 사용 상태 확인
sudo netstat -tlnp | grep :3013

# 방화벽 상태 확인
sudo ufw status

# 프로세스 확인
ps aux | grep node
```

## 🔍 2단계: Health Check 테스트

### 2.1 로컬(서버 내부) 테스트
```bash
# 서버 내부에서 Health Check
curl http://localhost:3013/health

# 또는 외부 IP로 테스트
curl http://1.234.2.37:3013/health

# 예상 응답
{
  "status": "OK",
  "timestamp": "2025-09-13T08:21:00.604Z",
  "version": "1.0.0",
  "environment": "production"
}
```

### 2.2 외부에서 접근 테스트
```bash
# 로컬 컴퓨터에서 테스트
curl http://1.234.2.37:3013/health

# Windows에서 PowerShell 사용
Invoke-RestMethod -Uri "http://1.234.2.37:3013/health"
```

## 🗄️ 3단계: 데이터베이스 연결 테스트

### 3.1 API를 통한 DB 연결 테스트
```bash
# 서버에서 DB 연결 확인
cd /home/sajuring-api/projects/sajuring-api
npm run test:db

# 또는 직접 MySQL 연결 테스트
mysql -h 1.234.2.37 -P 3306 -u sajuring2025 -p sajuring_db
```

### 3.2 테스트 API 엔드포인트 (있는 경우)
```bash
# 전체 테이블 목록 확인
curl http://1.234.2.37:3013/api/test/tables

# 사용자 수 확인
curl http://1.234.2.37:3013/api/test/users-count

# 상담사 수 확인
curl http://1.234.2.37:3013/api/test/consultants-count
```

## 🔐 4단계: 인증 API 테스트

### 4.1 회원가입 테스트
```bash
curl -X POST http://1.234.2.37:3013/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123!",
    "login_id": "testuser",
    "username": "테스트사용자",
    "nickname": "테스터",
    "phone": "010-1234-5678",
    "birth_date": "1990-01-01",
    "gender": "M",
    "policy": "Y"
  }'
```

### 4.2 로그인 테스트 (기존 사용자)
```bash
curl -X POST http://1.234.2.37:3013/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "loginId": "실제_사용자_ID",
    "password": "실제_비밀번호"
  }'

# 성공 시 JWT 토큰 반환
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "username": "사용자명"
    }
  }
}
```

### 4.3 토큰 검증 테스트
```bash
# 로그인에서 받은 토큰 사용
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://1.234.2.37:3013/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## 👨‍💼 5단계: 상담사 API 테스트

### 5.1 상담사 목록 조회
```bash
# 전체 상담사 목록
curl http://1.234.2.37:3013/api/consultants

# 필터링 테스트
curl "http://1.234.2.37:3013/api/consultants?page=1&limit=5&consultation_field=타로"

# 전문분야 목록
curl http://1.234.2.37:3013/api/specialties
```

### 5.2 상담사 상세 정보
```bash
# 특정 상담사 정보 (ID는 실제 존재하는 값 사용)
curl http://1.234.2.37:3013/api/consultants/1
```

## 💍 6단계: 링 시스템 테스트

### 6.1 링 잔액 조회 (인증 필요)
```bash
TOKEN="your_jwt_token_here"

curl -X GET http://1.234.2.37:3013/api/rings/balance \
  -H "Authorization: Bearer $TOKEN"
```

### 6.2 링 구매 테스트 (인증 필요)
```bash
curl -X POST http://1.234.2.37:3013/api/rings/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "charge_amount": 100,
    "payment_method": "card",
    "is_sajuring_pay": 0
  }'
```

## 📋 7단계: 기타 API 테스트

### 7.1 FAQ 및 이벤트
```bash
# FAQ 목록
curl http://1.234.2.37:3013/api/faq

# 이벤트 목록
curl http://1.234.2.37:3013/api/events
```

### 7.2 문의사항 등록
```bash
curl -X POST http://1.234.2.37:3013/api/inquiries \
  -H "Content-Type: application/json" \
  -d '{
    "title": "테스트 문의",
    "content": "서버 테스트용 문의사항입니다.",
    "contact_email": "test@example.com"
  }'
```

## 🧪 8단계: 성능 및 부하 테스트

### 8.1 응답 시간 측정
```bash
# curl로 응답 시간 측정
curl -w "@curl-format.txt" -o /dev/null -s http://1.234.2.37:3013/health

# curl-format.txt 내용:
#     time_namelookup:  %{time_namelookup}\n
#        time_connect:  %{time_connect}\n
#     time_appconnect:  %{time_appconnect}\n
#    time_pretransfer:  %{time_pretransfer}\n
#       time_redirect:  %{time_redirect}\n
#  time_starttransfer:  %{time_starttransfer}\n
#                     ----------\n
#          time_total:  %{time_total}\n
```

### 8.2 동시 접속 테스트 (Apache Bench)
```bash
# Apache Bench 설치 (로컬에서)
sudo apt install apache2-utils

# 100개 요청, 동시 접속 10개
ab -n 100 -c 10 http://1.234.2.37:3013/health

# 결과 분석: 응답 시간, 처리량, 오류율 확인
```

## 🔧 9단계: 모니터링 및 로그 분석

### 9.1 실시간 로그 모니터링
```bash
# PM2 실시간 로그
pm2 logs sajuring-api --lines 0

# 에러 로그만 확인
tail -f /home/sajuring-api/logs/error.log

# 전체 로그 확인
tail -f /home/sajuring-api/logs/combined.log
```

### 9.2 시스템 리소스 모니터링
```bash
# 시스템 상태 확인 스크립트 실행
/home/sajuring-api/status.sh

# 메모리 사용량
free -h

# CPU 사용량
top -p $(pgrep -f sajuring-api)

# 디스크 사용량
df -h
```

## 🚨 10단계: 오류 상황 테스트

### 10.1 잘못된 요청 테스트
```bash
# 잘못된 로그인 정보
curl -X POST http://1.234.2.37:3013/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "loginId": "wrong_user",
    "password": "wrong_password"
  }'

# 유효하지 않은 토큰
curl -X GET http://1.234.2.37:3013/api/auth/me \
  -H "Authorization: Bearer invalid_token"

# 존재하지 않는 상담사
curl http://1.234.2.37:3013/api/consultants/99999
```

### 10.2 입력 검증 테스트
```bash
# 필수 필드 누락
curl -X POST http://1.234.2.37:3013/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'

# 잘못된 이메일 형식
curl -X POST http://1.234.2.37:3013/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "password": "password123!"
  }'
```

## 📊 11단계: 테스트 결과 검증

### 11.1 성공 기준
- [ ] Health Check 응답 시간 < 500ms
- [ ] 데이터베이스 연결 성공
- [ ] 모든 주요 API 엔드포인트 정상 응답
- [ ] JWT 토큰 인증 정상 작동
- [ ] 에러 처리 적절한 HTTP 상태코드 반환
- [ ] 로그에 심각한 오류 없음

### 11.2 성능 기준
- [ ] API 응답 시간 < 200ms (평균)
- [ ] 동시 접속 10개 처리 가능
- [ ] 메모리 사용량 < 500MB
- [ ] CPU 사용률 < 30% (평상시)

## 🔄 12단계: 자동화된 테스트 스크립트

### 12.1 종합 테스트 스크립트 생성
```bash
# 서버에서 test-api.sh 파일 생성
nano /home/sajuring-api/test-api.sh
```

#### test-api.sh 내용
```bash
#!/bin/bash

BASE_URL="http://1.234.2.37:3013"
echo "=== 사주링 API 서버 테스트 시작 ==="

# 1. Health Check
echo "1. Health Check 테스트..."
curl -s $BASE_URL/health | jq .

# 2. 상담사 목록
echo "2. 상담사 목록 테스트..."
curl -s "$BASE_URL/api/consultants?limit=3" | jq '.data | length'

# 3. 전문분야 목록
echo "3. 전문분야 목록 테스트..."
curl -s $BASE_URL/api/specialties | jq .

# 4. FAQ 목록
echo "4. FAQ 목록 테스트..."
curl -s $BASE_URL/api/faq | jq '.data | length'

# 5. 이벤트 목록
echo "5. 이벤트 목록 테스트..."
curl -s $BASE_URL/api/events | jq '.data | length'

echo "=== 테스트 완료 ==="
```

### 12.2 스크립트 실행
```bash
# 실행 권한 부여
chmod +x /home/sajuring-api/test-api.sh

# jq 설치 (JSON 파싱용)
sudo apt install jq

# 테스트 실행
./test-api.sh
```

## 📝 13단계: 테스트 체크리스트

### 기본 기능 테스트
- [ ] 서버 시작 및 PM2 상태 정상
- [ ] Health Check API 응답
- [ ] 데이터베이스 연결 성공
- [ ] 포트 3013 정상 바인딩
- [ ] 방화벽 설정 확인

### API 기능 테스트
- [ ] 회원가입 API
- [ ] 로그인 API
- [ ] JWT 토큰 검증
- [ ] 상담사 목록 API
- [ ] 상담사 상세 API
- [ ] 전문분야 목록 API
- [ ] FAQ API
- [ ] 이벤트 API
- [ ] 문의사항 등록 API

### 보안 테스트
- [ ] 잘못된 인증 정보 처리
- [ ] 유효하지 않은 토큰 처리
- [ ] 입력 검증 (이메일, 필수 필드)
- [ ] SQL Injection 방지
- [ ] XSS 방지

### 성능 테스트
- [ ] 응답 시간 측정
- [ ] 동시 접속 처리
- [ ] 메모리 사용량 확인
- [ ] CPU 사용률 확인
- [ ] 로그 파일 크기 관리

## 🚨 문제 해결

### 자주 발생하는 문제
1. **포트 접근 불가**: 방화벽 설정 확인, PM2 상태 확인
2. **데이터베이스 연결 실패**: 네트워크 설정, 인증 정보 확인
3. **JWT 토큰 오류**: 시크릿 키 설정, 만료 시간 확인
4. **CORS 오류**: ALLOWED_ORIGINS 설정 확인

### 긴급 상황 대응
```bash
# 서비스 재시작
pm2 restart sajuring-api

# 로그 확인
pm2 logs sajuring-api --err

# 프로세스 강제 종료 후 재시작
pm2 delete sajuring-api
pm2 start ecosystem.config.js --env production
```

이 가이드를 통해 서버 배포 후 API의 모든 기능을 체계적으로 테스트할 수 있습니다.