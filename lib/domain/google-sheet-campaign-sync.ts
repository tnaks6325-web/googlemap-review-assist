import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { findBestNaverPlaceSnapshotForCampaign } from "@/lib/domain/admin-campaign-naver";
import { generateCodes, generateUniqueSlug } from "@/lib/domain/codes";
import { saveExternalPlace } from "@/lib/domain/external-place-save";
import type { ExternalPlaceSnapshot } from "@/lib/domain/external-place-providers";
import type { SheetImportDryRunRow } from "@/lib/domain/google-sheet-import";

export interface GoogleSheetCampaignSyncResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ rowNumber: number; message: string }>;
}

const OPERATOR_IMPORT_OWNER_EMAIL = "operator-import@google-review.local";

async function ensureOperatorImportOwner() {
  return prisma.owner.upsert({
    where: { email: OPERATOR_IMPORT_OWNER_EMAIL },
    update: {},
    create: {
      email: OPERATOR_IMPORT_OWNER_EMAIL,
      password: hashPassword("operator-import-disabled"),
    },
  });
}

function campaignNameForRow(row: SheetImportDryRunRow) {
  return `${row.businessName || row.googlePlace?.name || "Google Maps"} 구글맵 방문 캠페인`;
}

function googlePlaceSnapshotForRow(row: SheetImportDryRunRow): ExternalPlaceSnapshot | null {
  const place = row.googlePlace;
  if (!place || place.status === "FAILED" || place.status === "SKIPPED") return null;

  const name = place.name || row.businessName;
  if (!name) return null;

  return {
    platform: "GOOGLE",
    externalId: place.placeId,
    url: place.url || row.landingUrl || null,
    name,
    address: place.address || null,
    phone: null,
    category: null,
    lat: null,
    lng: null,
    rating: place.rating,
    reviewCount: place.reviewCount,
    receiptReviewCount: null,
    matchConfidence: place.matchConfidence,
    rawJson: null,
  };
}

async function findLinkedBusinessId(place: ExternalPlaceSnapshot) {
  if (place.externalId) {
    const existingPlace = await prisma.externalPlace.findFirst({
      where: { platform: "GOOGLE", externalId: place.externalId },
      select: { businessId: true },
    });
    if (existingPlace) return existingPlace.businessId;
  }

  const existingBusiness = await prisma.business.findFirst({
    where: {
      name: place.name,
      ...(place.address ? { address: place.address } : {}),
    },
    select: { id: true },
  });
  return existingBusiness?.id ?? null;
}

async function ensureCampaignCodes(campaignId: string, targetCount: number | null) {
  if (!targetCount) return;
  const existing = await prisma.campaignCode.count({ where: { campaignId } });
  const missing = Math.max(0, targetCount - existing);
  if (missing > 0) await generateCodes(campaignId, missing);
}

async function ensureAutoNaverCandidate(
  business: { id: string; name: string; address: string | null },
  googlePlace: ExternalPlaceSnapshot
) {
  const existingNaverPlace = await prisma.externalPlace.findUnique({
    where: { businessId_platform: { businessId: business.id, platform: "NAVER" } },
    select: { externalId: true, matchStatus: true },
  });
  if (existingNaverPlace?.externalId && existingNaverPlace.matchStatus === "LINKED") return;

  const autoNaver = await findBestNaverPlaceSnapshotForCampaign({
    business: {
      name: business.name,
      address: business.address,
      externalPlaces: [
        {
          name: googlePlace.name,
          address: googlePlace.address,
          lat: googlePlace.lat,
          lng: googlePlace.lng,
        },
      ],
    },
  });

  if (autoNaver.place) await saveExternalPlace(business.id, autoNaver.place);
}

export async function syncGoogleMapReviewCampaignRows(
  rows: SheetImportDryRunRow[]
): Promise<GoogleSheetCampaignSyncResult> {
  const result: GoogleSheetCampaignSyncResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const owner = await ensureOperatorImportOwner();

  for (const row of rows) {
    if (row.status !== "READY") {
      result.skipped += 1;
      result.errors.push({ rowNumber: row.rowNumber, message: row.errors[0] ?? "유효하지 않은 행입니다" });
      continue;
    }

    const place = googlePlaceSnapshotForRow(row);
    if (!place) {
      result.skipped += 1;
      result.errors.push({ rowNumber: row.rowNumber, message: "Google Place가 확정되지 않았습니다" });
      continue;
    }

    const linkedBusinessId = await findLinkedBusinessId(place);
    const business = linkedBusinessId
      ? await prisma.business.update({
          where: { id: linkedBusinessId },
          data: {
            name: place.name,
            address: place.address,
            googlePlaceId: place.externalId,
          },
        })
      : await prisma.business.create({
          data: {
            ownerId: owner.id,
            name: place.name,
            address: place.address,
            googlePlaceId: place.externalId,
          },
        });

    await saveExternalPlace(business.id, place);

    try {
      await ensureAutoNaverCandidate(business, place);
    } catch {
      // Naver matching must not block campaign import.
    }

    const name = campaignNameForRow(row);
    const existingCampaign = await prisma.campaign.findFirst({
      where: { businessId: business.id, name },
      select: { id: true },
    });

    const campaign = existingCampaign
      ? await prisma.campaign.update({
          where: { id: existingCampaign.id },
          data: {
            active: true,
            totalQuota: row.totalQuota,
            dailyQuota: row.dailyQuota,
            startDate: row.startDate,
            endDate: row.endDate,
          },
        })
      : await prisma.campaign.create({
          data: {
            businessId: business.id,
            slug: await generateUniqueSlug(),
            name,
            active: true,
            totalQuota: row.totalQuota,
            dailyQuota: row.dailyQuota,
            startDate: row.startDate,
            endDate: row.endDate,
          },
        });

    await ensureCampaignCodes(campaign.id, row.totalQuota);
    await prisma.campaignDraftGuidance.upsert({
      where: { campaignId: campaign.id },
      create: {
        campaignId: campaign.id,
        guideKeywordsJson: JSON.stringify(row.guideKeywords),
        reviewExamplesJson: JSON.stringify(row.examplePhrases),
      },
      update: {
        guideKeywordsJson: JSON.stringify(row.guideKeywords),
        reviewExamplesJson: JSON.stringify(row.examplePhrases),
      },
    });

    if (existingCampaign) result.updated += 1;
    else result.imported += 1;
  }

  return result;
}
