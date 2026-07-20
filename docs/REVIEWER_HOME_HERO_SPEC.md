# Spec: 리뷰어 홈 히어로

## Objective

리뷰어가 첫 화면에서 로그인한 Google 계정을 확인하고, 오늘 참여 가능한 캠페인 수와 모두 완료했을 때 받을 수 있는 총 포인트를 즉시 이해할 수 있게 한다.

### 사용자 경험

- `/`와 `/campaigns`는 같은 리뷰어 홈 화면을 제공한다.
- 로그인한 리뷰어에게 Google 계정의 이름과 이메일을 표시한다.
- 비로그인 사용자에게는 Google 로그인 버튼을 표시한다.
- 로그인한 리뷰어의 7일 장소 쿨다운을 반영한 참여 가능 캠페인 수와 총 포인트를 표시한다.
- 비로그인 사용자는 공개 기준의 참여 가능 캠페인 수와 총 포인트를 미리 볼 수 있다.
- 히어로 아래에는 기존 캠페인 카드와 내 적립금·정책 링크가 이어진다.

## Tech Stack

- Next.js 16.2 App Router
- React 19 Server/Client Components
- Prisma 6
- Tailwind CSS 4
- Vitest 4

## Commands

- 개발: `npm run dev`
- 테스트: `npm test`
- 집중 테스트: `npx vitest run test/reviewer-home.test.ts`
- 린트: `npm run lint`
- 빌드: `npm run build`

## Project Structure

- `app/campaigns/page.tsx`: 서버에서 세션과 홈 데이터를 조회하는 페이지
- `components/campaign/`: 히어로와 캠페인 목록 표현
- `components/auth/`: Google 로그인 후 페이지 갱신을 담당하는 클라이언트 경계
- `lib/domain/`: 리뷰어에게 노출 가능한 계정 DTO와 홈 집계
- `test/`: 홈 데이터 및 인증 경계 테스트

## Code Style

서버에서 인증과 데이터 선택을 끝내고, 클라이언트에는 화면에 필요한 최소 DTO만 전달한다.

```ts
return {
  account: reviewer?.googleSub
    ? { name: reviewer.name, email: reviewer.email, avatarUrl: reviewer.avatarUrl }
    : null,
  availableCount: availability.availableCount,
  totalRewardPoints: availability.totalRewardPoints,
};
```

## Testing Strategy

- 단위/통합 테스트: 세션의 리뷰어 ID에 해당하는 계정만 조회하고 허용된 필드만 반환하는지 검증한다.
- 기존 가용성 테스트: 쿨다운 제외와 포인트 합계 로직을 회귀 검증한다.
- 빌드/린트: Server/Client Component 경계와 타입 오류를 검증한다.
- 브라우저: 모바일 우선 레이아웃, 비로그인 상태, 콘솔 오류를 확인한다.

## Boundaries

- Always: 서버에서 세션을 검증하고 계정 필드를 명시적으로 선택한다.
- Always: 기존 개인별 캠페인 가용성 로직을 재사용한다.
- Ask first: Google 로그인 방식, 세션 형식, DB 스키마 변경.
- Never: Google 토큰·세션 토큰·전화번호를 클라이언트에 노출하지 않는다.
- Never: 클라이언트가 전달한 리뷰어 ID로 프로필을 조회하지 않는다.

## Success Criteria

- 첫 화면 상단에 계정 영역과 두 개의 핵심 지표가 표시된다.
- 로그인 사용자는 본인의 이름·이메일을 확인할 수 있다.
- 비로그인 사용자는 같은 위치에서 Google 로그인을 시작할 수 있다.
- 로그인 사용자의 지표는 7일 쿨다운을 반영한다.
- 0건/0포인트 상태에서도 레이아웃이 깨지지 않는다.
- 모바일과 데스크톱에서 캠페인 목록으로 자연스럽게 이어진다.
- 집중 테스트, 전체 테스트, 린트, 빌드가 통과한다.

## Open Questions

- 없음. 계정 사진은 유효한 Google 프로필 URL이 있을 때만 보이고, 없으면 이름 또는 이메일의 첫 글자를 사용한다.
