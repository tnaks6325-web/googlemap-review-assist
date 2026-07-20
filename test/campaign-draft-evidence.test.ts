import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  CAMPAIGN_DRAFT_EVIDENCE_FACETS,
  CAMPAIGN_DRAFT_EVIDENCE_MAX_OUTPUT_TOKENS,
  CAMPAIGN_DRAFT_EVIDENCE_TIMEOUT_MS,
  normalizeExtractedEvidence,
  summarizeCampaignDraftEvidenceFailure,
  extractCampaignDraftEvidence,
  summarizeEvidenceReadiness,
  updateCampaignDraftEvidence,
} from "@/lib/domain/campaign-draft-evidence";
import { generateUniqueSlug } from "@/lib/domain/codes";

let evidenceSequence = 0;

describe("campaign draft evidence", () => {
  it("summarizes unknown provider failures without leaking their message", () => {
    const error = new Error(
      "Gemini request failed for https://example.test?key=secret-key " +
        "AIzaSySuperSecretCredential campaign source text",
    );

    expect(summarizeCampaignDraftEvidenceFailure(error)).toEqual({
      name: "Error",
      category: "provider",
      message: "Provider operation failed",
    });
  });

  it("allows long structured Gemini extraction for large campaign source sets", () => {
    expect(CAMPAIGN_DRAFT_EVIDENCE_TIMEOUT_MS).toBe(45_000);
    expect(CAMPAIGN_DRAFT_EVIDENCE_MAX_OUTPUT_TOKENS).toBe(8_192);
  });

  it("accepts only allowlisted source references and facets", () => {
    const normalized = normalizeExtractedEvidence(
      [
        { facet: "SPACE", fact: "좌석 간격이 넓게 구성되어 있다", sourceRef: "review-1" },
        { facet: "UNKNOWN", fact: "허용되지 않는 분류", sourceRef: "review-1" },
        { facet: "ACCESS", fact: "출처가 없는 정보", sourceRef: "missing" },
      ],
      new Map([
        [
          "review-1",
          {
            sourceType: "GOOGLE_REVIEW",
            excerpt: "좌석 간격이 넓어서 이동하기 편했다는 내용",
          },
        ],
      ]),
    );

    expect(CAMPAIGN_DRAFT_EVIDENCE_FACETS).toContain("SPACE");
    expect(normalized).toEqual([
      {
        facet: "SPACE",
        fact: "좌석 간격이 넓게 구성되어 있다",
        sourceRef: "review-1",
        sourceType: "GOOGLE_REVIEW",
        sourceExcerpt: "좌석 간격이 넓어서 이동하기 편했다는 내용",
      },
    ]);
  });

  it("deduplicates normalized facts and strips markup", () => {
    const sources = new Map([
      ["place-1", { sourceType: "GOOGLE_PLACE", excerpt: "<b>역 인근</b>" }],
    ]);
    const normalized = normalizeExtractedEvidence(
      [
        { facet: "ACCESS", fact: "<b>역 인근에 위치</b>", sourceRef: "place-1" },
        { facet: "ACCESS", fact: "역 인근에 위치", sourceRef: "place-1" },
      ],
      sources,
    );

    expect(normalized).toHaveLength(1);
    expect(normalized[0].fact).toBe("역 인근에 위치");
    expect(normalized[0].sourceExcerpt).toBe("역 인근");
  });

  it("requires six approved cards across three facets for a ready campaign", () => {
    const weak = summarizeEvidenceReadiness([
      { status: "APPROVED", facet: "SPACE" },
      { status: "APPROVED", facet: "SPACE" },
    ]);
    const ready = summarizeEvidenceReadiness([
      { status: "APPROVED", facet: "SPACE" },
      { status: "APPROVED", facet: "SPACE" },
      { status: "APPROVED", facet: "ACCESS" },
      { status: "APPROVED", facet: "ACCESS" },
      { status: "APPROVED", facet: "OPERATIONS" },
      { status: "APPROVED", facet: "OPERATIONS" },
    ]);

    expect(weak.ready).toBe(false);
    expect(ready).toMatchObject({ ready: true, approvedCount: 6, approvedFacetCount: 3 });
  });

  it("extracts idempotent pending cards and persists admin decisions", async () => {
    const owner = await prisma.owner.create({
      data: { email: `evidence-${Date.now()}-${evidenceSequence++}@test.local`, password: "x" },
    });
    const business = await prisma.business.create({
      data: { ownerId: owner.id, name: "사실 카드 테스트", address: "서울 테스트로 1" },
    });
    const campaign = await prisma.campaign.create({
      data: {
        businessId: business.id,
        slug: await generateUniqueSlug(),
        name: "evidence-campaign",
      },
    });
    await prisma.externalPlace.create({
      data: {
        businessId: business.id,
        platform: "GOOGLE",
        externalId: `evidence-place-${evidenceSequence++}`,
        name: "사실 카드 테스트",
        address: "서울 테스트로 1",
        category: "카페",
      },
    });
    const originalProvider = process.env.REVIEW_DRAFT_PROVIDER;
    process.env.REVIEW_DRAFT_PROVIDER = "template";
    try {
      const first = await extractCampaignDraftEvidence(campaign.id);
      const second = await extractCampaignDraftEvidence(campaign.id);
      expect(second.evidence).toHaveLength(first.evidence.length);
      const target = second.evidence[0];
      const updated = await updateCampaignDraftEvidence(campaign.id, [
        { id: target.id, status: "APPROVED" },
      ]);
      expect(updated.evidence.find((item) => item.id === target.id)?.status).toBe("APPROVED");
    } finally {
      if (originalProvider == null) delete process.env.REVIEW_DRAFT_PROVIDER;
      else process.env.REVIEW_DRAFT_PROVIDER = originalProvider;
    }
  });
});
