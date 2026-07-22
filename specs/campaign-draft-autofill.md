# Spec: Campaign draft auto-fill and language diversity

## Objective

When an administrator starts draft generation, keep generating and saving drafts until the campaign has 25 quality-passed, unassigned drafts. Quality-excluded drafts remain visible in the archive but do not count toward the target. Generated Korean should use visibly varied sentence structures and ending styles instead of repeatedly ending in `~니다`.

## Tech Stack

- Next.js 16 route handlers and React client components
- TypeScript
- Prisma
- Vitest and Testing Library
- Gemini structured output

## Commands

- Focused domain tests: `npx vitest run test/campaign-review-draft.test.ts test/review-draft-diversity.test.ts`
- Focused UI tests: `npx vitest run test/admin-campaign-draft-preview.test.tsx`
- Full tests: `npm test`
- Lint: `npm run lint`
- Production build: `npm run build`

## Project Structure

- `lib/domain/review-draft-diversity.ts`: language profiles and quality rules
- `lib/domain/campaign-review-draft.ts`: generation, validation, incremental storage, and refill loop
- `app/api/admin/campaigns/[campaignId]/draft-preview/route.ts`: streamed progress contract
- `components/admin/AdminCampaignDraftPreview.tsx`: administrator progress UI and continuation
- `test/`: unit, integration, and component regression tests

## Code Style

```ts
const accepted = candidates.filter((candidate) =>
  findDraftQualityIssues(candidate.text, acceptedTexts).length === 0,
);
```

Use explicit domain names, bounded external calls, sequential quality selection, and additive streamed progress. Do not hide quality-excluded drafts or overwrite stored drafts.

## Testing Strategy

- Unit-test ending-style classification and overuse detection.
- Reproduce the current symmetric quality-rejection bug and prove sequential acceptance.
- Integration-test that multiple generation rounds persist progress until 25 unassigned drafts exist.
- Component-test that the button shows both prepared-draft progress and the current generation attempt.
- Run the full suite, lint, build, then verify one production campaign end to end.

## Boundaries

- Always: count only quality-passed unassigned drafts toward 25; preserve excluded drafts; compare with existing passed drafts; bound each external request; stream monotonic progress.
- Ask first: schema migrations, new dependencies, or deletion of stored drafts.
- Never: fabricate visitor experiences, silently count excluded drafts, loop without a time/cost boundary, or discard successful rounds after a later failure.

## Success Criteria

1. One administrator action continues through additional generation rounds until 25 unassigned quality-passed drafts are stored.
2. Every successful round is stored before the next round begins.
3. Progress distinguishes stored unassigned drafts from drafts currently being generated and never moves backward.
4. A repeated `~니다` ending style is rejected after its configured corpus limit, while multiple natural Korean ending profiles are requested across style slots.
5. Existing archive, assignment, and quality-exclusion behavior remains intact.

## Open Questions

None. If the server execution window is nearly exhausted, the client continues with another streamed request using the already stored count.
