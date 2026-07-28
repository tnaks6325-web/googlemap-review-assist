# 원고생성 모델 파인튜닝 운영 명세

## 목표

관리자가 구글맵 리뷰원고용 학습 예시를 수집·검수하고, 버전이 고정된 데이터셋으로 Vertex AI Gemini 3.5 Flash 지도 파인튜닝을 실행·관제하며, 기준 모델보다 나은 튜닝 모델만 운영에 승격할 수 있게 한다.

이 화면에서 말하는 `학습완성도`는 모델의 절대 지능 점수가 아니다. 데이터 수량, 업종·문체 분포, 교정 사례 비중, 검증 데이터 확보, 최근 평가 결과를 합친 운영 준비도다.

## 사용자 흐름

1. 관리자는 사이드바의 `파인튜닝` 메뉴(`/admin/fine-tuning`)를 연다.
2. 대시보드에서 현재 운영 모델, 학습완성도, 승인 대기 자료, 최신 튜닝 작업을 확인한다.
3. 직접 `입력 → 모범 출력` 예시를 등록하거나 기존 관리자 원고 수정 이력을 학습 후보로 가져온다.
4. 후보를 승인·제외하고 `훈련` 또는 `검증` 분할을 지정한다.
5. 최소 준비 조건을 만족하면 데이터셋 버전을 생성한다. 데이터셋은 JSONL로 고정되고 Cloud Storage에 업로드된다.
6. 관리자가 비용 발생 확인 후 Vertex AI 튜닝 작업을 시작한다.
7. 화면에서 작업 상태를 동기화한다. 성공하면 튜닝 모델과 엔드포인트가 후보 모델로 등록된다.
8. 기준 모델과 후보 모델의 블라인드 비교 평가를 기록한다.
9. 승격 기준을 충족한 후보만 운영 모델로 활성화한다. 기존 모델은 즉시 복구 가능한 상태로 보존한다.

## 핵심 원칙

- 생성 결과를 자동으로 정답 취급하지 않는다.
- 관리자 승인 자료만 데이터셋에 포함한다.
- 학습 데이터와 검증 데이터를 중복시키지 않는다.
- 데이터셋 생성 후 내용은 바꾸지 않고 새 버전을 만든다.
- 한 번에 하나의 튜닝 작업만 실행한다.
- 튜닝 성공과 운영 승격을 분리한다.
- 운영 모델 변경은 관리자 확인과 감사 이력을 남긴다.
- 서비스 계정, 액세스 토큰, 전체 Vertex 오류 응답은 클라이언트나 로그에 노출하지 않는다.

## Vertex AI 제약

- 기본 모델: `gemini-3.5-flash`
- 방식: 지도 파인튜닝(SFT)
- 튜닝 리전: `us-central1`
- 서빙 리전: Vertex가 반환하는 `us` 멀티리전 엔드포인트
- 데이터 형식: Gemini 요청 형식의 JSONL
- 권장 시작량: 고품질 훈련 예시 100건 이상
- 검증 데이터: 별도 검증 세트를 강제하며 최소 20건 또는 전체 승인 자료의 20% 중 작은 값을 사용한다.
- 첫 작업은 epoch, learning rate, adapter size를 생략해 Vertex 권장 기본값을 사용한다.
- Gemini 3 이상 튜닝 모델 호출은 thinking level을 `MINIMAL`로 설정한다.

## 데이터 모델

### `DraftTrainingExample`

- `id`
- `sourceType`: `MANUAL | ADMIN_REVISION`
- `sourceRef`: 원본 수정 이력 ID 또는 `null`
- `industry`: 업종 또는 `null`
- `inputText`: 실제 운영 요청과 동일한 구조의 입력
- `outputText`: 관리자가 승인한 모범 원고
- `split`: `TRAIN | VALIDATION`
- `status`: `PENDING | APPROVED | REJECTED | ARCHIVED`
- `qualityWarningsJson`: 길이·민감정보·중복·형식 검사 결과
- `contentHash`: 정규화 입력과 출력의 SHA-256, 중복 방지
- `createdByAdminId`, `approvedByAdminId`
- `createdAt`, `updatedAt`, `approvedAt`

### `DraftTuningDataset`

- `id`, `version`
- `baseModel`
- `status`: `BUILDING | READY | USED | FAILED | ARCHIVED`
- `trainingExampleCount`, `validationExampleCount`
- `trainingGcsUri`, `validationGcsUri`
- `manifestHash`: 포함 예시와 순서의 SHA-256
- `createdByAdminId`, `createdAt`, `readyAt`

### `DraftTuningDatasetExample`

- 데이터셋과 예시의 불변 연결
- `datasetId`, `exampleId`, `split`, `position`
- 동일 데이터셋 안에서 예시 중복 불가

### `DraftTuningJob`

- `id`, `datasetId`
- `vertexJobName`
- `displayName`, `baseModel`, `region`
- `status`: `SUBMITTING | PENDING | RUNNING | SUCCEEDED | FAILED | CANCELLED`
- `tunedModelName`, `tunedEndpointName`, `experimentName`
- `metricsJson`, `errorCode`, `errorMessage`
- `createdByAdminId`, `createdAt`, `updatedAt`, `completedAt`

### `DraftModelRelease`

- `id`, `tuningJobId`
- `modelName`, `endpointName`
- `status`: `CANDIDATE | ACTIVE | RETIRED | REJECTED`
- `evaluationJson`: 블라인드 평가 횟수, 후보 승리율, 품질 실패 수
- `activatedByAdminId`, `activatedAt`, `createdAt`, `updatedAt`

## 학습 예시 계약

관리자 입력은 다음 계약을 따른다.

```ts
type CreateTrainingExampleInput = {
  sourceType: "MANUAL";
  industry?: string;
  inputText: string;
  outputText: string;
  split: "TRAIN" | "VALIDATION";
};
```

제약:

- 입력 20~6,000자, 출력 20~1,000자
- HTML 태그와 제어문자 제거
- 이메일, 전화번호, 주민번호형 문자열은 거부
- 동일 정규화 입력·출력 조합은 중복 등록 불가
- URL, API 키 형태, 프롬프트 탈취 지시문은 경고 또는 거부
- 출력은 리뷰 원고 품질 검사(금칙어, 길이, 반복, 과도한 홍보 문구)를 통과해야 승인 가능

Vertex JSONL 한 줄:

```json
{"systemInstruction":{"parts":[{"text":"구글맵 리뷰 캠페인용 자연스러운 한국어 원고를 작성한다."}]},"contents":[{"role":"user","parts":[{"text":"<inputText>"}]},{"role":"model","parts":[{"text":"<outputText>"}]}]}
```

## API 계약

모든 API는 관리자 세션, 동일 출처 검사(변경 요청), 공유 DB 기반 요청 제한을 적용한다. 오류는 `{ error: { code, message, details? } }` 형식을 사용한다.

### 학습 예시

- `GET /api/admin/fine-tuning/examples?page&pageSize&status&split&sourceType`
- `POST /api/admin/fine-tuning/examples`
- `PATCH /api/admin/fine-tuning/examples/:id`
- `POST /api/admin/fine-tuning/examples/import-revisions`

### 데이터셋

- `GET /api/admin/fine-tuning/datasets`
- `POST /api/admin/fine-tuning/datasets`

데이터셋 생성은 승인된 예시를 스냅샷으로 고정하고 GCS 업로드까지 완료한 뒤 `READY`가 된다.

### 튜닝 작업

- `GET /api/admin/fine-tuning/jobs`
- `POST /api/admin/fine-tuning/jobs`
- `POST /api/admin/fine-tuning/jobs/:id/sync`
- `POST /api/admin/fine-tuning/jobs/:id/cancel`

작업 생성 요청은 `datasetId`, `displayName`, `confirmCost: true`만 받는다. 리전·기본 모델·하이퍼파라미터는 서버 정책으로 고정한다.

### 모델 평가와 승격

- `POST /api/admin/fine-tuning/releases/:id/evaluations`
- `POST /api/admin/fine-tuning/releases/:id/activate`
- `POST /api/admin/fine-tuning/releases/:id/retire`

승격 조건:

- 연결 튜닝 작업 `SUCCEEDED`
- 블라인드 비교 20건 이상
- 후보 승리율 60% 이상
- 금칙어·사실 왜곡·빈 출력 같은 치명 실패 0건
- 관리자가 `confirmActivation: true` 제출

## 학습완성도

100점 기준:

- 승인 훈련 자료 수량 30점: 100건에서 만점
- 업종 분포 15점: 활성 캠페인 주요 업종 중 자료가 있는 비율
- 문체·구조 분포 15점: 목표 문체군별 최소 자료 확보
- 교정 사례 비중 10점: 승인 자료 중 관리자 수정 이력 30%에서 만점
- 검증 데이터 15점: 20건에서 만점
- 최신 모델 평가 15점: 승격 기준을 만족하면 만점

화면은 총점과 함께 부족한 항목을 행동 문구로 표시한다. 예: `검증 자료 8건 추가 필요`.

## 자동 축적

- `CampaignPreparedDraftRevision`을 학습 후보로 가져온다.
- 동일 `sourceRef`는 한 번만 가져온다.
- `beforeText`를 입력, `afterText`를 출력으로 사용하되 캠페인 업종·사실 문맥을 함께 입력에 포함한다.
- 자동 가져온 자료는 항상 `PENDING`이며 관리자가 출력 적합성을 확인해야 한다.
- 반려·비활성·미승인 제출물은 자동 정답으로 사용하지 않는다.

## 운영 모델 선택

- 활성 릴리스가 없으면 `REVIEW_DRAFT_MODEL=gemini-3.5-flash`를 사용한다.
- 활성 릴리스가 있으면 DB에서 반환된 튜닝 엔드포인트를 사용한다.
- 튜닝 엔드포인트 오류 시 기준 모델로 조용히 자동 폴백하지 않는다. 오류를 기록하고 관리자에게 표시해 품질 회귀를 숨기지 않는다.
- 관리자가 릴리스를 폐기하면 즉시 기준 모델 또는 직전 활성 릴리스로 되돌린다.

## 화면 구성

- 사이드바: `파인튜닝`
- 상단 상태 카드: 운영 모델, 학습완성도, 승인 훈련/검증 자료, 실행 중 작업
- `학습 자료` 탭: 수동 등록, 수정 이력 가져오기, 필터, 승인/반려
- `데이터셋` 탭: 준비 조건, 버전 생성, GCS 상태
- `튜닝 작업` 탭: 비용 확인, 작업 시작, 상태 동기화, 오류 요약
- `모델 평가` 탭: 기준/후보 블라인드 비교, 승격 기준, 활성화/복구

## 보안·비용 경계

- 튜닝 작업 시작과 운영 승격은 별도 확인을 요구한다.
- 작업 시작은 관리자별 시간당 2회, 전체 시스템 동시 1개로 제한한다.
- GCS 버킷 이름은 서버 환경변수로만 받고 관리자 입력 URL을 사용하지 않는다.
- JSONL에는 캠페인 참여자의 이름·전화번호·이메일을 포함하지 않는다.
- Vertex/GCS 응답은 허용 필드만 파싱하고 원문 오류를 클라이언트에 반환하지 않는다.
- 데이터셋 삭제 대신 보관 상태로 전환해 재현성과 감사 가능성을 유지한다.

## 명령과 검증

- 테스트: `npm test -- --run`
- 타입 검사: `npx tsc --noEmit`
- 린트: `npm run lint`
- Prisma 생성: `npx prisma generate`
- 로컬 스키마: `npx prisma db push`
- 운영 스키마 검증: `npx prisma validate --schema=prisma/schema.postgres.prisma`
- 빌드: `npm run build`
- 보안 감사: `npm audit --omit=dev`

## 구현 작업

- [ ] 학습 예시 검증·중복·완성도 계산 순수 로직과 실패 테스트
- [ ] 양쪽 Prisma 스키마에 예시·데이터셋·작업·릴리스 모델 추가
- [ ] 학습 예시 CRUD와 관리자 수정 이력 후보 가져오기
- [ ] GCS JSONL 업로드와 불변 데이터셋 버전 생성
- [ ] Vertex 튜닝 작업 생성·조회·취소 어댑터
- [ ] 모델 평가·승격 정책과 활성 릴리스 조회
- [ ] 원고 생성 게이트웨이의 튜닝 엔드포인트 지원
- [ ] 관리자 사이드바와 파인튜닝 운영 화면
- [ ] API·컴포넌트·스키마 회귀 테스트와 브라우저 검증

## 완료 기준

- 관리자가 화면에서 자료를 직접 추가하고 수정 이력을 후보로 가져올 수 있다.
- 승인 자료만 버전 데이터셋에 포함되고 생성 후 변경되지 않는다.
- 준비 조건을 충족한 데이터셋으로 실제 Vertex 튜닝 작업을 시작·동기화할 수 있다.
- 성공한 모델을 평가 기록 없이 운영에 활성화할 수 없다.
- 활성 튜닝 엔드포인트가 원고 생성에 실제 사용되며 폐기 시 복구된다.
- 관리자 인증, 입력 검증, 요청 제한, 비밀정보 비노출이 테스트로 증명된다.
- 전체 테스트, Prisma 검증, 빌드, 보안 감사와 브라우저 동작 확인을 통과한다.
