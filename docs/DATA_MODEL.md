# 데이터 모델 (Prisma 스키마 초안)

> 관련: [ARCHITECTURE.md](../ARCHITECTURE.md) · [API_SPEC.md](API_SPEC.md)
> DB: PostgreSQL. ORM: Prisma. 본 문서는 **개념/초안 스키마**이며 구현 시 조정 가능.

---

## 핵심 설계 원칙

1. **포인트 원장은 append-only** (`PointTransaction`). 수정·삭제 금지, 잔액은 합계로 도출/대사.
2. **EARN은 Feedback만 참조 가능** — `review`성 엔티티 참조 불가(컴플라이언스 C1을 스키마로 강제). 게시 엔티티 자체를 두지 않는다.
3. **영수증 1건 1적립**: `Receipt.dedupeHash` 유니크 + `Feedback.receiptId` 유니크 + `PointTransaction.idempotencyKey` 유니크.

---

## schema.prisma (초안)

```prisma
// ---------- 사장님 / 매장 ----------
model Owner {
  id         String     @id @default(cuid())
  email      String     @unique
  password   String     // 해시
  businesses Business[]
  createdAt  DateTime   @default(now())
}

model Business {
  id            String     @id @default(cuid())
  ownerId       String
  owner         Owner      @relation(fields: [ownerId], references: [id])
  name          String
  address       String?
  googlePlaceId String?
  menus         Menu[]
  campaigns     Campaign[]
  receipts      Receipt[]
  subscription  Subscription?
  createdAt     DateTime   @default(now())
}

model Menu {
  id         String   @id @default(cuid())
  businessId String
  business   Business @relation(fields: [businessId], references: [id])
  name       String
  category   String?
  @@index([businessId])
}

model Campaign {
  id         String    @id @default(cuid())
  businessId String
  business   Business  @relation(fields: [businessId], references: [id])
  slug       String    @unique     // QR/단축링크 식별
  name       String
  active     Boolean   @default(true)
  receipts   Receipt[]
  createdAt  DateTime  @default(now())
}

model Subscription {
  id         String   @id @default(cuid())
  businessId String   @unique
  business   Business @relation(fields: [businessId], references: [id])
  plan       String
  status     String   // ACTIVE | PAST_DUE | CANCELED
  createdAt  DateTime @default(now())
}

// ---------- 고객 / 적립 ----------
model Reviewer {
  id           String              @id @default(cuid())
  phone        String              @unique
  wallet       PointWallet?
  receipts     Receipt[]
  transactions PointTransaction[]
  settlements  Settlement[]
  createdAt    DateTime            @default(now())
}

model PointWallet {
  id         String   @id @default(cuid())
  reviewerId String   @unique
  reviewer   Reviewer @relation(fields: [reviewerId], references: [id])
  balance    Int      @default(0)   // 원장 합계 캐시(정합성 잡으로 대사)
}

enum ReceiptStatus { PENDING VERIFIED REJECTED }

model Receipt {
  id         String        @id @default(cuid())
  businessId String
  business   Business      @relation(fields: [businessId], references: [id])
  campaignId String
  campaign   Campaign      @relation(fields: [campaignId], references: [id])
  reviewerId String
  reviewer   Reviewer      @relation(fields: [reviewerId], references: [id])
  code       String?
  amount     Int?
  paidAt     DateTime?
  dedupeHash String        @unique   // hash(businessId + code/승인번호) — 재사용 차단
  status     ReceiptStatus @default(PENDING)
  feedback   Feedback?
  createdAt  DateTime      @default(now())
  @@index([reviewerId])
  @@index([businessId])
}

enum FeedbackStatus { SUBMITTED }

model Feedback {
  id         String         @id @default(cuid())
  receiptId  String         @unique          // 1 영수증 1 설문
  receipt    Receipt        @relation(fields: [receiptId], references: [id])
  rating     Int            // 1..5
  menuIds    String[]       // 선택 메뉴
  comment    String?
  status     FeedbackStatus @default(SUBMITTED)
  drafts     AiDraft[]
  earnTx     PointTransaction?               // 이 설문이 발생시킨 EARN (1:1)
  createdAt  DateTime       @default(now())
}

model AiDraft {
  id         String   @id @default(cuid())
  feedbackId String
  feedback   Feedback @relation(fields: [feedbackId], references: [id])
  version    Int
  text       String
  createdAt  DateTime @default(now())
  @@unique([feedbackId, version])
}

enum PointTxType { EARN REDEEM SETTLE ADJUST }

model PointTransaction {
  id             String      @id @default(cuid())
  reviewerId     String
  reviewer       Reviewer    @relation(fields: [reviewerId], references: [id])
  type           PointTxType
  amount         Int         // EARN 양수, REDEEM/SETTLE 음수
  // 컴플라이언스 C1: EARN의 유일한 발생원은 Feedback. review성 참조는 존재하지 않음.
  feedbackId     String?     @unique
  feedback       Feedback?   @relation(fields: [feedbackId], references: [id])
  settlementId   String?
  settlement     Settlement? @relation(fields: [settlementId], references: [id])
  idempotencyKey String      @unique          // EARN: = receiptId → 1회 보장
  memo           String?                       // ADJUST 감사로그
  createdAt      DateTime    @default(now())
  @@index([reviewerId, createdAt])
}

enum SettlementStatus { REQUESTED APPROVED PAID REJECTED }

model Settlement {
  id           String             @id @default(cuid())
  reviewerId   String
  reviewer     Reviewer           @relation(fields: [reviewerId], references: [id])
  amount       Int
  method       String
  payoutInfo   Json?
  status       SettlementStatus   @default(REQUESTED)
  transactions PointTransaction[]
  createdAt    DateTime           @default(now())
  @@index([reviewerId])
}
```

---

## 무결성 체크리스트

- [ ] `Receipt.dedupeHash` 유니크 — 영수증 재사용 차단 (FR-S1)
- [ ] `Feedback.receiptId` 유니크 — 설문 중복 차단
- [ ] `PointTransaction.idempotencyKey` 유니크 — EARN 멱등 (FR-S2)
- [ ] EARN 생성 시 `feedbackId` NOT NULL을 애플리케이션/제약으로 보장 (C1)
- [ ] 잔액 정합성 잡: `PointWallet.balance == Σ PointTransaction.amount` 대사
- [ ] **게시(review.posted) 엔티티 부재** — 게시를 보상에 연결할 경로 자체가 없음 (C1/C3)

## 마이그레이션/시드 메모

- 시드: 데모 Owner 1 + Business 1 + Menu 5 + Campaign 1 + Reviewer 1.
- EARN 포인트 정책값은 설정 테이블 또는 env로 분리(하드코딩 지양).
