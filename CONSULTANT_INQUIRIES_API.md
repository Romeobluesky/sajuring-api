# Consultant Inquiries API Documentation

상담사 전용 문의사항 API 엔드포인트

## Base URL
```
/api/consultant-inquiries
```

## Authentication
모든 엔드포인트는 JWT 토큰 인증이 필요합니다.
```
Authorization: Bearer <token>
```

## Database Schema

```sql
consultant_inquiries
├── id (int, PK, auto_increment)
├── user_id (int, FK to users.id)
├── consultant_id (int, FK to consultants.consultant_number)
├── nickname (varchar(50))
├── content (varchar(30)) - 문의 내용
├── status (enum: 'pending', 'answered')
├── reply_content (text) - 관리자 답변
├── replied_at (timestamp)
├── created_at (timestamp)
├── updated_at (timestamp)
└── created_date (date, generated)
```

## API Endpoints

### 1. 상담사 문의사항 등록
**POST** `/api/consultant-inquiries`

**권한**: CONSULTANT

**Request Body**:
```json
{
  "content": "문의 내용 (최대 30자)"
}
```

**Response** (201):
```json
{
  "success": true,
  "message": "문의사항이 등록되었습니다.",
  "data": {
    "inquiry": {
      "id": 1,
      "consultant_id": 123,
      "nickname": "홍길동",
      "content": "문의 내용",
      "status": "pending"
    }
  }
}
```

**Error Responses**:
- `400`: 문의 내용 누락 또는 30자 초과
- `404`: 상담사 정보를 찾을 수 없음

---

### 2. 내 상담사 문의사항 목록 조회
**GET** `/api/consultant-inquiries`

**권한**: CONSULTANT

**Query Parameters**:
- `status` (optional): pending | answered
- `page` (optional, default: 1)
- `limit` (optional, default: 10)

**Response** (200):
```json
{
  "success": true,
  "message": "상담사 문의사항 목록 조회 완료",
  "data": {
    "inquiries": [
      {
        "id": 1,
        "consultant_id": 123,
        "nickname": "홍길동",
        "content": "문의 내용",
        "status": "pending",
        "reply_content": null,
        "replied_at": null,
        "created_at": "2025-10-01T12:00:00.000Z",
        "updated_at": "2025-10-01T12:00:00.000Z"
      }
    ],
    "filters": {
      "status": "pending"
    }
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "totalPages": 2
  }
}
```

---

### 3. 모든 상담사 문의사항 목록 조회 (관리자 전용)
**GET** `/api/consultant-inquiries/all`

**권한**: ADMIN

**Query Parameters**:
- `status` (optional): pending | answered
- `consultant_id` (optional): 특정 상담사 필터링
- `page` (optional, default: 1)
- `limit` (optional, default: 10)

**Response** (200):
```json
{
  "success": true,
  "message": "전체 상담사 문의사항 목록 조회 완료",
  "data": {
    "inquiries": [
      {
        "id": 1,
        "user_id": 10,
        "consultant_id": 123,
        "nickname": "홍길동",
        "content": "문의 내용",
        "status": "pending",
        "reply_content": null,
        "replied_at": null,
        "created_at": "2025-10-01T12:00:00.000Z",
        "updated_at": "2025-10-01T12:00:00.000Z",
        "consultant_stage_name": "타로마스터",
        "consultant_email": "consultant@example.com",
        "consultant_phone": "010-1234-5678"
      }
    ],
    "filters": {
      "status": "pending",
      "consultant_id": null
    }
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  }
}
```

---

### 4. 상담사 문의사항 상세보기
**GET** `/api/consultant-inquiries/:id`

**권한**: CONSULTANT (본인), ADMIN

**Response** (200):
```json
{
  "success": true,
  "message": "상담사 문의사항 상세 조회 완료",
  "data": {
    "inquiry": {
      "id": 1,
      "user_id": 10,
      "consultant_id": 123,
      "nickname": "홍길동",
      "content": "문의 내용",
      "status": "answered",
      "reply_content": "답변 내용입니다.",
      "replied_at": "2025-10-01T15:00:00.000Z",
      "created_at": "2025-10-01T12:00:00.000Z",
      "updated_at": "2025-10-01T15:00:00.000Z",
      "consultant_stage_name": "타로마스터",
      "consultant_email": "consultant@example.com",
      "consultant_phone": "010-1234-5678"
    }
  }
}
```

**Error Responses**:
- `404`: 문의사항을 찾을 수 없음

---

### 5. 상담사 문의사항 수정
**PUT** `/api/consultant-inquiries/:id`

**권한**: CONSULTANT (본인만)

**Request Body**:
```json
{
  "content": "수정된 문의 내용 (최대 30자)"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "문의사항이 수정되었습니다.",
  "data": {
    "inquiry": {
      "id": 1,
      "consultant_id": 123,
      "nickname": "홍길동",
      "content": "수정된 문의 내용",
      "status": "pending",
      "updated_at": "2025-10-01T13:00:00.000Z"
    }
  }
}
```

**Error Responses**:
- `400`: 답변이 완료된 문의사항은 수정 불가
- `400`: 문의 내용 누락 또는 30자 초과
- `404`: 문의사항을 찾을 수 없음

---

### 6. 상담사 문의사항 삭제
**DELETE** `/api/consultant-inquiries/:id`

**권한**: CONSULTANT (본인만)

**Response** (200):
```json
{
  "success": true,
  "message": "문의사항이 삭제되었습니다."
}
```

**Error Responses**:
- `400`: 답변이 완료된 문의사항은 삭제 불가
- `404`: 문의사항을 찾을 수 없음

---

### 7. 상담사 문의사항 답변 등록 (관리자 전용)
**PUT** `/api/consultant-inquiries/:id/reply`

**권한**: ADMIN

**Request Body**:
```json
{
  "reply_content": "관리자 답변 내용입니다."
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "답변이 등록되었습니다.",
  "data": {
    "inquiry": {
      "id": 1,
      "consultant_id": 123,
      "nickname": "홍길동",
      "content": "문의 내용",
      "status": "answered",
      "reply_content": "관리자 답변 내용입니다.",
      "replied_at": "2025-10-01T15:00:00.000Z",
      "updated_at": "2025-10-01T15:00:00.000Z",
      "consultant_stage_name": "타로마스터"
    }
  }
}
```

**Error Responses**:
- `400`: 답변 내용 누락
- `404`: 문의사항을 찾을 수 없음

---

### 8. 내 상담사 문의사항 통계
**GET** `/api/consultant-inquiries/stats/summary`

**권한**: CONSULTANT

**Response** (200):
```json
{
  "success": true,
  "message": "상담사 문의사항 통계 조회 완료",
  "data": {
    "summary": {
      "pending": 5,
      "answered": 10,
      "total": 15
    }
  }
}
```

---

## Status Codes

- `200`: 성공
- `201`: 생성 성공
- `400`: 잘못된 요청
- `401`: 인증 실패
- `403`: 권한 없음
- `404`: 리소스를 찾을 수 없음
- `500`: 서버 오류

## Notes

1. **상담사 전용**: 이 API는 CONSULTANT 역할을 가진 사용자만 사용할 수 있습니다.
2. **문의 내용 제한**: content 필드는 최대 30자까지만 허용됩니다.
3. **수정/삭제 제한**: 답변이 완료된 문의사항은 수정 및 삭제가 불가능합니다.
4. **관리자 답변**: 답변은 관리자(ADMIN)만 등록할 수 있습니다.
5. **자동 매핑**: user_id와 consultant_id는 JWT 토큰에서 자동으로 매핑됩니다.

## Example Usage

### 상담사 문의 등록
```bash
curl -X POST http://localhost:3013/api/consultant-inquiries \
  -H "Authorization: Bearer <consultant_token>" \
  -H "Content-Type: application/json" \
  -d '{"content": "정산 관련 문의드립니다."}'
```

### 내 문의사항 조회
```bash
curl -X GET "http://localhost:3013/api/consultant-inquiries?status=pending&page=1&limit=10" \
  -H "Authorization: Bearer <consultant_token>"
```

### 관리자 답변 등록
```bash
curl -X PUT http://localhost:3013/api/consultant-inquiries/1/reply \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"reply_content": "정산은 매월 5일에 진행됩니다."}'
```
