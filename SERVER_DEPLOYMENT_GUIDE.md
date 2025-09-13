# 사주링 API 서버 배포 가이드

## 개요

이 문서는 이미 운영 중인 1.234.2.37 서버에 sajuring-api 계정을 추가하여 Node.js REST API를 배포하는 과정을 설명합니다.

## 🖥️ 서버 현재 환경

**기존 운영 서비스:**
- **nginx**: 웹서버 실행 중
- **mysql**: 데이터베이스 서버 실행 중
- **sajuring-www**: 웹사이트 (포트 3003, PM2 관리)
- **sajuring-admin**: 관리자 시스템 (포트 3014, PM2 관리)

**추가 배포 대상:**
- **sajuring-api**: REST API 서버 (포트 3013, PM2 관리)

## 🖥️ 서버 접속

### 1. 서버 접속
```bash
# 기존 관리자 계정으로 접속 (nginx, mysql 이미 운영 중)
ssh admin@1.234.2.37
```

### 2. 현재 서비스 상태 확인
```bash
# nginx 상태 확인
sudo systemctl status nginx

# mysql 상태 확인
sudo systemctl status mysql

# 기존 PM2 프로세스 확인
sudo su - sajuring-www -c "pm2 status"
sudo su - sajuring-admin -c "pm2 status"

# 포트 사용 현황 확인
sudo netstat -tlnp | grep -E ":(3003|3013|3014)"
```

## 👤 sajuring-api 계정 생성

### 1. 사용자 계정 생성
```bash
# 계정 생성
sudo adduser sajuring-api
```

### 2. 비밀번호 설정
```bash
sudo passwd sajuring-api
# 강력한 비밀번호 입력 (예: SajuringAPI2025!@#)
```

### 3. sudo 권한 부여 (필요시)
```bash
# sudo 그룹에 추가
sudo usermod -aG sudo sajuring-api

# 또는 sudoers 파일 직접 편집
sudo visudo
# 다음 라인 추가
# sajuring-api ALL=(ALL:ALL) ALL
```

### 4. 계정 전환 및 확인
```bash
# 계정 전환
su - sajuring-api

# 홈 디렉토리 확인
pwd
# 결과: /home/sajuring-api

# sudo 권한 확인 (권한을 부여한 경우)
sudo whoami
```

## 🔧 개발 환경 설정

### 1. Node.js 설치

#### 방법 1: NodeSource를 통한 설치 (권장)
```bash
# NodeSource 저장소 추가
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Node.js 설치
sudo apt-get install -y nodejs

# 버전 확인
node --version
npm --version
```

#### 방법 2: NVM을 통한 설치
```bash
# NVM 설치
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 터미널 재시작 또는 source 명령
source ~/.bashrc

# 최신 LTS Node.js 설치
nvm install --lts
nvm use --lts

# 기본 버전으로 설정
nvm alias default node
```

### 2. PM2 설치 (프로세스 관리자)
```bash
# PM2 전역 설치
sudo npm install -g pm2

# PM2 버전 확인
pm2 --version
```

### 3. Git 설치 및 설정
```bash
# Git 설치
sudo apt install git -y

# Git 설정
git config --global user.name "Romeobluesky"
git config --global user.email "romeobluesky@gmail.com"

# 설정 확인
git config --list
```

### 4. 기타 필요한 도구 설치
```bash
# 개발 도구 설치
sudo apt install -y curl wget unzip build-essential

# MySQL 클라이언트 설치 (DB 연결 테스트용)
sudo apt install -y mysql-client
```

## 📁 프로젝트 디렉토리 구조 생성

### 1. 기본 디렉토리 생성
```bash
# sajuring-api 계정으로 작업
cd /home/sajuring-api

# 운영 관련 디렉토리 생성
mkdir -p logs
mkdir -p backups

# 디렉토리 구조 확인
ls -la /home/sajuring-api
```

### 2. 로그 디렉토리 권한 설정
```bash
# 로그 디렉토리 권한 설정
chmod 755 /home/sajuring-api/logs
chmod 755 /home/sajuring-api/backups
```

## 🔑 SSH 키 설정 (Git 접근용)

### 1. SSH 키 생성
```bash
# SSH 키 생성
ssh-keygen -t rsa -b 4096 -C "romeobluesky@gmail.com"

# 기본 경로 사용: /home/sajuring-api/.ssh/id_rsa
# 패스프레이즈는 선택사항
```

### 2. SSH 키 확인
```bash
# 공개키 확인
cat ~/.ssh/id_rsa.pub

# 개인키 확인 (보안 주의)
ls -la ~/.ssh/
```

### 3. GitHub/GitLab에 SSH 키 등록
```bash
# 공개키 복사
cat ~/.ssh/id_rsa.pub
# 이 내용을 GitHub/GitLab의 SSH Keys에 등록
```

## 📦 Git 저장소 설정 및 배포

### 1. Git 저장소 설정
```bash
# sajuring-api 홈 디렉토리로 이동
cd /home/sajuring-api

# Git 초기화
git init

# 원격 저장소 추가
git remote add origin https://github.com/Romeobluesky/sajuring-api.git

# 원격 저장소 확인
git remote -v

# 최신 코드 가져오기
git pull origin main
```

### 2. 환경 변수 파일 생성
```bash
# .env 파일 생성
cp .env.example .env  # 예제 파일이 있는 경우
# 또는
nano .env
```

#### .env 파일 내용
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

# Server
PORT=3013
NODE_ENV=production

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://10.0.2.2:3000,https://yourdomain.com
```

### 3. 의존성 설치
```bash
# npm 패키지 설치
npm install

# 또는 production only
npm install --production
```

### 4. 데이터베이스 연결 테스트
```bash
# 데이터베이스 연결 테스트
npm run test:db

# MySQL 직접 연결 테스트
mysql -h 1.234.2.37 -P 3306 -u sajuring2025 -p sajuring_db
```

## 🚀 PM2를 이용한 애플리케이션 배포

### 1. PM2 설정 파일 생성
```bash
# ecosystem.config.js 파일 생성
nano ecosystem.config.js
```

#### ecosystem.config.js 내용
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
      PORT: 3013
    },
    log_file: '/home/sajuring-api/logs/combined.log',
    out_file: '/home/sajuring-api/logs/out.log',
    error_file: '/home/sajuring-api/logs/error.log',
    time: true
  }]
};
```

### 2. PM2로 애플리케이션 시작
```bash
# 프로덕션 모드로 시작
pm2 start ecosystem.config.js --env production

# 애플리케이션 상태 확인
pm2 status

# 로그 확인
pm2 logs sajuring-api

# 실시간 모니터링
pm2 monit
```

### 3. PM2 자동 시작 설정
```bash
# 시스템 부팅 시 PM2 자동 시작 설정
pm2 startup

# 현재 실행 중인 앱들을 자동 시작 목록에 저장
pm2 save
```

## 🔄 자동 배포 스크립트 생성

### 1. 배포 스크립트 생성
```bash
# 배포 스크립트 생성
nano /home/sajuring-api/deploy.sh
```

#### deploy.sh 내용
```bash
#!/bin/bash

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 로그 함수
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

# 배포 시작
log "🚀 Sajuring API 배포 시작"

# 프로젝트 디렉토리로 이동
cd /home/sajuring-api/sajuring-api

# Git 상태 확인
log "📋 Git 상태 확인"
git status

# 백업 생성
log "💾 현재 버전 백업"
BACKUP_DIR="/home/sajuring-api/backups/$(date +'%Y%m%d_%H%M%S')"
mkdir -p $BACKUP_DIR
cp -r . $BACKUP_DIR/
log "백업 완료: $BACKUP_DIR"

# 최신 코드 가져오기
log "📥 최신 코드 가져오기"
git pull origin main

if [ $? -ne 0 ]; then
    error "Git pull 실패"
    exit 1
fi

# 의존성 업데이트
log "📦 의존성 업데이트"
npm install

if [ $? -ne 0 ]; then
    error "npm install 실패"
    exit 1
fi

# 데이터베이스 연결 테스트
log "🔍 데이터베이스 연결 테스트"
npm run test:db

if [ $? -ne 0 ]; then
    warn "데이터베이스 연결 테스트 실패 - 계속 진행"
fi

# PM2 재시작
log "🔄 애플리케이션 재시작"
pm2 restart sajuring-api

if [ $? -ne 0 ]; then
    error "PM2 재시작 실패"
    exit 1
fi

# 배포 완료 확인
sleep 5
pm2 status sajuring-api

log "✅ 배포 완료!"
log "📊 애플리케이션 상태 확인: pm2 status"
log "📋 로그 확인: pm2 logs sajuring-api"
```

### 2. 스크립트 실행 권한 부여
```bash
chmod +x /home/sajuring-api/deploy.sh
```

### 3. 배포 실행
```bash
# 배포 스크립트 실행
./deploy.sh

# 또는 절대 경로로
/home/sajuring-api/deploy.sh
```

## 🔥 방화벽 및 포트 설정

### 1. 방화벽 설정 (Ubuntu UFW)
```bash
# UFW 상태 확인
sudo ufw status

# 필요한 포트 열기
sudo ufw allow 22      # SSH
sudo ufw allow 3013    # API 서버
sudo ufw allow 3306    # MySQL (로컬 접근만 필요한 경우 생략)

# 방화벽 활성화
sudo ufw enable

# 상태 재확인
sudo ufw status verbose
```

### 2. 포트 사용 확인
```bash
# 포트 사용 상태 확인
sudo netstat -tlnp | grep :3013

# 또는
sudo ss -tlnp | grep :3013
```

### 3. nginx 프록시 설정 (선택사항)
```bash
# nginx 설정 파일 생성 (기존 nginx 활용)
sudo nano /etc/nginx/sites-available/sajuring-api
```

#### nginx 설정 예시 (sajuring-api)
```nginx
server {
    listen 80;
    server_name api.sajuring.co.kr;

    location / {
        proxy_pass http://localhost:3013;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. nginx 설정 활성화
```bash
# nginx 설정 파일 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/sajuring-api /etc/nginx/sites-enabled/

# nginx 설정 테스트
sudo nginx -t

# nginx 재시작
sudo systemctl reload nginx
```

## 🔒 SSL/HTTPS 설정 (Let's Encrypt)

### 1. Certbot 상태 확인 (이미 설치되어 있음)
```bash
# Certbot 설치 여부 확인
certbot --version

# 기존 인증서 목록 확인
sudo certbot certificates

# 기존 도메인들 확인
sudo ls -la /etc/letsencrypt/live/
```

### 2. sajuring-api용 도메인 SSL 인증서 발급
```bash
# 새 도메인용 SSL 인증서 발급
sudo certbot --nginx -d api.sajuring.co.kr

# 또는 기존 도메인에 서브도메인 추가
sudo certbot --nginx -d sajuring.co.kr -d www.sajuring.co.kr -d admin.sajuring.co.kr -d api.sajuring.co.kr

# 인증서 발급 확인
sudo certbot certificates
```

### 3. nginx SSL 설정 업데이트
Certbot이 자동으로 nginx 설정을 업데이트하지만, 수동 설정이 필요한 경우:

```bash
# nginx 설정 파일 수정
sudo nano /etc/nginx/sites-available/sajuring-api
```

#### SSL이 적용된 nginx 설정 예시
```nginx
server {
    listen 80;
    server_name api.sajuring.co.kr;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.sajuring.co.kr;

    # SSL 인증서 경로 (Certbot이 자동 생성)
    ssl_certificate /etc/letsencrypt/live/api.sajuring.co.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.sajuring.co.kr/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # API 서버 프록시
    location / {
        proxy_pass http://localhost:3013;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # CORS 헤더 (API용)
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;
        
        # Preflight 요청 처리
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
            add_header 'Access-Control-Max-Age' 1728000;
            add_header 'Content-Type' 'text/plain; charset=utf-8';
            add_header 'Content-Length' 0;
            return 204;
        }
    }

    # 보안 헤더
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
}
```

### 4. SSL 설정 적용
```bash
# nginx 설정 테스트
sudo nginx -t

# nginx 재시작
sudo systemctl reload nginx

# SSL 인증서 상태 확인
sudo certbot certificates

# 방화벽에 HTTPS 포트 허용
sudo ufw allow 443
```

### 5. SSL 인증서 자동 갱신 확인
```bash
# 자동 갱신 설정 확인 (이미 설정되어 있을 것)
sudo systemctl status certbot.timer

# 갱신 테스트 (실제 갱신하지 않고 테스트만)
sudo certbot renew --dry-run

# cron 작업 확인
sudo crontab -l | grep certbot
```

### 6. HTTPS API 테스트
```bash
# HTTPS로 Health Check 테스트
curl https://api.sajuring.co.kr/health

# 또는 IP로 테스트 (SNI 사용)
curl -H "Host: api.sajuring.co.kr" https://1.234.2.37/health

# SSL 인증서 정보 확인
openssl s_client -connect api.sajuring.co.kr:443 -servername api.sajuring.co.kr
```

### 7. Flutter 앱에서 HTTPS API 사용
Flutter 앱의 API 베이스 URL을 HTTPS로 업데이트:

```dart
// lib/services/api_service.dart
class ApiService {
  // 개발환경
  static const String baseUrlDev = 'http://10.0.2.2:3013/api';
  
  // 프로덕션 환경 (HTTPS)
  static const String baseUrlProd = 'https://api.sajuring.co.kr/api';
  
  static String get baseUrl {
    return kDebugMode ? baseUrlDev : baseUrlProd;
  }
}
```

### 8. 혼합 환경 테스트
```bash
# HTTP와 HTTPS 모두 테스트
echo "HTTP 테스트:"
curl http://1.234.2.37:3013/health

echo "HTTPS 테스트 (도메인):"
curl https://api.sajuring.co.kr/health

echo "HTTPS 리다이렉션 테스트:"
curl -I http://api.sajuring.co.kr/health
```

## 🔍 서비스 상태 모니터링

### 1. 시스템 상태 확인 스크립트
```bash
# 상태 확인 스크립트 생성
nano /home/sajuring-api/status.sh
```

#### status.sh 내용
```bash
#!/bin/bash

echo "=== Sajuring API 서버 상태 ==="
echo "날짜: $(date)"
echo ""

echo "🖥️  시스템 정보:"
echo "CPU 사용률: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')"
echo "메모리 사용률: $(free | grep Mem | awk '{printf("%.2f%%", $3/$2 * 100.0)}')"
echo "디스크 사용률: $(df -h / | awk 'NR==2{printf "%s", $5}')"
echo ""

echo "🚀 PM2 상태:"
pm2 status
echo ""

echo "📊 프로세스 정보:"
ps aux | grep "sajuring-api" | grep -v grep
echo ""

echo "🌐 네트워크 상태:"
sudo netstat -tlnp | grep :3013
echo ""

echo "📋 최근 로그 (마지막 10줄):"
tail -10 /home/sajuring-api/logs/combined.log
```

### 2. 실행 권한 부여
```bash
chmod +x /home/sajuring-api/status.sh
```

## 📝 로그 관리

### 1. 로그 로테이션 설정
```bash
# logrotate 설정 파일 생성
sudo nano /etc/logrotate.d/sajuring-api
```

#### logrotate 설정 내용
```
/home/sajuring-api/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 sajuring-api sajuring-api
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 2. 로그 확인 명령어
```bash
# 실시간 로그 확인
pm2 logs sajuring-api --lines 100

# 에러 로그만 확인
tail -f /home/sajuring-api/logs/error.log

# 전체 로그 확인
tail -f /home/sajuring-api/logs/combined.log
```

## 🔄 자동 업데이트 설정 (선택사항)

### 1. Cron을 이용한 자동 배포
```bash
# crontab 편집
crontab -e

# 매일 새벽 2시에 자동 배포 (선택사항)
# 0 2 * * * /home/sajuring-api/deploy.sh >> /home/sajuring-api/logs/deploy.log 2>&1
```

### 2. Webhook을 이용한 자동 배포 (고급)
```bash
# webhook 스크립트 생성
nano /home/sajuring-api/webhook.js
```

## 🔧 문제 해결

### 자주 발생하는 문제들

1. **포트가 이미 사용 중**
```bash
# 포트 사용 프로세스 확인
sudo lsof -i :3013

# 프로세스 종료
sudo kill -9 PID
```

2. **권한 문제**
```bash
# 파일 소유권 변경
sudo chown -R sajuring-api:sajuring-api /home/sajuring-api

# 실행 권한 부여
chmod +x /home/sajuring-api/*.sh
```

3. **Git 권한 문제**
```bash
# SSH 에이전트 시작
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa

# SSH 연결 테스트
ssh -T git@github.com
```

4. **데이터베이스 연결 실패**
```bash
# 방화벽 확인
sudo ufw status

# MySQL 서비스 상태 확인
sudo systemctl status mysql

# 네트워크 연결 테스트
telnet 1.234.2.37 3306
```

## 📋 배포 완료 체크리스트

### 서버 설정
- [ ] sajuring-api 계정 생성
- [ ] Node.js 설치 및 확인
- [ ] PM2 설치 및 설정
- [ ] Git 설치 및 SSH 키 설정
- [ ] 방화벽 포트 설정

### 애플리케이션 배포
- [ ] Git 저장소 클론
- [ ] .env 파일 설정
- [ ] 의존성 설치
- [ ] 데이터베이스 연결 테스트
- [ ] PM2로 애플리케이션 시작
- [ ] 자동 시작 설정

### 모니터링 및 관리
- [ ] 로그 설정 및 로테이션
- [ ] 배포 스크립트 작성
- [ ] 상태 모니터링 스크립트
- [ ] 백업 시스템 구축

## 🎉 배포 완료 후 확인

```bash
# 1. 서비스 상태 확인
pm2 status

# 2. API 응답 테스트
curl http://1.234.2.37:3001/health

# 3. 로그 확인
pm2 logs sajuring-api

# 4. 시스템 리소스 확인
./status.sh
```

이제 1.234.2.37 서버에 sajuring-api가 성공적으로 배포되었습니다! 🚀