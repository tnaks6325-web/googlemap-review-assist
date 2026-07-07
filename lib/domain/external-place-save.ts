import { prisma } from "@/lib/db";
import type { ExternalPlaceSnapshot } from "@/lib/domain/external-place-providers";

export async function saveExternalPlace(businessId: string, place: ExternalPlaceSnapshot, matchStatus = "LINKED") {
  const saved = await prisma.externalPlace.upsert({
    where: { businessId_platform: { businessId, platform: place.platform } },
    create: {
      businessId,
      platform: place.platform,
      externalId: place.externalId,
      url: place.url,
      name: place.name,
      address: place.address,
      phone: place.phone,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      reviewCount: place.reviewCount,
      receiptReviewCount: place.receiptReviewCount,
      matchStatus,
      matchConfidence: place.matchConfidence,
      rawJson: place.rawJson,
      syncedAt: new Date(),
    },
    update: {
      externalId: place.externalId,
      url: place.url,
      name: place.name,
      address: place.address,
      phone: place.phone,
      category: place.category,
      lat: place.lat,
      lng: place.lng,
      rating: place.rating,
      reviewCount: place.reviewCount,
      receiptReviewCount: place.receiptReviewCount,
      matchStatus,
      matchConfidence: place.matchConfidence,
      rawJson: place.rawJson,
      syncedAt: new Date(),
    },
  });

  if (place.platform === "GOOGLE" && place.externalId) {
    await prisma.business.update({ where: { id: businessId }, data: { googlePlaceId: place.externalId } });
  }

  return saved;
}
