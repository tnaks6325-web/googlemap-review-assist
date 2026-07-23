# Spec: 캠페인별 리뷰 제출함

## Objective

관리자가 캠페인 운영 표의 각 행에서 해당 캠페인에 제출된 구글맵 리뷰 캡처를 빠르게 확인하고, AI 검수 결과를 보조 정보로 사용해 수동 승인 또는 반려할 수 있게 한다.

## Assumptions

- “검수 미통과”에는 AI 자동 반려(`AUTO_REJECT`)와 수동 확인 대기 상태가 모두 포함된다.
- 지급 완료(`COMPLETED`) 건은 이 화면에서 읽기 전용이며 다시 반려하지 않는다.
- AI 자동 반려 건은 관리자가 육안 확인 후 승인으로 덮어쓸 수 있다. 포인트는 기존 멱등 키로 정확히 한 번만 지급한다.
- 리뷰 원본 저장 URL은 응답하지 않고 기존 관리자 인증 이미지 경로만 제공한다.

## Tech Stack

- Next.js 16 App Router, React 19, TypeScript
- Prisma 6, SQLite(테스트/로컬)와 PostgreSQL(운영)
- Vitest 4, Tailwind CSS 4

## Commands

- Focused test: `npm test -- test/admin-campaign-review-submissions.test.ts test/reviewer-campaign-availability.test.ts`
- Full test: `npm test`
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Production build: `node scripts/vercel-build.mjs`
- Dev: `npm run dev`

## Project Structure

- `lib/domain/`: 캠페인별 제출 조회와 검수 상태 전이
- `app/api/admin/`: 관리자 인증·입력 검증을 수행하는 API 경계
- `components/admin/`: 캠페인 행 버튼, 제출함 모달, 확대 보기
- `test/`: 데이터 격리·상태 전이·UI 계약 회귀 테스트

## API Contract

### `GET /api/admin/campaigns/:campaignId/review-submissions`

Query: `page`(기본 1), `pageSize`(기본 24, 최대 50).

Response:

```ts
interface CampaignReviewSubmissionsResponse {
  campaign: { id: string; campaignName: string; businessName: string };
  data: Array<{
    id: string;
    reviewerLabel: string;
    fileName: string | null;
    imageUrl: string;
    submittedAt: string;
    status: "PENDING" | "PASSED" | "FAILED";
    analysisStatus: string | null;
    analysisReason: string | null;
    similarity: number | null;
    reviewedAt: string | null;
    reviewedBy: string | null;
    reviewNote: string | null;
  }>;
  summary: { total: number; pending: number; passed: number; failed: number };
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
```

Errors use the existing `{ error: { code, message } }` shape. The route requires an admin session and never exposes `reviewProofImageUrl`.

### `POST /api/admin/review-proofs/:assignmentId`

Existing contract remains additive: `{ action: "approve" | "reject", note?: string }`. `note` is trimmed and limited to 500 characters. Approval accepts `REVIEW_SUBMITTED` and AI-rejected `REJECTED` items; completed items stay idempotent/read-only.

## Code Style

```ts
const parsed = parsePagination(request.url);
if (!parsed.ok) return err("INVALID_PAGINATION", "페이지 값을 확인해 주세요.", 400);

const result = await listCampaignReviewSubmissions(campaignId, parsed.value);
return ok(result);
```

Use descriptive camelCase names, boundary validation in route handlers, and existing Korean admin copy/tokens.

## Testing Strategy

- Integration: campaign isolation, newest-first order, pagination, per-status summary and submission count.
- Domain: AI rejected proof can be manually approved once; duplicate approval never duplicates points.
- Static UI contract: row button/count, thumbnail/table toggle, dialog and enlarged image controls.
- Runtime: administrator opens a campaign submission modal, switches views, enlarges an image and processes a pending/failed item.

## Boundaries

- Always: admin authorization, Origin check for mutations, bounded pagination, authenticated image proxy, auditable actor/note.
- Ask first: schema migration, new dependency, new PII category, changes to authentication.
- Never: expose raw Blob URL, trust client status, award points without the existing idempotency key, stage unrelated workspace files.

## Success Criteria

- Every campaign row shows `리뷰제출함 N건`; zero-count rows remain disabled.
- The modal supports thumbnail and table views, loading/error/empty states, and a click-to-enlarge image lightbox.
- Every file shows final pass/pending/fail status plus AI result metadata.
- Pending and failed items can be approved or rejected by an admin; completed items are read-only.
- Campaign A cannot return Campaign B submissions, results are paginated, and raw storage URLs never enter JSON.
- Focused and full tests, typecheck, lint, production build and production health check succeed before release.

## Implementation Plan

1. Add failing domain/integration tests for campaign submission lists, counts, pagination and AI-reject override.
2. Implement the domain query, campaign-row aggregate and the authenticated list API.
3. Implement the accessible modal and connect it to each campaign row.
4. Review correctness/security/performance, run release checks, publish and verify deployment.

## Rollback

Revert the release commit and redeploy. No schema or destructive data migration is introduced; existing reviewer 검수 page and image endpoint remain available throughout.
