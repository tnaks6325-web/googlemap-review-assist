# PostgreSQL 전환 가이드

로컬 개발은 SQLite, 운영은 PostgreSQL을 쓴다. 두 DB는 **동일한 모델**을 사용한다
(enum→String, 배열→JSON 어댑트를 유지하므로 스키마 변경 없이 호환). 운영 스키마는
[`prisma/schema.postgres.prisma`](../prisma/schema.postgres.prisma)로, `provider`/`url`만 다르다.

## 1. Postgres 기동

```bash
docker compose up -d postgres   # localhost:5432, db/user/pw = review
```

## 2. 환경변수

```bash
# .env (운영/스테이징)
DB_PROVIDER="postgres"
DATABASE_URL="postgresql://review:review@localhost:5432/review?schema=public&connection_limit=10"
SESSION_SECRET="<32자 이상 난수>"
```

- `DB_PROVIDER=postgres`이면 money 트랜잭션이 **Serializable + 재시도**로 실행된다([lib/tx.ts](../lib/tx.ts), R1 운영 보강).
- SQLite의 `connection_limit=1`은 단일 라이터 직렬화를 위한 것이고, Postgres에서는 풀 크기로 조정한다.

## 3. 마이그레이션

```bash
# 운영 스키마로 마이그레이션 생성/적용
npx prisma migrate dev --schema=prisma/schema.postgres.prisma --name init
# 또는 스키마만 반영
npm run db:push:pg
npx prisma generate --schema=prisma/schema.postgres.prisma
```

## 4. 무결성 제약(권장) — 마이그레이션 후 SQL

Prisma 스키마로 표현되지 않는 CHECK 제약을 추가해 money 불변식을 DB에서 강제한다.

```sql
-- 지갑 잔액 음수 금지 (R2a/R5: 음수 원장 방지의 1차 방어)
ALTER TABLE "PointWallet" ADD CONSTRAINT wallet_balance_nonneg CHECK ("balance" >= 0);

-- 정산 금액 양수
ALTER TABLE "Settlement" ADD CONSTRAINT settlement_amount_pos CHECK ("amount" > 0);

-- (선택) append-only 원장 보호: 애플리케이션 DB 유저에게 UPDATE/DELETE 권한 미부여
REVOKE UPDATE, DELETE ON "PointTransaction" FROM review;
```

> 원장 합계(SUM)≥0 같은 교차행 불변식은 단순 CHECK로 표현 불가 → 잔액 CHECK + 애플리케이션의
> 원자적 조건부 차감([lib/domain/settlement.ts](../lib/domain/settlement.ts))으로 이중 방어한다.

## 5. 레이트리밋(이월 R6)

OTP/로그인 레이트리밋은 현재 인메모리(단일 노드). 멀티 노드/서버리스 운영 시 Redis 등
공유 저장소로 교체해야 한다. money 경로(영수증 일일 한도·정산 일일 한도)는 이미 **DB 카운트**
기반으로 전환되어 멀티 노드에서도 견고하다.
