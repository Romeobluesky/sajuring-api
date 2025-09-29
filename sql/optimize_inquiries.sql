-- inquiries 테이블 성능 최적화를 위한 인덱스 추가
-- 2025-09-29 업데이트

-- 1. 문의 상태별 조회 최적화
CREATE INDEX idx_inquiries_state ON inquiries(inquiries_state);

-- 2. 문의 유형별 조회 최적화
CREATE INDEX idx_inquiries_type ON inquiries(inquiries_type);

-- 3. 생성일자 기준 정렬 최적화 (최신순 조회용)
CREATE INDEX idx_inquiries_created_at ON inquiries(created_at DESC);

-- 4. 사용자별 문의사항 조회 최적화
CREATE INDEX idx_inquiries_user_id ON inquiries(user_id);

-- 5. 복합 인덱스: 사용자별 + 상태별 조회 (가장 빈번한 쿼리)
CREATE INDEX idx_inquiries_user_state ON inquiries(user_id, inquiries_state);

-- 6. 복합 인덱스: 사용자별 + 생성일자 (내 문의사항 최신순)
CREATE INDEX idx_inquiries_user_created ON inquiries(user_id, created_at DESC);

-- 7. 답변 완료 시간 기준 조회 최적화
CREATE INDEX idx_inquiries_answer_at ON inquiries(inquiries_answer_at);

-- 인덱스 생성 확인 쿼리
-- SHOW INDEX FROM inquiries;

-- 쿼리 성능 테스트 (EXPLAIN 사용)
-- EXPLAIN SELECT * FROM inquiries WHERE user_id = 1 AND inquiries_state = 'pending' ORDER BY created_at DESC LIMIT 10;
-- EXPLAIN SELECT * FROM inquiries WHERE inquiries_type = 'general' ORDER BY created_at DESC LIMIT 20;
-- EXPLAIN SELECT COUNT(*) FROM inquiries WHERE inquiries_state = 'answered' AND inquiries_answer_at > '2025-01-01';