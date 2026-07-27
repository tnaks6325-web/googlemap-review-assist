import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  reanalyzeAdminCampaignReviewSubmissions,
  countAdminCampaignReviewSubmissions,
  listAdminCampaignReviewSubmissions,
} from "@/lib/domain/admin-campaign-review-submissions";

let sequence = 0;
const unique = () => `${Date.now()}-${sequence++}`;

async function createCampaign(label: string) {
  const owner = await prisma.owner.create({
    data: { email: `${label}-${unique()}@test.local`, password: "x" },
  });
  const business = await prisma.business.create({
    data: { ownerId: owner.id, name: `${label} 매장`, address: "서울 테스트로 1" },
  });
  const campaign = await prisma.campaign.create({
    data: { businessId: business.id, slug: `${label}-${unique()}`, name: `${label} 캠페인` },
  });
  return { business, campaign };
}

async function createSubmission(
  fixture: Awaited<ReturnType<typeof createCampaign>>,
  status: "REVIEW_SUBMITTED" | "COMPLETED" | "REJECTED",
  submittedAt: Date,
) {
  const reviewer = await prisma.reviewer.create({
    data: { email: `reviewer-${unique()}@test.local`, name: `리뷰어 ${sequence}` },
  });
  return prisma.receipt.create({
    data: {
      businessId: fixture.business.id,
      campaignId: fixture.campaign.id,
      reviewerId: reviewer.id,
      source: "CAMPAIGN_ASSIGNMENT",
      status,
      dedupeHash: `submission-${unique()}`,
      reviewProofImageUrl: `private/review-proof-${unique()}.png`,
      reviewProofMimeType: "image/png",
      reviewProofOriginalName: `리뷰-${sequence}.png`,
      reviewProofSubmittedAt: submittedAt,
      reviewProofAnalysisStatus:
        status === "COMPLETED" ? "AUTO_APPROVE" : status === "REJECTED" ? "AUTO_REJECT" : "MANUAL_REVIEW",
      reviewProofAnalysisReason: status === "REJECTED" ? "LOW_SIMILARITY" : null,
      reviewProofSimilarity: status === "COMPLETED" ? 0.94 : 0.31,
      reviewProofAnalysisJson:
        status === "COMPLETED"
          ? JSON.stringify({ checks: { placeName: "PASS" } })
          : status === "REJECTED"
            ? JSON.stringify({ checks: { placeName: "FAIL" } })
            : null,
      reviewReviewedAt: status === "REVIEW_SUBMITTED" ? null : submittedAt,
      reviewReviewedBy: status === "REVIEW_SUBMITTED" ? null : "ai:test",
    },
  });
}

describe("admin campaign review submissions", () => {
  it("returns only the selected campaign, newest first, with pagination and status summary", async () => {
    const selected = await createCampaign("selected");
    const other = await createCampaign("other");
    const pending = await createSubmission(selected, "REVIEW_SUBMITTED", new Date("2026-07-20T01:00:00Z"));
    const failed = await createSubmission(selected, "REJECTED", new Date("2026-07-20T02:00:00Z"));
    const passed = await createSubmission(selected, "COMPLETED", new Date("2026-07-20T03:00:00Z"));
    await createSubmission(other, "COMPLETED", new Date("2026-07-20T04:00:00Z"));

    const firstPage = await listAdminCampaignReviewSubmissions(selected.campaign.id, {
      page: 1,
      pageSize: 2,
    });

    expect(firstPage.campaign).toMatchObject({
      id: selected.campaign.id,
      campaignName: selected.campaign.name,
      businessName: selected.business.name,
    });
    expect(firstPage.data.map((item) => item.id)).toEqual([passed.id, failed.id]);
    expect(firstPage.data.map((item) => item.status)).toEqual(["PASSED", "FAILED"]);
    expect(firstPage.data.map((item) => item.placeNameCheck)).toEqual(["PASS", "FAIL"]);
    expect(firstPage.data[0].imageUrl).toBe(`/api/admin/review-proofs/${passed.id}`);
    expect(JSON.stringify(firstPage)).not.toContain("private/review-proof");
    expect(firstPage.summary).toEqual({ total: 3, pending: 1, passed: 1, failed: 1 });
    expect(firstPage.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
    });

    const secondPage = await listAdminCampaignReviewSubmissions(selected.campaign.id, {
      page: 2,
      pageSize: 2,
    });
    expect(secondPage.data.map((item) => item.id)).toEqual([pending.id]);
    expect(secondPage.data[0].placeNameCheck).toBe("UNKNOWN");
  });

  it("counts submitted proof files per campaign without an N+1 query surface", async () => {
    const first = await createCampaign("count-first");
    const second = await createCampaign("count-second");
    await createSubmission(first, "REVIEW_SUBMITTED", new Date());
    await createSubmission(first, "REJECTED", new Date());
    await createSubmission(second, "COMPLETED", new Date());

    const counts = await countAdminCampaignReviewSubmissions([
      first.campaign.id,
      second.campaign.id,
    ]);

    expect(counts.get(first.campaign.id)).toBe(2);
    expect(counts.get(second.campaign.id)).toBe(1);
  });

  it("bulk reanalyzes pending manual reviews and only auto-approves newly matching proofs", async () => {
    const fixture = await createCampaign("bulk-reanalysis");
    const matchingReviewer = await prisma.reviewer.create({
      data: { email: `matching-${unique()}@test.local`, name: "일치 리뷰어" },
    });
    const unmatchedReviewer = await prisma.reviewer.create({
      data: { email: `unmatched-${unique()}@test.local`, name: "확인필요 리뷰어" },
    });
    const draftText = "병원에 방문했는데 원장님과 간호사분들이 친절하고 깔끔해서 만족했습니다.";

    await prisma.business.update({
      where: { id: fixture.business.id },
      data: { name: "천안바른마취통증의학과" },
    });
    const matching = await prisma.receipt.create({
      data: {
        businessId: fixture.business.id,
        campaignId: fixture.campaign.id,
        reviewerId: matchingReviewer.id,
        source: "CAMPAIGN_ASSIGNMENT",
        status: "REVIEW_SUBMITTED",
        dedupeHash: `matching-${unique()}`,
        reviewDraftText: draftText,
        reviewProofImageUrl: `private/matching-${unique()}.png`,
        reviewProofMimeType: "image/png",
        reviewProofOriginalName: "matching.png",
        reviewProofSubmittedAt: new Date("2026-07-24T01:00:00Z"),
        reviewProofExtractedText: `천안바른마취통증\n${draftText}`,
        reviewProofSimilarity: 1,
        reviewProofAnalysisStatus: "MANUAL_REVIEW",
        reviewProofAnalysisReason: "PLACE_NAME_NOT_FOUND",
        reviewProofAnalysisProvider: "test-ocr",
      },
    });
    const unmatched = await prisma.receipt.create({
      data: {
        businessId: fixture.business.id,
        campaignId: fixture.campaign.id,
        reviewerId: unmatchedReviewer.id,
        source: "CAMPAIGN_ASSIGNMENT",
        status: "REVIEW_SUBMITTED",
        dedupeHash: `unmatched-${unique()}`,
        reviewDraftText: draftText,
        reviewProofImageUrl: `private/unmatched-${unique()}.png`,
        reviewProofMimeType: "image/png",
        reviewProofOriginalName: "unmatched.png",
        reviewProofSubmittedAt: new Date("2026-07-24T02:00:00Z"),
        reviewProofExtractedText: `다른 병원\n${draftText}`,
        reviewProofSimilarity: 1,
        reviewProofAnalysisStatus: "MANUAL_REVIEW",
        reviewProofAnalysisReason: "PLACE_NAME_NOT_FOUND",
        reviewProofAnalysisProvider: "test-ocr",
      },
    });

    const result = await reanalyzeAdminCampaignReviewSubmissions(fixture.campaign.id);

    expect(result).toEqual({ total: 2, autoApproved: 1, stillPending: 1, skipped: 0 });
    expect(await prisma.receipt.findUnique({ where: { id: matching.id } })).toMatchObject({
      status: "COMPLETED",
      reviewProofAnalysisStatus: "AUTO_APPROVE",
      reviewReviewedBy: "ai:stored-ocr-reanalysis",
    });
    expect(await prisma.receipt.findUnique({ where: { id: unmatched.id } })).toMatchObject({
      status: "REVIEW_SUBMITTED",
      reviewProofAnalysisStatus: "MANUAL_REVIEW",
      reviewProofAnalysisReason: "PLACE_NAME_NOT_FOUND",
    });
  });
});
