# API 명세 (초도 구현 기준)

> 관련: [PRD.md](PRD.md) · [USER_FLOWS.md](USER_FLOWS.md) · [DATA_MODEL.md](DATA_MODEL.md)
> 형식: Next.js App Router Route Handlers (`/app/api/.../route.ts`). JSON. 인증은 세션 쿠키.
> 공통 에러 포맷: `{ "error": { "code": "STRING", "message": "..." } }`, 적절한 HTTP status.

---

## 0. 공통 규칙

- 인증 주체: `reviewer`(휴대폰 OTP 세션) / `owner`(이메일 세션). 각 라우트에 필요한 주체 명시.
- 멱등성: 적립 관련 쓰기는 서버측 `idempotency_key`로 보호(클라이언트 재시도 안전).
- 레이트리밋: OTP, 영수증 시도, 정산 요청에 적용.

---

## 1. 인증

### POST /api/auth/otp/request  (public)
요청: `{ phone: string }` → 응답: `{ requestId, expiresIn }`
- 레이트리밋: 동일 번호 60s.

### POST /api/auth/otp/verify  (public)
요청: `{ requestId, code }` → 응답: `{ reviewerId }` + 세션 쿠키.
- 신규 번호면 reviewer + point_wallet 생성.
- 5회 실패 시 잠금.

### POST /api/auth/owner/signup · /api/auth/owner/login  (public)
요청: `{ email, password }` → 세션 쿠키.

---

## 2. 캠페인 / 매장 (고객 진입용)

### GET /api/campaigns/{slug}  (public)
응답: `{ campaignId, business: { id, name }, menus: [{ id, name, category }], active }`
- `active=false`면 200 + `active:false`(클라이언트가 차단 안내).

---

## 3. 영수증

### POST /api/receipts  (reviewer)
요청: `{ campaignId, code }`  // P1: `{ campaignId, imageUploadId }`
처리:
1. 캠페인 활성 확인.
2. `dedupe_hash = hash(businessId + code)` 계산.
3. receipts insert (유니크 충돌 시 409 `RECEIPT_ALREADY_USED`).
4. 매칭 검증 → status VERIFIED|REJECTED.
응답: `{ receiptId, status }`
에러: `409 RECEIPT_ALREADY_USED`, `422 RECEIPT_MATCH_FAILED`, `403 CAMPAIGN_INACTIVE`.

---

## 4. 피드백 + 적립 (핵심 트랜잭션)

### POST /api/feedback  (reviewer)
요청: `{ receiptId, rating: 1..5, menuIds: string[], comment?: string }`
처리 (단일 DB 트랜잭션):
1. receipt가 VERIFIED & 본인 소유 & 미소진인지 확인.
2. `feedbacks` insert (status=SUBMITTED, receiptId 유니크 → 중복 제출 방지).
3. `point_transactions` insert: `type=EARN, amount=정책포인트, idempotencyKey=receiptId, feedbackId=...`.
   - **제약: EARN 행은 feedbackId 필수, review 관련 참조 불가** (컴플라이언스 C1).
4. wallet 잔액 갱신(또는 원장 합계 캐시).
응답: `{ feedbackId, earned, balance }`
에러: `409 FEEDBACK_ALREADY_SUBMITTED`(멱등 — 기존 결과 반환 가능), `403 RECEIPT_NOT_VERIFIED`, `500`시 전체 롤백.

> 가용성: AI 초안과 분리. 본 API는 외부 LLM 호출 없음 → 적립은 항상 보장.

---

## 5. AI 초안

### POST /api/drafts  (reviewer)
요청: `{ feedbackId }`
처리: feedback(별점/메뉴/소감) + 매장 메뉴명을 입력으로 LLM 호출.
- 시스템 프롬프트 제약: "고객이 제출한 내용만 사실로 사용. 경험/메뉴/감상을 새로 지어내지 말 것. 문장만 자연스럽게 다듬기." (C2)
응답: `{ draftId, version, text }`
에러: `502 DRAFT_GENERATION_FAILED`(적립·설문 영향 없음, 재시도 가능).

### GET /api/drafts?feedbackId=...  (reviewer)
응답: `{ drafts: [{ draftId, version, text, createdAt }] }`

---

## 6. 적립금 / 정산

### GET /api/points/balance  (reviewer) → `{ balance }`

### GET /api/points/transactions  (reviewer)
응답: `{ items: [{ id, type, amount, createdAt, ref }], nextCursor }`

### POST /api/settlements  (reviewer, P1)
요청: `{ amount, method, payoutInfo }`
검증: 최소 정산액, 잔액 충분, 본인확인.
처리: settlements insert(REQUESTED) + `point_transactions` SETTLE(음수, 보류) — 승인 시 확정.
응답: `{ settlementId, status }`

---

## 7. 사장님 / 매장

### POST /api/business  (owner) → `{ businessId }`
요청: `{ name, address, googlePlaceId }`

### POST /api/business/{id}/menus  (owner)
요청: `{ menus: [{ name, category }] }` → `{ menuIds }`

### POST /api/business/{id}/campaigns  (owner)
요청: `{ name }` → `{ campaignId, slug, qrUrl, shortLink }`

### GET /api/business/{id}/stats  (owner)
응답: `{ ratingTrend: [...], topMenus: [...], complaintKeywords: [...], feedbackCount, (P1) postConversionRate }`

### POST /api/subscriptions  (owner, P1)
요청: `{ plan }` → 결제 PG 연동 → `{ subscriptionId, status }`

---

## 8. 라우트 ↔ 컴플라이언스 매핑

| 라우트 | 관련 불변조건 |
|---|---|
| POST /api/feedback | C1(EARN=feedback only), C5(멱등 1회) |
| POST /api/drafts | C2(창작 금지), C3(게시 비강제) |
| (없음) 게시 API | C3 — 게시 API는 **의도적으로 미제공**. 딥링크만 |
