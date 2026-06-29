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

## 8. 체크리스트 (구현 시)

- [ ] OTP 코드 해시 저장 + 만료 3분 + 5회 제한
- [ ] 발송/검증 레이트리밋(번호·IP) 적용
- [ ] 쿠키 HttpOnly/Secure/SameSite, 주체별 만료 분리
- [ ] 세션 서버측 무효화 가능
- [ ] 비밀번호 argon2/bcrypt, 로그인 레이트리밋
- [ ] 번호/영수증/멱등 유니크 제약으로 다계정·중복적립 차단
- [ ] 민감값 로그 마스킹
