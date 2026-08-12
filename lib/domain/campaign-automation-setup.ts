import { prisma } from "@/lib/db";
import { findBestNaverPlaceSnapshotForCampaign } from "@/lib/domain/admin-campaign-naver";
import { collectCampaignBlogReferences } from "@/lib/domain/campaign-blog-references";
import { extractCampaignDraftEvidence } from "@/lib/domain/campaign-draft-evidence";
import { fillCampaignPreparedDraftPool } from "@/lib/domain/campaign-prepared-draft-pool";
import { evaluateCampaignAutomationGate } from "@/lib/domain/campaign-automation-policy";
import { saveExternalPlace } from "@/lib/domain/external-place-save";

export type CampaignAutomationSetupResult =
  | { status: "READY" }
  | { status: "NEEDS_REVIEW"; reason: "NAVER_PLACE" | "REFERENCE_EMPTY" | "DRAFT_EVIDENCE" | "DRAFT_QUALITY" };

export interface CampaignAutomationSetupDependencies {
  linkNaverPlace: (campaignId: string) => Promise<boolean>;
  collectReferences: (campaignId: string) => Promise<boolean>;
  extractEvidence: (campaignId: string) => Promise<boolean>;
  fillPreparedDraftPool: (campaignId: string) => Promise<boolean>;
  activateCampaign: (campaignId: string) => Promise<void>;
}

export async function runCampaignAutomationSetup(
  campaignId: string,
  dependencies: CampaignAutomationSetupDependencies,
): Promise<CampaignAutomationSetupResult> {
  if (!(await dependencies.linkNaverPlace(campaignId))) return { status: "NEEDS_REVIEW", reason: "NAVER_PLACE" };
  if (!(await dependencies.collectReferences(campaignId))) return { status: "NEEDS_REVIEW", reason: "REFERENCE_EMPTY" };
  if (!(await dependencies.extractEvidence(campaignId))) return { status: "NEEDS_REVIEW", reason: "DRAFT_EVIDENCE" };
  if (!(await dependencies.fillPreparedDraftPool(campaignId))) return { status: "NEEDS_REVIEW", reason: "DRAFT_QUALITY" };
  await dependencies.activateCampaign(campaignId);
  return { status: "READY" };
}

export class CampaignAutomationSetupError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function ensureCampaignNaverPlace(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      business: {
        include: {
          externalPlaces: { where: { platform: { in: ["GOOGLE", "NAVER"] } } },
        },
      },
    },
  });
  if (!campaign) throw new CampaignAutomationSetupError("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다.");

  const naverPlace = campaign.business.externalPlaces.find((place) => place.platform === "NAVER");
  if (naverPlace?.externalId && ["LINKED", "CONFIRMED"].includes(naverPlace.matchStatus)) return true;
  const googlePlace = campaign.business.externalPlaces.find((place) => place.platform === "GOOGLE");
  if (!googlePlace) return false;

  const result = await findBestNaverPlaceSnapshotForCampaign({
    business: {
      name: campaign.business.name,
      address: campaign.business.address,
      externalPlaces: [{
        name: googlePlace.name,
        address: googlePlace.address,
        lat: googlePlace.lat,
        lng: googlePlace.lng,
      }],
    },
  });
  if (!result.providerConfigured) {
    throw new CampaignAutomationSetupError("NAVER_PROVIDER_NOT_CONFIGURED", "네이버 Place 연결 설정을 확인해 주세요.");
  }
  if (!result.place) return false;
  await saveExternalPlace(campaign.businessId, result.place);
  return true;
}

async function collectCampaignReferencesForAutomation(campaignId: string) {
  const result = await collectCampaignBlogReferences(campaignId);
  return Boolean(result?.providerConfigured && result.totalCount > 0);
}

async function extractCampaignEvidenceForAutomation(campaignId: string) {
  const result = await extractCampaignDraftEvidence(campaignId);
  return result.readiness.ready;
}

async function fillCampaignDraftPoolForAutomation(campaignId: string) {
  const result = await fillCampaignPreparedDraftPool(campaignId);
  return result.reachedTarget;
}

function validCampaignPeriod(campaign: { startDate: string | null; endDate: string | null; totalQuota: number | null; dailyQuota: number | null }) {
  return Boolean(
    campaign.startDate &&
    campaign.endDate &&
    campaign.totalQuota &&
    campaign.dailyQuota &&
    campaign.totalQuota > 0 &&
    campaign.dailyQuota > 0 &&
    campaign.dailyQuota <= campaign.totalQuota &&
    campaign.startDate <= campaign.endDate,
  );
}

export async function activateAutomatedCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      sheetCampaignSource: true,
      blogReferences: { where: { status: "ACTIVE" }, select: { id: true } },
      draftEvidence: { where: { status: "APPROVED" }, select: { id: true, facet: true } },
      preparedDrafts: {
        where: { qualityPassed: true, assignedReceiptId: null },
        select: { id: true },
      },
      business: { include: { externalPlaces: { where: { platform: { in: ["GOOGLE", "NAVER"] } } } } },
    },
  });
  if (!campaign) throw new CampaignAutomationSetupError("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다.");

  const googlePlaceLinked = campaign.business.externalPlaces.some((place) => place.platform === "GOOGLE" && Boolean(place.externalId));
  const naverPlaceLinked = campaign.business.externalPlaces.some(
    (place) => place.platform === "NAVER" && Boolean(place.externalId) && ["LINKED", "CONFIRMED"].includes(place.matchStatus),
  );
  const gate = evaluateCampaignAutomationGate({
    sourceReady: campaign.sheetCampaignSource?.sourceStatus === "READY",
    googlePlaceLinked,
    naverPlaceLinked,
    activeReferenceCount: campaign.blogReferences.length,
    evidenceCount: campaign.draftEvidence.length,
    evidenceFacetCount: new Set(campaign.draftEvidence.map((evidence) => evidence.facet)).size,
    totalQuota: campaign.totalQuota,
    unassignedQualityDraftCount: campaign.preparedDrafts.length,
    campaignPeriodValid: validCampaignPeriod(campaign),
  });
  if (!gate.ready) {
    throw new CampaignAutomationSetupError(gate.reasons[0], "자동 공개 전제조건이 충족되지 않았습니다.");
  }
  await prisma.campaign.update({ where: { id: campaignId }, data: { active: true } });
}

export async function setupCampaignWithCurrentProviders(campaignId: string) {
  return runCampaignAutomationSetup(campaignId, {
    linkNaverPlace: ensureCampaignNaverPlace,
    collectReferences: collectCampaignReferencesForAutomation,
    extractEvidence: extractCampaignEvidenceForAutomation,
    fillPreparedDraftPool: fillCampaignDraftPoolForAutomation,
    activateCampaign: activateAutomatedCampaign,
  });
}
