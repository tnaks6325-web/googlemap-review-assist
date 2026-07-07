# PRD Addendum — 운영자형 구글맵 방문리뷰 캠페인

> 상태: 구조 정정안 Draft v1
> 작성일: 2026-07-01
> 기준 시트: `구글맵리뷰 접수시트` / 탭 `광고요청시트`

## 1. 핵심 구조 변경

이 서비스는 사장님이 직접 계정을 만들어 매장을 관리하는 SaaS가 아니다.

정정된 구조는 다음과 같다.

- 사장님/광고주는 별도 계정 없이 플랫폼 운영자에게 Google Sheet로 구글맵 리뷰 캠페인을 요청한다.
- 플랫폼 운영자는 Google Sheet 접수 데이터를 수입해 구글맵 방문 캠페인을 생성하고 운영한다.
- 리뷰어는 플랫폼에서 진행 중인 구글맵 캠페인을 보고, 방문 가능한 캠페인을 선택한다.
- 리뷰어는 실제 방문 후 방문 증빙/경험 정보를 입력하고, 플랫폼은 생성형 리뷰 초안과 Google Maps 작성 화면에서 선택할 수 있는 경험 기반 선택지를 제안한다.
- 리뷰어는 생성된 초안을 복사하고 캠페인 내 구글맵 링크를 새 창으로 열어 직접 리뷰를 작성한다.
- 리뷰어 적립금은 플랫폼 운영자가 광고주에게 받은 캠페인 비용을 재원으로 운영한다.

## 2. 컴플라이언스 경계

Google Maps와 소비자 리뷰 규칙상, 다음 형태는 제품 범위에서 제외해야 한다.

- Google 리뷰 게시, 별점, 긍정 문구 작성, 부정 리뷰 수정/삭제를 조건으로 보상 지급
- 실제 방문 경험이 아닌 내용을 생성하거나 작성하도록 유도
- 특정 별점, 특정 긍정 문장, 특정 키워드를 리뷰어에게 강제
- Google 리뷰 자동 게시 또는 계정 조작

따라서 제품의 보상 기준은 `실제 방문 인증 + 플랫폼 내 경험 설문/피드백 완료`로 제한한다.
Google 리뷰 게시 버튼은 외부 이동과 복사 보조만 제공하며, 보상과 직접 연결하지 않는다.

## 3. Google Sheet 접수 구조

메타데이터 확인 결과:

- Spreadsheet: `구글맵리뷰 접수시트`
- Sheet: `광고요청시트`
- `sheetId`: `342145819`
- Grid: 260 rows x 21 columns
- Frozen rows: 6
- Frozen columns: 6

현재 주요 헤더는 5행 기준이다.

| Column | Header | 의미 |
| --- | --- | --- |
| B | 작성일 | 접수 작성일 |
| C | 광고 시작일 | 캠페인 시작일 |
| D | 광고 종료일 | 캠페인 종료일 또는 계산식 |
| E | 진행일 | 진행 기간 |
| F | 광고주명 | 광고주/발주자 식별명 |
| G | 업체명 | 캠페인 대상 업체명 |
| H | 검색키워드 | Google Maps 검색 키워드 |
| I | 유형 | 예: 구글리뷰 |
| J | 노출순위 | 검색 노출 순위 메모 |
| K | 정답 | 검색형 캠페인 정답/타겟 메모 |
| L | 상품 유형 | 예: 구글 리뷰형 |
| M | 랜딩 URL | Google Maps 공유 URL |
| N | 전체 | 총 목표 건수 |
| O | 데일리 | 일 목표 건수 |
| P | 가이드라인 | 리뷰어가 참고할 경험/표현 가이드 |
| Q | 리뷰 문구 예시 | 짧은 예시 문구 묶음 |
| R | 제외요일 | 헤더상 제외요일. 현재 일부 셀은 정산 상태 드롭다운 검증이 있어 재확인 필요 |
| S | 작업기간(일) | 전체/데일리 기반 계산값 또는 작업 기간 |

## 4. 데이터 모델 방향

기존 `Owner` 중심 구조는 운영자 내부 모델로 전환한다.

권장 모델:

- `Advertiser`: 광고주 식별 정보. 로그인 계정이 아니라 운영자 관리용 레코드.
- `AdvertiserRequest`: Google Sheet 1행 원본 접수 데이터와 sync 상태.
- `Business`: 구글맵 타겟 업체. `ownerId` 필수 의존 제거.
- `ExternalPlace`: Google Places 스냅샷. MVP에서는 Google 중심, Naver는 후순위.
- `Campaign`: 운영자가 공개/비공개/일시중지 상태를 관리하는 방문리뷰 캠페인.
- `CampaignQuota`: 전체 목표, 일 목표, 제외요일, 시작/종료일, 보상 단가.
- `CampaignGuidance`: 가이드라인, 예시 문구, 금지 표현, 선택지 프리셋.
- `CampaignParticipation`: 리뷰어가 캠페인에 참여한 단위.
- `VisitProof`: 영수증/OCR/수동검수 등 방문 증빙.
- `ReviewAnswer`: 방문 경험 선택지 응답.
- `AiDraft`: 리뷰어 응답 기반 리뷰 초안.
- `PointTransaction` / `Settlement`: 기존 reviewer 정산 원장 유지.

## 5. API 방향

### 운영자 API

- `POST /api/admin/sheet-imports/google-map-review/sync`
  - Google Sheet `광고요청시트`를 읽어 유효한 행을 upsert한다.
  - 입력: `{ spreadsheetUrl?, sheetName?, dryRun? }`
  - 출력: `{ imported, updated, skipped, errors[] }`

- `GET /api/admin/campaigns`
  - 운영 중/예약/중지/종료 캠페인 목록.

- `POST /api/admin/campaigns`
  - 시트 행 또는 수동 입력으로 캠페인 생성.

- `PATCH /api/admin/campaigns/{id}`
  - 상태, 기간, 일 목표, 보상, 가이드라인 조정.

- `POST /api/admin/campaigns/{id}/resolve-google-place`
  - `landingUrl` 또는 `searchKeyword`로 Google Place 스냅샷 확정.

### 리뷰어 API

- `GET /api/campaigns`
  - 참여 가능한 공개 캠페인 목록.
  - 필터: `platform=GOOGLE`, `category`, `availableToday=true`.

- `GET /api/campaigns/{slug}`
  - 캠페인 상세, 구글맵 링크, 보상 조건, 방문 유의사항.

- `POST /api/campaigns/{id}/participations`
  - 캠페인 참여 시작. reviewer OTP 세션 필요.

- `POST /api/campaigns/{id}/visit-proofs`
  - 영수증/OCR/수동 코드 등 방문 증빙.

- `POST /api/campaigns/{id}/review-answers`
  - 방문 경험 선택지와 자유 메모 저장.

- `POST /api/campaigns/{id}/drafts`
  - 실제 응답 데이터만 사용해 리뷰 초안 생성.

- `POST /api/campaigns/{id}/completion`
  - 플랫폼 내 참여 완료 및 적립. Google 리뷰 게시 여부는 보상 조건으로 삼지 않는다.

## 6. 리뷰어 UX

### 6.1 캠페인 목록

첫 화면은 사장님 등록이 아니라 리뷰어 캠페인 탐색이어야 한다.

- 진행 중 캠페인 카드
- 업체명, 지역/카테고리, 보상, 남은 수량, 방문 가능 기간
- `방문 참여하기` CTA
- 내 적립금/정산 상태 진입

### 6.2 캠페인 상세

- 업체명과 Google Maps 링크
- 방문 전 유의사항
- 오늘 참여 가능 여부
- 보상 조건: 플랫폼 내 방문 인증과 경험 설문 완료 기준
- Google 리뷰 작성은 자율이며 외부 플랫폼 정책 안내 표시

### 6.3 방문 후 리뷰 작성 보조

스크린샷의 Google Maps 선택지 흐름을 플랫폼 안에서 선제적으로 수집한다.

기본 질문 프리셋:

- 방문 목적: 식사, 카페, 시술, 구매, 상담, 기타
- 방문 시간대: 아침, 점심, 저녁, 야간
- 1인 지출 금액대
- 대기 시간
- 예약 필요성
- 소음 수준
- 주차/접근성
- 동행 유형
- 좋았던 점
- 아쉬웠던 점
- 재방문 의향

AI 초안은 이 응답과 시트 가이드라인만 사용한다. 사용자가 입력하지 않은 경험을 지어내지 않는다.

### 6.4 초안 결과

- 생성 리뷰 초안
- `복사하기`
- `구글맵 열기`
- Google Maps 선택지 추천 요약
- `다시 생성`
- `참여 완료`

## 7. 운영자 UX

### 7.1 시트 수입 대시보드

- 마지막 동기화 시각
- 신규/변경/오류 행 수
- URL 누락, 업체명 누락, 기간 오류, 수량 오류 표시
- Dry-run 후 반영

### 7.2 캠페인 운영 대시보드

- 전체 목표 대비 완료
- 일 목표 대비 오늘 참여
- 남은 수량
- 증빙 대기/승인/반려
- 적립금 발생액
- 정산 대기액

## 8. 구현 순서

### Phase 1: 구조 정정

- `docs/PRD.md`의 owner SaaS 전제를 운영자형으로 교체하거나 본 문서를 기준 문서로 승격.
- `/owner/*` 화면은 신규 개발 중단. 운영자 내부 `/admin/campaigns`로 기능 이동.
- 첫 화면은 리뷰어 캠페인 목록으로 변경.

### Phase 2: 시트 import

- Google Sheet row parser 추가.
- `AdvertiserRequest`/`Campaign` upsert 로직 추가.
- Admin sync API와 dry-run 테스트 추가.

### Phase 3: 리뷰어 캠페인 탐색

- `GET /api/campaigns` 추가.
- `/campaigns` 목록 화면 추가.
- `/campaigns/{slug}` 상세 화면 추가.

### Phase 4: 방문리뷰 보조 플로우

- 기존 `/r/[slug]`와 `ReviewFlow`를 캠페인 참여형으로 리팩터링.
- Google Maps 선택지형 질문 추가.
- Draft 생성 입력을 `ReviewAnswer` 중심으로 전환.
- Google Maps 링크는 캠페인의 `landingUrl` 우선 사용.

### Phase 5: 정산/운영 지표

- 참여 완료 기준 적립 원장 연결.
- Admin 정산 큐와 캠페인별 원가/보상 지표 연결.

## 9. 수용 기준

- 사장님/광고주는 앱 계정을 만들지 않아도 캠페인이 생성될 수 있다.
- 운영자는 Google Sheet 행에서 캠페인을 dry-run으로 미리 보고 반영할 수 있다.
- 리뷰어는 진행 중인 캠페인 목록에서 캠페인을 선택해 참여할 수 있다.
- 리뷰어가 생성한 초안은 실제 입력한 방문 경험과 캠페인 가이드라인만 사용한다.
- Google 리뷰 게시 여부, 별점, 긍정 표현 여부는 적립금 지급 조건이 아니다.
- Google Maps는 새 창으로만 열고, 자동 게시를 시도하지 않는다.
