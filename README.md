# 리뷰 작성 보조 플랫폼

영수증으로 검증된 **실제 방문 고객**이 클릭형 설문으로 자기 경험을 남기면, AI가 그 경험을 **자연스러운 구글맵 리뷰 초안**으로 다듬어 주는 합법적 보조 도구.

> ⚠️ 본 플랫폼은 가짜/대가성 리뷰를 만들지 않는다. 적립금은 **비공개 피드백 제출**에만 지급되며 공개 리뷰 게시와 분리된다. 자세한 불변 조건은 [ARCHITECTURE.md §2](ARCHITECTURE.md) 참조.

## 문서 (초도 구현 기준)

| 문서 | 내용 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 시스템 아키텍처, 컴플라이언스 불변조건, 기술 스택 |
| [docs/PRD.md](docs/PRD.md) | 제품 요구사항, 기능요구(FR), 지표, 범위, 수용기준 |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | 고객·사장님 상세 플로우, 상태머신, 엣지케이스 |
| [docs/API_SPEC.md](docs/API_SPEC.md) | API 엔드포인트 명세, 핵심 트랜잭션, 에러 |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Prisma 스키마 초안, 무결성 체크리스트 |
| [docs/WIREFRAMES.md](docs/WIREFRAMES.md) | 고객·사장님 화면 와이어프레임(텍스트) |
| [docs/AI_PROMPTS.md](docs/AI_PROMPTS.md) | AI 초안 프롬프트 설계, 가드, 예시 |
| [docs/SECURITY_AUTH.md](docs/SECURITY_AUTH.md) | OTP·세션 보안, 레이트리밋, 어뷰징 방지 |
| [docs/UI_UX_DESIGN.md](docs/UI_UX_DESIGN.md) | 토스 스타일 디자인 시스템, CTA 행동유도 전략 |

## 스택

Next.js 16 (App Router) · Tailwind CSS v4 · React 19 · (예정) PostgreSQL(Prisma) · Claude API

## 개발

```bash
npm run db:push   # 스키마를 DB에 반영 (최초 1회)
npm run db:seed   # 데모 데이터(매장/메뉴/캠페인) 시드
npm run dev       # 개발 서버 (http://localhost:3000)
npm run build     # 프로덕션 빌드
npm run start     # 프로덕션 서버
```

- 고객 플로우 체험: `http://localhost:3000/r/demo`
- 컴포넌트 스타일가이드: `http://localhost:3000/`
- 개발 모드에서는 OTP 인증번호가 응답(`devCode`)으로 반환됩니다(실서비스는 SMS).
- AI 초안: `ANTHROPIC_API_KEY` 설정 시 Claude 사용, 미설정 시 로컬 폴백.

## 코드 구조

```
app/
  page.tsx                 컴포넌트 스타일가이드
  r/[slug]/page.tsx        캠페인 진입 → 고객 플로우(ReviewFlow)
  api/
    auth/otp/{request,verify}  휴대폰 OTP 인증 + 세션 쿠키
    campaigns/[slug]            캠페인/메뉴 조회
    receipts                    영수증 인증(dedupe)
    feedback                    설문 제출 + EARN 적립(트랜잭션, 멱등)
    drafts                      AI 초안 생성
    points                      적립금 잔액/내역
components/
  ui/                      공통 컴포넌트 (토스 스타일)
  flow/ReviewFlow.tsx      고객 멀티스텝 위저드
lib/
  db.ts                    Prisma 클라이언트
  auth/                    세션·비밀번호
  domain/                  포인트 원장·영수증·AI 초안
prisma/schema.prisma       데이터 모델 (로컬 SQLite / 운영 PostgreSQL)
```

## 현재 상태

- ✅ 기획·아키텍처·플로우·API·스키마·화면·AI·보안·UI/UX 문서
- ✅ Next.js + 토스 스타일 디자인 토큰 + 공통 컴포넌트
- ✅ **M1(MVP)**: Prisma 스키마, 핵심 루프(인증→영수증→설문→EARN→초안→게시 안내) API·화면.
  전체 루프 + 멱등(중복 적립 0) + 영수증 dedupe(409) 동작 검증 완료.
- ⏭️ 다음(P1): 사장님 대시보드, 정산/구독, OTP 레이트리밋, 영수증 OCR, PostgreSQL 전환, Pretendard self-host
