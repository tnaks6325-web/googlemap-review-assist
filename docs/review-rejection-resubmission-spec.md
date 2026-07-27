# Spec: 리뷰 반려 사유와 보완 제출

## Objective

관리자는 리뷰 캡처를 반려할 때 정해진 사유 또는 직접 입력한 사유를 반드시 남긴다. 리뷰어는 로그인 후 본인의 반려 건과 사유를 확인하고 새 캡처를 보완 제출할 수 있다.

## Tech Stack

- Next.js 16 App Router, React 19, TypeScript
- Prisma 6 (SQLite 테스트, PostgreSQL 운영)
- Vitest

## Commands

- 테스트: `npm test -- test/reviewer-campaign-availability.test.ts test/reviewer-home.test.ts test/admin-campaign-review-submissions-ui.test.tsx`
- 린트: `npm run lint`
- 운영 빌드: `npx prisma generate --schema=prisma/schema.postgres.prisma && npm run build`

## Project Structure

- `components/admin/`: 관리자 반려 사유 선택 UI
- `components/campaign/`: 리뷰어 참여내역과 보완 제출 UI
- `app/api/admin/`: 관리자 반려 API
- `app/api/reviewer/`: 기존 캡처 업로드·AI 재검수 API
- `lib/domain/`: 반려 사유 검증, 제출 상태 전이, 리뷰어 홈 데이터
- `test/`: 도메인 및 UI 회귀 테스트

## Code Style

```ts
const reason = normalizeReviewRejectionReason(input);
if (!reason) throw new ReviewerCampaignError("INVALID_REJECTION_REASON", "반려 사유를 선택해 주세요.");
```

- 기존 도메인 함수와 Tailwind UI 패턴을 따른다.
- 클라이언트 입력은 API 경계와 도메인 경계에서 모두 검증한다.
- 사용자 입력은 React 텍스트 노드로만 렌더링한다.

## Testing Strategy

- 반려 사유 세 종류와 직접 입력 길이 제한을 단위/도메인 테스트로 검증한다.
- 다른 리뷰어의 건, 반려되지 않은 건, 중복 제출 등 권한·상태 오류를 통합 테스트로 검증한다.
- 보완 제출 후 AI 결과에 따라 `REVIEW_SUBMITTED`, `REJECTED`, `COMPLETED`로 전이되는지 검증한다.
- 관리자와 리뷰어 UI의 필수 문구·컨트롤을 회귀 테스트로 검증한다.

## Boundaries

- Always: 관리자/리뷰어 세션 확인, 소유권 확인, 이미지 형식·크기 검증, 입력 길이 제한
- Ask first: 새 DB 컬럼, 새 외부 서비스, 인증 방식 변경
- Never: 타 리뷰어 제출 건 노출, 미검증 파일 저장, 사용자 입력을 HTML로 렌더링

## Success Criteria

1. 관리자는 `타매장 리뷰가 제출되었음`, `리뷰내용 수정필요`, `직접입력` 중 하나를 선택해야 반려할 수 있다.
2. `직접입력` 선택 시 1~500자의 상세 사유가 필수다.
3. 선택된 최종 사유가 반려 기록과 리뷰어 알림에 저장된다.
4. 리뷰어 참여내역에서 본인의 반려 사유, 기존 캡처, 보완 제출 폼을 확인할 수 있다.
5. 새 캡처는 기존 보안 검증과 AI 검수를 거쳐 같은 참여 건에 교체 저장된다.
6. 보완 제출 후 이전 관리자 반려 정보는 초기화되고 새 검수 상태가 표시된다.

## Open Questions

- 없음. 승인된 와이어프레임과 기존 검수 정책을 적용한다.
