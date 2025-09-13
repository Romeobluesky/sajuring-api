# 환경별 설정 가이드

## 개요

이 문서는 개발환경, 테스트환경, 운영환경별로 올바른 IP와 포트 설정 방법을 설명합니다.

## 🏠 개발환경 (localhost)

### API 서버 설정 (.env.development)
```env
# Database
DB_HOST=1.234.2.37
DB_PORT=3306
DB_NAME=sajuring_db
DB_USER=sajuring2025
DB_PASSWORD="!@#sajuring2025"

# JWT
JWT_SECRET=sajuring-super-secret-jwt-key-2025
JWT_EXPIRES_IN=24h

# Server (개발용)
PORT=3013
NODE_ENV=development

# CORS (개발용)
ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3013,http://127.0.0.1:3013
```

### Flutter 앱 설정 (개발용)
```dart
// lib/services/api_service.dart
class ApiService {
  // 개발환경용 URL
  static const String baseUrl = 'http://10.0.2.2:3013/api'; // Android Emulator
  // static const String baseUrl = 'http://localhost:3013/api'; // iOS Simulator
  // static const String baseUrl = 'http://127.0.0.1:3013/api'; // 로컬 테스트
}
```

## 🖥️ 서버환경 (1.234.2.37)

### 1. 포트 확인 및 선택

#### 사용 가능한 포트 확인
```bash
# 서버에 접속하여 사용 중인 포트 확인
ssh sajuring-api@1.234.2.37
sudo netstat -tlnp | grep LISTEN

# 포트 사용 여부 확인
sudo lsof -i :3013
sudo lsof -i :3014
sudo lsof -i :3003
```

#### 권장 포트 설정
```bash
# 사주링 서비스 포트 구성
# 3003 - 웹사이트
# 3013 - REST API 서버
# 3014 - 관리자 페이지

# REST API 서버 포트
PORT=3013
```

### 2. API 서버 설정 (.env.production)
```env
# Database (동일)
DB_HOST=1.234.2.37
DB_PORT=3306
DB_NAME=sajuring_db
DB_USER=sajuring2025
DB_PASSWORD="!@#sajuring2025"

# JWT (운영용 - 더 강화 권장)
JWT_SECRET=sajuring-super-secret-jwt-key-2025-production-v1
JWT_EXPIRES_IN=24h

# Server (운영용)
PORT=3013
NODE_ENV=production

# CORS (운영용)
ALLOWED_ORIGINS=http://1.234.2.37:3013,https://sajuring.com,https://api.sajuring.com,http://10.0.2.2:3013
```

### 3. PM2 설정 (ecosystem.config.js)
```javascript
module.exports = {
  apps: [{
    name: 'sajuring-api',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3013
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3013  // 서버 포트로 변경
    },
    log_file: '/home/sajuring-api/logs/combined.log',
    out_file: '/home/sajuring-api/logs/out.log',
    error_file: '/home/sajuring-api/logs/error.log',
    time: true
  }]
};
```

### 4. 방화벽 설정
```bash
# 새 포트 열기
sudo ufw allow 3013

# 기존 포트 확인
sudo ufw status

# 불필요한 포트 제거 (필요시)
# sudo ufw delete allow 8080
```

## 📱 Flutter 앱 환경별 설정

### 1. 환경별 설정 파일 생성

#### lib/config/environment.dart
```dart
enum Environment { development, staging, production }

class EnvironmentConfig {
  static const Environment currentEnvironment = Environment.development;
  
  static String get baseUrl {
    switch (currentEnvironment) {
      case Environment.development:
        return 'http://10.0.2.2:3013/api'; // 로컬 개발
      case Environment.staging:
        return 'http://1.234.2.37:3013/api'; // 테스트 서버
      case Environment.production:
        return 'https://api.sajuring.com/api'; // 운영 서버
    }
  }
  
  static bool get isProduction => currentEnvironment == Environment.production;
  static bool get isDevelopment => currentEnvironment == Environment.development;
}
```

#### lib/services/api_service.dart (수정)
```dart
import '../config/environment.dart';

class ApiService {
  static String get baseUrl => EnvironmentConfig.baseUrl;
  
  // 환경별 디버깅
  static void debugPrint(String message) {
    if (EnvironmentConfig.isDevelopment) {
      print('[API] $message');
    }
  }
}
```

### 2. 빌드별 환경 설정

#### android/app/build.gradle (Android용)
```gradle
android {
    buildTypes {
        debug {
            buildConfigField "String", "API_BASE_URL", '"http://10.0.2.2:3013/api"'
        }
        release {
            buildConfigField "String", "API_BASE_URL", '"http://1.234.2.37:3013/api"'
        }
    }
}
```

## 🔄 환경 전환 방법

### 1. API 서버 환경 전환
```bash
# 개발환경
npm run dev

# 운영환경 (PM2)
pm2 start ecosystem.config.js --env production

# 환경 확인
pm2 describe sajuring-api
```

### 2. Flutter 앱 환경 전환
```dart
// environment.dart에서 currentEnvironment 값 변경
static const Environment currentEnvironment = Environment.production;
```

### 3. 배포 시 자동 환경 설정
```bash
# deploy.sh 수정
#!/bin/bash

# 환경 설정
ENV=${1:-production}

log "🔧 환경 설정: $ENV"

# .env 파일 복사
if [ "$ENV" = "production" ]; then
    cp .env.production .env
elif [ "$ENV" = "staging" ]; then
    cp .env.staging .env
else
    cp .env.development .env
fi

# PM2 시작
pm2 start ecosystem.config.js --env $ENV
```

## 🌐 도메인 사용 시 설정 (선택사항)

### 1. 도메인이 있는 경우
```env
# API 서버
ALLOWED_ORIGINS=https://sajuring.com,https://app.sajuring.com,https://api.sajuring.com,http://1.234.2.37:3013

# Flutter 앱
static const String baseUrl = 'https://api.sajuring.com/api';
```

### 2. SSL 인증서 설정 (Nginx 사용)
```nginx
# /etc/nginx/sites-available/sajuring-api
server {
    listen 80;
    server_name api.sajuring.com;
    
    location / {
        proxy_pass http://localhost:3013;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 📋 체크리스트

### 서버 배포 전 확인사항
- [ ] 서버에서 사용할 포트 결정 (예: 3013)
- [ ] 방화벽에서 해당 포트 열기
- [ ] .env.production 파일 생성
- [ ] PM2 설정에서 포트 변경
- [ ] CORS 설정에 서버 IP 추가

### Flutter 앱 수정사항
- [ ] baseUrl을 서버 IP:포트로 변경
- [ ] 환경별 설정 파일 생성
- [ ] 네트워크 보안 정책 설정 (Android)
- [ ] 개발/운영 환경 분리

### 테스트 확인사항
- [ ] API 서버가 정상 실행되는지 확인
- [ ] Health Check API 호출 테스트
- [ ] Flutter 앱에서 API 호출 테스트
- [ ] CORS 오류 없는지 확인

## 🚨 주의사항

1. **보안**: 운영환경에서는 HTTPS 사용 권장
2. **포트**: 표준 포트(80, 443) 사용 시 관리자 권한 필요
3. **방화벽**: 필요한 포트만 열고 나머지는 차단
4. **환경변수**: 민감한 정보는 환경변수로 관리
5. **로그**: 운영환경에서는 디버그 로그 비활성화

## 🔧 빠른 설정 명령어

### 서버 포트 3013으로 설정하는 경우
```bash
# 1. 포트 확인
sudo lsof -i :3013

# 2. 방화벽 설정
sudo ufw allow 3013

# 3. .env 파일 수정
sed -i 's/PORT=3001/PORT=3013/' .env

# 4. CORS 설정 추가
echo "ALLOWED_ORIGINS=http://1.234.2.37:3013,http://10.0.2.2:3013" >> .env

# 5. PM2 재시작
pm2 restart sajuring-api
```

이제 환경별로 올바른 설정을 사용할 수 있습니다! 🚀