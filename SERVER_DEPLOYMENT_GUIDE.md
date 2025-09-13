# 사주링 API 서버 배포 가이드

## 개요

이 문서는 1.234.2.37 서버에 sajuring-api 계정을 생성하고 Git을 통해 Node.js API를 배포하는 전체 과정을 설명합니다.

## 🖥️ 서버 환경 준비

### 1. 서버 접속
```bash
# root 또는 sudo 권한이 있는 계정으로 접속
ssh root@1.234.2.37
# 또는
ssh admin@1.234.2.37
```

### 2. 시스템 업데이트
```bash
sudo apt update && sudo apt upgrade -y
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

```bash
# NodeSource 저장소 추가
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Node.js 설치
sudo apt-get install -y nodejs

# 버전 확인
node --version
npm --version
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
git config --global user.name "sajuring-api"
git config --global user.email "sajuring-api@sajuring.com"

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

# 프로젝트 디렉토리 생성
mkdir -p projects/sajuring-api
mkdir -p logs
mkdir -p backups

# 디렉토리 구조 확인
tree /home/sajuring-api
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
ssh-keygen -t rsa -b 4096 -C "sajuring-api@sajuring.com"

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

### 1. Git 저장소 클론
```bash
# 프로젝트 디렉토리로 이동
cd /home/sajuring-api/projects

# 저장소 클론 (HTTPS 방식)
git clone https://github.com/your-username/sajuring-api.git

# 또는 SSH 방식 (SSH 키 설정 후)
git clone git@github.com:your-username/sajuring-api.git

# 디렉토리 이동
cd sajuring-api
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
cd /home/sajuring-api/projects/sajuring-api

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

# 네트워크 연결 테스트
telnet 1.234.2.37 3306

# 외부 MySQL 서버이므로 로컬 MySQL 서비스는 확인하지 않음
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
curl http://1.234.2.37:3013/health

# 3. 로그 확인
pm2 logs sajuring-api

# 4. 시스템 리소스 확인
./status.sh
```

이제 1.234.2.37 서버에 sajuring-api가 성공적으로 배포되었습니다! 🚀