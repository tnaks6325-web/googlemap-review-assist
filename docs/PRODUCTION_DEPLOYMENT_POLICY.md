# Google Maps Review Assist 운영 배포 정책

이 문서는 운영 배포의 원본과 이력을 하나의 Git 계보로 고정한다. 운영 배포는
로컬 작업 폴더나 임시 Vercel 배포를 원본으로 삼지 않는다.

## 단일 운영 경로

```text
feature branch → Pull Request → CI(build-test) → main 병합 → Vercel Production → health check
```

- `main`만 운영 원본이다. Vercel Production Branch Tracking도 반드시 `main`으로 둔다.
- 기능 브랜치는 Vercel Preview에서만 검토한다.
- `vercel.json`의 `ignoreCommand`는 운영 환경에서 `main`과 Git commit SHA가 모두
  확인되지 않으면 빌드를 취소한다. 따라서 로컬 작업 브랜치 또는 Git 출처가 없는
  `vercel --prod`는 운영본을 만들 수 없다.
- 운영 데이터베이스 변경은 배포 스크립트에 명시된 검토 완료된 additive migration만
  허용한다. 일반적인 schema push는 사용하지 않는다.

## 배포 족보 기록

각 운영 변경은 다음 네 링크를 PR 설명 또는 병합 댓글에 남긴다.

1. Pull Request URL
2. 통과한 `build-test` CI 실행 URL
3. 병합된 `main` commit SHA
4. Vercel Production deployment URL과 `/api/health` 확인 결과

Vercel 화면에서 이전 배포를 Promote하거나, 대시보드/CLI로 임의 Production 배포를
만들어 이 계보를 건너뛰지 않는다. GitHub의 PR과 `main` commit이 운영 상태의
정본이며, Vercel 배포는 그 commit의 결과물이다.

## 롤백

장애가 발생하면 이전 로컬 배포를 다시 올리지 않는다.

1. 문제를 만든 `main` 병합 commit을 되돌리는 revert PR을 만든다.
2. CI를 통과시킨 뒤 `main`에 병합한다.
3. Vercel이 새 commit으로 Production을 자동 배포한 뒤 health check를 기록한다.

긴급 수정도 `hotfix/*` 브랜치와 PR을 사용한다. 운영 관리자는 Vercel 프로젝트의
Production Branch Tracking을 바꾸거나 `ignoreCommand`를 우회하지 않는다.

## 운영자 설정 점검

- GitHub `main`: PR 필수, `build-test` 필수, force push 금지, 관리자도 규칙 적용.
- Vercel: Git repository 연결, Production Branch Tracking = `main`.
- Vercel Environment Variables: **Automatically expose System Environment Variables**를
  켠다. 배포 차단기는 `VERCEL_GIT_COMMIT_REF`와 `VERCEL_GIT_COMMIT_SHA`를 사용하며,
  이 설정이 꺼져 있으면 안전하게 운영 빌드를 취소한다.
- Vercel 팀/토큰: 일반 작업 계정과 토큰에는 **Full Production Deployment** 권한을
  부여하지 않는다. 프로젝트 관리자·팀 소유자는 이 권한을 우회할 수 있으므로 비상
  작업 외에는 이 계정을 CLI에 로그인시키지 않는다.
- 서명된 커밋을 운영할 수 있는 경우에만 Vercel의 **Require Verified Commits**를 켠다.
  서명되지 않은 기존 자동화 커밋까지 차단할 수 있으므로 먼저 CI/배포 흐름을 확인한다.
