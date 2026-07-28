# Vertex AI 원고 생성 운영 설정

원고 생성과 원고 사실카드 추출은 기본적으로 Vertex AI의 `gemini-3.5-flash`를 사용한다. `REVIEW_DRAFT_PROVIDER`를 생략해도 `vertex`가 선택되며, 자격증명이 없을 때 다른 제공자나 템플릿으로 자동 전환하지 않는다.

## Google Cloud 준비

1. 결제가 연결된 Google Cloud 프로젝트에서 Vertex AI API를 활성화한다.
2. 전용 서비스 계정을 만들고 프로젝트에 `Vertex AI User` 역할을 부여한다.
3. 운영 환경에 아래 값을 서버 전용 비밀로 등록한다.

```dotenv
REVIEW_DRAFT_PROVIDER="vertex"
REVIEW_DRAFT_MODEL="gemini-3.5-flash"
VERTEX_AI_PROJECT_ID="your-project-id"
VERTEX_AI_LOCATION="global"
VERTEX_AI_SERVICE_ACCOUNT_BASE64="base64-encoded-service-account-json"
```

현재 Vercel 배포는 Base64로 인코딩한 전용 서비스 계정 JSON을 사용한다. 서비스 계정은 원고 생성 전용으로 분리하고 `Vertex AI User` 이외의 불필요한 역할을 부여하지 않는다.

## 비밀값 생성

PowerShell에서 내려받은 서비스 계정 JSON을 한 줄 Base64 값으로 변환할 수 있다.

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("service-account.json"))
```

원본 JSON과 Base64 값은 Git, 로그, 관리자 화면에 저장하지 않는다. 환경 변수 등록 후 로컬 파일은 안전한 비밀 저장소로 옮기거나 폐기한다.

## 동작 경로

- 단건 원고 생성: Vertex `generateContent`
- 구조화 원고 생성: Vertex `generateContent` + JSON 응답 스키마
- 25건 미리보기: Vertex `streamGenerateContent` + SSE
- 캠페인 사실카드 추출: Vertex `generateContent`
- 상태 확인: `/api/health`의 `integrations.reviewDraft`

## 롤백

장애 시에만 기존 Gemini API 경로를 명시적으로 선택할 수 있다.

```dotenv
REVIEW_DRAFT_PROVIDER="gemini"
GEMINI_API_KEY="..."
```

자동 롤백은 사용하지 않는다. 제공자 변경 후에는 동일한 캠페인 평가 세트로 사실 준수, 자연스러움, 유형 분리, 원고 간 유사도를 다시 측정한다.
