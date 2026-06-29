# 유저 플로우 (상세)

> 관련: [PRD.md](PRD.md) · [API_SPEC.md](API_SPEC.md) · [DATA_MODEL.md](DATA_MODEL.md)
> 표기: `[화면]`, `(상태)`, `→ API`, `⚠ 엣지케이스`

---

## A. 고객(리뷰어) 메인 루프 — 모바일 웹

### A0. 진입
- 매장 QR 스캔 또는 영수증 단축링크 → `https://.../r/{campaignSlug}`
- 캠페인 식별 → 해당 매장 브랜딩/메뉴 로드. `→ GET /api/campaigns/{slug}`
- ⚠ 비활성/만료 캠페인 → "현재 참여할 수 없어요" 안내 후 종료.

### A1. [본인 인증] 휴대폰 OTP
```
[휴대폰 번호 입력] → 인증번호 발송 (→ POST /api/auth/otp/request)
   → [인증번호 입력] → 검증 (→ POST /api/auth/otp/verify) → 세션 발급
```
- 기존 회원이면 지갑 로드, 신규면 reviewer 자동 생성.
- ⚠ OTP 재발송 레이트리밋(예: 60s), 5회 실패 시 잠금.

### A2. [영수증 인증]
- MVP(P0): 영수증의 **인증코드/승인번호 입력** → 캠페인·금액·일시와 매칭.
  - `→ POST /api/receipts { campaignId, code }`
  - dedupe_hash = hash(business_id + code/승인번호) → 유니크 검사.
- P1: 영수증 **사진 업로드** → OCR → 자동 파싱.
- 결과 상태: `(receipt: PENDING → VERIFIED | REJECTED)`
- ⚠ 이미 사용된 영수증 → REJECTED "이미 참여한 영수증이에요".
- ⚠ 매칭 실패 → 재입력 유도, N회 실패 시 수동검토 큐(P1).

### A3. [비공개 설문] — 클릭 위주
화면 1: **별점** (1~5, 탭) → 화면 2: **좋았던 메뉴 선택**(매장 메뉴 칩 멀티선택) → 화면 3: **한 줄 소감**(짧은 텍스트, 음성입력 허용).
- 제출: `→ POST /api/feedback { receiptId, rating, menuIds[], comment }`
- **이 시점에 적립 확정**: 서버가 설문 저장 + `EARN` 원장 기록을 **단일 트랜잭션**으로 처리.
  - 멱등키 = receiptId → 중복 제출 시 적립 1회 보장.
- `(feedback: SUBMITTED)`, `(point_tx: EARN 기록)`
- ⚠ 트랜잭션 실패 → 설문/적립 모두 롤백, 재시도 안내.
- ✅ **여기서 보상 루프는 종료.** 이후는 전부 자율/부가.

### A4. [적립 완료 안내]
- "+{n}P 적립되었어요" + 현재 잔액 표시. `→ GET /api/points/balance`
- CTA 두 개: **① 리뷰 초안 받기(선택)** / **② 그냥 마치기**.

### A5. [AI 초안] (선택)
- `→ POST /api/drafts { feedbackId }` → 고객 답변(별점/메뉴/소감)+메뉴명을 입력으로 초안 생성.
- 화면: 초안 텍스트 + [다시 생성] [복사하기].
- ⚠ AI 실패/지연 → "초안 생성 실패, 직접 작성도 가능해요". **적립은 영향 없음.**
- 재생성 시 `ai_drafts`에 버전 누적.

### A6. [자율 게시] (선택)
- [복사하기] → 클립보드 복사 + **구글맵 딥링크**(Place 리뷰 작성 화면)로 이동.
- 게시 여부/수정은 전적으로 고객 자유. 우리는 게시를 강제/대행하지 않음.
- ⚠ 게시 성공 여부는 우리가 보장·추적하지 않음(참고 지표는 자발적 확인 수준).

### A7. [적립금/정산]
- 잔액·내역: `→ GET /api/points/transactions`
- 정산 요청(P1): `→ POST /api/settlements` → 최소 정산액·본인확인 → `(settlement: REQUESTED → PAID)`.

---

## B. 사장님(Owner) 플로우 — 웹

### B1. 가입/로그인
- 이메일/비번. `→ POST /api/auth/owner/signup|login`

### B2. 매장 등록
- 상호/주소/구글 Place ID. `→ POST /api/business`
- Place ID는 검색·확인 후 저장(딥링크·식별용).

### B3. 메뉴 등록
- 이름/카테고리 목록 입력. `→ POST /api/business/{id}/menus`
- 설문의 "메뉴 선택"과 AI 초안 표현에 사용.

### B4. 캠페인 발급
- 캠페인 생성 → slug/QR 이미지/단축링크 발급. `→ POST /api/business/{id}/campaigns`
- 매장 비치용 QR 다운로드.

### B5. 대시보드
- 비공개 피드백 통계: 별점 추이, 인기/비인기 메뉴, 불만 키워드(소감 텍스트 집계).
- `→ GET /api/business/{id}/stats`
- (P1) 공개 게시 전환율 참고 지표.

### B6. 구독 결제 (P1)
- 플랜 선택·결제·상태. `→ POST /api/subscriptions`

---

## C. 핵심 상태 머신

### 영수증 (receipts.status)
```
PENDING ──verify──► VERIFIED ──(설문완료)──► (소진)
   └────fail───────► REJECTED
```

### 피드백 (feedbacks.status)
```
(생성) ─submit─► SUBMITTED  (이 전이에서 EARN 발생, 트랜잭션 원자성)
```

### 포인트 원장 (point_transactions.type) — append-only
```
EARN   : feedback.submitted (양수)   ← 유일한 적립 트리거
REDEEM : 사용/차감 (음수)
SETTLE : 정산 출금 (음수)
ADJUST : 운영 보정 (±, 감사로그 필수)
```
잔액 = Σ(transactions). 별도 정합성 잡이 wallet 캐시와 대사.

### 정산 (settlements.status)
```
REQUESTED ─review─► APPROVED ─pay─► PAID
     └──────reject──────► REJECTED
```

---

## D. 전역 엣지케이스 / 정책 가드

| 상황 | 처리 |
|---|---|
| 동일 영수증 재사용 | dedupe_hash 유니크 → REJECTED |
| 설문 중복 제출 | idempotency_key=receiptId → EARN 1회 |
| AI 초안 실패 | 적립·설문 보존, 초안만 재시도 |
| 게시 미실시 | 적립 유지(보상은 게시와 무관) — C1/C3 |
| 비활성 캠페인 | 진입 차단 |
| OTP 남용 | 레이트리밋·잠금 |
| "게시하면 추가 적립" 류 요청 | **거부** — 컴플라이언스 C1 위반 |
