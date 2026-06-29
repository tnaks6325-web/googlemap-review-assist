# OTP / 세션 보안 설계

> 관련: [API_SPEC.md](API_SPEC.md) §1 · [USER_FLOWS.md](USER_FLOWS.md) A1, B1 · [PRD.md](PRD.md) NFR(보안)
> 대상: 고객=휴대폰 OTP, 사장님=이메일/비밀번호. 공통 세션·레이트리밋·어뷰징.

---

## 1. 위협 모델 (무엇을 막나)

| 위협 | 대응 |
|---|---|
| OTP 무차별 대입 | 코드 6자리 + 시도 5회 제한 + 만료 3분 |
| OTP 문자 폭탄/비용 공격 | 번호·IP·기기 레이트리밋, 발송 쿼터 |
| 세션 탈취 | HttpOnly·Secure·SameSite 쿠키, 짧은 만료+회전 |
| 다계정 어뷰징(적립 부정) | 번호 1계정, 기기지문, 이상패턴 모니터링(C5) |
| CSRF | SameSite=Lax + 변조요청 토큰(필요 시) |
| 비밀번호 유출(사장님) | bcrypt/argon2 해시, 로그인 레이트리밋 |

---

## 2. 고객 OTP 플로우 (상세)

### 2.1 발송 — `POST /api/auth/otp/request`
```
입력: { phone }
1. 번호 정규화(E.164, 한국 010 → +8210...).
2. 레이트리밋 체크:
   - 동일 번호: 60s 내 재발송 금지, 시간당 ≤5회, 일 ≤10회.
   - 동일 IP: 시간당 ≤20회 (SMS 비용 폭탄 방지).
3. 코드 생성: 6자리 난수(암호학적 RNG).
4. 저장: otp_challenges { id, phoneHash, codeHash, expiresAt(now+3m),
        attempts:0, consumed:false }  ← 코드는 해시로만 저장.
5. SMS 발송(외부 게이트웨이). 응답: { requestId, expiresIn:180 }.
```
- ⚠ 존재 여부 노출 방지: 신규/기존 번호 동일 응답.

### 2.2 검증 — `POST /api/auth/otp/verify`
```
입력: { requestId, code }
1. challenge 조회. 없음/만료/consumed → 401.
2. attempts += 1. attempts > 5 → 잠금(challenge 폐기) → 재발송 요구.
3. timing-safe 비교(codeHash). 불일치 → 401(남은 시도 노출 금지).
4. 일치 → consumed=true.
5. reviewer upsert(phone unique) + point_wallet 생성(신규).
6. 세션 발급(§4).
응답: { reviewerId }
```

### 2.3 저장 규칙
- 전화번호는 **해시/부분마스킹** 저장 검토(원문 최소화). 표시는 `010-****-1234`.
- OTP 코드 평문 저장 금지(해시), 검증 후 즉시 소멸.

---

## 3. 사장님 인증 — `POST /api/auth/owner/{signup,login}`

- 비밀번호: argon2id(또는 bcrypt cost≥12) 해시.
- 로그인 레이트리밋: 계정/IP별 시도 제한 + 점증 지연.
- 비밀번호 정책: 최소 길이·유출목록(HIBP) 체크(P1).
- (P1) 이메일 인증 메일, 비밀번호 재설정 토큰(1회용·만료).

---

## 4. 세션 설계 (공통)

- 방식: 서버 세션 또는 JWT. **권장: 불투명 세션 토큰 + 서버 저장**(즉시 폐기 가능).
- 쿠키 속성:
  ```
  HttpOnly; Secure; SameSite=Lax; Path=/;
  고객 세션  : maxAge 30d (슬라이딩 갱신)
  사장님 세션: maxAge 12h (민감·결제 다룸)
  ```
- 토큰 회전: 로그인/권한변경 시 재발급. 로그아웃 시 서버측 무효화.
- 분리: `reviewer` 세션과 `owner` 세션 네임스페이스 분리(권한 혼동 방지).
- 미들웨어에서 라우트별 요구 주체 강제(API_SPEC의 (reviewer)/(owner) 표기와 일치).

---

## 5. 레이트리밋 / 추상화

| 대상 | 한도(초안) | 키 |
|---|---|---|
| OTP 발송 | 60s/회, 5/시간, 10/일 | phone |
| OTP 발송 | 20/시간 | ip |
| OTP 검증 | 5회/challenge | requestId |
| 영수증 시도 | 10/시간 | reviewer |
| 사장님 로그인 | 10/시간 + 점증지연 | email+ip |
| 정산 요청 | 3/일 | reviewer |

- 구현: Redis(또는 DB) 기반 슬라이딩 윈도우. 한도값은 env/설정으로 조정 가능.

---

## 6. 적립 어뷰징 방지 (C5와 연계)

- **번호 1계정**(`Reviewer.phone` unique) → 다계정 비용↑.
- **영수증 1건 1적립**: dedupeHash unique + idempotencyKey(=receiptId) — [DATA_MODEL](DATA_MODEL.md).
- 기기지문/IP 클러스터 이상치 모니터링 훅(P1, FR-S5): 동일 기기 다번호, 단시간 대량 적립 플래그.
- 의심 적립은 `ADJUST`(감사 메모 필수)로 사후 보정 — 원장은 append-only 유지.

---

## 7. 개인정보 / 보관

- 최소 수집: 고객은 휴대폰만. 영수증 이미지(P1)는 접근통제 스토리지 + 만료 정책.
- 소감/초안 텍스트 보관 기간·파기 정책 명문화(PRD NFR).
- 로그에 코드·토큰·원문번호 평문 금지(마스킹).

---

## 7b. 레드팀 1라운드 — 조치 내역 / 이월

레드팀 적대적 리뷰(11건) 후 블루팀 조치 결과:

| ID | 심각도 | 내용 | 상태 |
|---|---|---|---|
| R1 | CRITICAL | 세션 시크릿 하드코딩 폴백 | ✅ 운영 부팅 가드(미설정/약함 시 throw) |
| R3 | HIGH | 영수증 코드 재타이핑 dedupe 우회 | ✅ `canonicalizeCode`(대문자+영숫자) 후 해시 |
| R4 | HIGH | 자가신고 코드 무제한 적립 | ⚠️ 임시: 리뷰어·매장당 일일 한도(3). **본 검증은 OCR/발급코드 라운드에서 완성** |
| R5 | HIGH | OTP 무차별(IP 스푸핑) | ✅ 번호 단위 검증 카운터 추가 / ⏭️ Redis·신뢰 프록시는 Postgres 라운드 |
| R6 | MED→치명 | devCode 노출 게이트 취약 | ✅ `OTP_DEV_ECHO=1`+비운영 옵트인 |
| R7 | MED | CSRF | ✅ Origin 검증(`checkOrigin`) 변경 라우트 적용 |
| R8 | MED | OTP 오류 응답 열거 | ✅ 실패 응답 단일화(`OTP_FAILED`) |
| R9 | MED | 입력 경계 | ✅ menuIds 매장 한정·개수 제한, comment 500자 |
| R2a | - | 잔액-원장 드리프트 | ✅ 잔액을 원장 합계로 권위화·자가보정 |
| R10 | LOW | append-only DB 강제 | ⏭️ Postgres 트리거/권한 라운드 |

이월(다음 라운드): R4 실검증(OCR/발급코드), R5 인프라(Redis 공유 저장소·신뢰 프록시 홉), R10 DB 레벨 append-only.

## 7c. 레드팀 2라운드 (정산/구독 money 경로) — 조치 내역 / 이월

| ID | 심각도 | 내용 | 상태 |
|---|---|---|---|
| R1 | CRITICAL | 동시 정산 이중지출(TOCTOU) | ✅ 원자적 조건부 차감(`UPDATE ... WHERE balance>=amt`) + SQLite 단일 커넥션 |
| R2 | HIGH | 관리자 토큰 비교 타이밍 취약 | ✅ 해시 후 `timingSafeEqual` |
| R3 | CRITICAL | APPROVED 반려 이중환불·P2002→500 | ✅ 액션별 REQUESTED 상태 가드, P2002→409 |
| R4 | MEDIUM | 구독 status 클라 설정/해지건 부활 | ✅ status 클라 설정 차단, CANCELED 재활성화 거부 |
| R5 | MEDIUM | 캐시 자가보정이 음수원장 은폐 | ✅ 드리프트·음수 원장 경고 로깅 |
| R7 | LOW | 도메인 method 미검증 | ✅ 도메인 내 method 검증 |
| R8 | LOW | payoutInfo 잘림→깨진 JSON | ✅ 과대 입력 거부(잘림 제거) |
| R6 | MEDIUM | per-node 인메모리 레이트리밋 | ⏭️ Redis 공유 저장소(인프라 라운드) |
| R9 | LOW | null-Origin 허용 | ⏭️ Sec-Fetch-Site 등 강화(후속) |

검증: 보류→승인(PAID)/반려(환불) 원장 정합, 잔액초과 차단(R1), 재반려 409(R3), 관리자 토큰 오류 403(R2) 실측.
운영 권장(이월): R6 공유 레이트리밋, R1을 Postgres에서는 `Serializable`+재시도로 보강, 원장 SUM≥0 DB CHECK.

## 7d. 레드팀 3라운드 (영수증 OCR/검증) — 조치 내역 / 이월

| ID | 심각도 | 내용 | 상태 |
|---|---|---|---|
| R1 | CRITICAL | 코드 라우트가 임의 코드를 즉시 VERIFIED(전면 우회) | ✅ **발급 코드(CampaignCode) 1회용 매칭** 시에만 VERIFIED, 임의 코드 422 |
| R4 | HIGH | 가맹점 미인식 시 검증 fail-open | ✅ fail-closed(가맹점 미인식→PENDING) + 매칭 강화 |
| R5 | MEDIUM | 인메모리 일일 한도 멀티노드 우회 | ✅ DB 카운트 기반(24h)으로 교체 |
| R7 | MEDIUM | 이미지 타입 클라 MIME 신뢰 | ✅ 매직바이트 스니핑(PNG/JPEG/GIF/WebP) |
| R6 | MEDIUM | 코드 저장 비정규화 | ✅ 정규화 코드 저장 |
| R8 | LOW | mockText 무제한 | ✅ 8KB 캡(+ReDoS 없음 확인) |
| R3 | HIGH | 실 OCR 도입 시 검증은 decide 로직에 의존 | ⏭️ 실 프로바이더 도입 시 per-field confidence 사용(후속) |
| R9 | LOW | ocrText 미렌더(잠재 저장 XSS) | ⏭️ 내보내기 시 sanitize(문서화) |
| R10 | LOW | null-Origin 허용 | ⏭️ (인프라 라운드) |

검증: 임의 코드 422·발급코드 VERIFIED·1회용 재사용 409·교차사용 409·OCR 가맹점불일치 PENDING(적립 403) 실측.
참고: 발급 코드는 업체가 영수증/POS에 안내하는 1회용 코드 모델. 실 영수증 OCR/POS 매칭은 실 프로바이더 도입 라운드에서 확장.

## 7e. 레드팀 5라운드 (사장님 온보딩) — 조치 내역 / 이월

IDOR·CSRF·세션·저장 XSS는 **non-issue 확인**(소유권 게이트 일관, React 이스케이프). 주요 발견:

| ID | 심각도 | 내용 | 상태 |
|---|---|---|---|
| R1 | CRITICAL(로직) | **자기거래**: 사장님이 코드 발급 → 본인 리뷰어 계정으로 적립 농사 | ⚠️ 부분완화 + 설계결정 필요(아래) |
| R2 | HIGH | 코드 무제한 발급(누적 상한·레이트리밋 없음) | ✅ 캠페인당 1000개 상한 + 발급 레이트리밋 |
| R3 | MEDIUM | 매장/캠페인 생성 레이트리밋·쿼터 없음 | ✅ 레이트리밋 + 매장50/캠페인20 상한 |
| R4 | MEDIUM | 슬러그 6자(열거 가능)·생성 경쟁 시 500 | ✅ 10자 + P2002 재시도 |
| R6 | LOW | googlePlaceId 미검증, 메뉴 무제한/중복 | ✅ Place ID 형식 검증, 메뉴 100상한·중복 제거 |

### R1 자기거래 — 설계 결정 필요 (미해결, 명시적 플래그)
현재 모델은 "업체 발급 코드 = 검증 권한"인데, 업체(사장님)는 **금전적 이해관계가 있는 미신뢰 주체**다.
사장님이 코드를 발급하고 본인이 통제하는 휴대폰으로 리뷰어 가입 → 코드 입력 → 적립을 무한 반복할 수 있다(일일 한도 3 × 보유 번호 수).

- **현재 백스톱**: 정산(SETTLE)은 **관리자 승인** 필수(`/api/admin/settlements`)라 자동 출금은 불가. R2의 코드 상한으로 규모도 제한.
- **근본 해결(권장, 제품 결정 필요)**: (a) 코드 단독으로 VERIFIED 금지 — **실 OCR(금액/승인번호) 필수**를 6라운드에서 도입, 코드는 2차 요소로. 또는 (b) 코드 단독 적립은 **출금 불가(보류) 상태**로 두고 POS/정산 대사 후 확정.
- 이 결정은 사업 모델(코드의 의미)과 직결되므로 사용자 확인 후 6라운드에서 반영 예정.

## 8. 체크리스트 (구현 시)

- [ ] OTP 코드 해시 저장 + 만료 3분 + 5회 제한
- [ ] 발송/검증 레이트리밋(번호·IP) 적용
- [ ] 쿠키 HttpOnly/Secure/SameSite, 주체별 만료 분리
- [ ] 세션 서버측 무효화 가능
- [ ] 비밀번호 argon2/bcrypt, 로그인 레이트리밋
- [ ] 번호/영수증/멱등 유니크 제약으로 다계정·중복적립 차단
- [ ] 민감값 로그 마스킹
