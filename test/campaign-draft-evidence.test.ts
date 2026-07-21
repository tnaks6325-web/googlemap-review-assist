import { readFileSync } from "node:fs";
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

  it("automatically applies every fact card regardless of its legacy status", () => {
    const weak = summarizeEvidenceReadiness([
      { status: "PENDING", facet: "SPACE" },
      { status: "REJECTED", facet: "SPACE" },
    ]);
    const ready = summarizeEvidenceReadiness([
      { status: "APPROVED", facet: "SPACE" },
      { status: "PENDING", facet: "SPACE" },
      { status: "REJECTED", facet: "ACCESS" },
      { status: "PENDING", facet: "ACCESS" },
      { status: "APPROVED", facet: "OPERATIONS" },
      { status: "REJECTED", facet: "OPERATIONS" },
    ]);

    expect(weak.ready).toBe(false);
    expect(ready).toMatchObject({ ready: true, evidenceCount: 6, facetCount: 3 });
  });

  it("extracts idempotent cards that are immediately applied", async () => {
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
      expect(second.evidence.length).toBeGreaterThan(0);
      expect(second.evidence.every((item) => item.status === "APPROVED")).toBe(true);
    } finally {
      if (originalProvider == null) delete process.env.REVIEW_DRAFT_PROVIDER;
      else process.env.REVIEW_DRAFT_PROVIDER = originalProvider;
    }
  });

  it("removes approval and rejection controls from the fact-card UI", () => {
    const source = readFileSync(
      new URL("../components/admin/AdminCampaignDraftEvidence.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("추출 즉시 원고 생성에 자동 적용됩니다.");
    expect(source).not.toContain("onClick={() => decide");
    expect(source).not.toContain(">승인<");
    expect(source).not.toContain(">반려<");
  });
});
