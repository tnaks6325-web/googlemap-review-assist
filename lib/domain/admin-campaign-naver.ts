import { findNaverCandidates, type ExternalPlaceSnapshot, type NaverCandidate } from "@/lib/domain/external-place-providers";
import type { PlaceMatchBase } from "@/lib/domain/external-places";
import { parseNaverPlaceInput, safeJsonSnapshot } from "@/lib/domain/external-places";
import {
  naverSmartPlaceDetailUrl,
  safeNaverSmartPlaceUrl,
} from "@/lib/domain/naver-smartplace-link";

export interface AdminCampaignNaverSource {
  business: {
    name: string;
    address: string | null;
    externalPlaces: Array<{
      name: string;
      address: string | null;
      lat: number | null;
      lng: number | null;
    }>;
  };
}

export function naverSearchTargetFromCampaign(campaign: AdminCampaignNaverSource): {
  base: PlaceMatchBase;
  query: string;
} {
  const googlePlace = campaign.business.externalPlaces[0] ?? null;
  const name = googlePlace?.name || campaign.business.name;
  const address = googlePlace?.address ?? campaign.business.address ?? null;
  const base = {
    name,
    address,
    lat: googlePlace?.lat ?? null,
    lng: googlePlace?.lng ?? null,
  };

  return {
    base,
    query: [name, address].filter(Boolean).join(" ").slice(0, 120),
  };
}

export function naverCandidateSearchQueries(base: PlaceMatchBase, query?: string): string[] {
  const primary = (query?.trim() || [base.name, base.address].filter(Boolean).join(" ")).slice(0, 120);
  if (query?.trim()) return primary ? [primary] : [];

  const fallback = base.name.trim().slice(0, 120);
  return Array.from(new Set([primary, fallback].filter(Boolean)));
}

function cleanCandidateText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function candidateConfidence(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function naverPlaceSnapshotFromCandidate(
  raw: unknown,
  businessName: string
): ExternalPlaceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const title = cleanCandidateText(candidate.title, 120);
  if (!title) return null;

  const link = cleanCandidateText(candidate.link, 500);
  let parsed: ReturnType<typeof parseNaverPlaceInput> | null = null;
  const smartPlaceUrl = safeNaverSmartPlaceUrl(link);
  if (link) {
    try {
      parsed = parseNaverPlaceInput(link);
    } catch {
      parsed = null;
    }
  }

  return {
    platform: "NAVER",
    externalId: parsed?.externalId ?? null,
    url: smartPlaceUrl,
    name: title || businessName,
    address: cleanCandidateText(candidate.roadAddress ?? candidate.address, 240) || null,
    phone: null,
    category: cleanCandidateText(candidate.category, 120) || null,
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    receiptReviewCount: null,
    matchConfidence: candidateConfidence(candidate.matchConfidence),
    rawJson: candidate.rawJson ? String(candidate.rawJson).slice(0, 8000) : safeJsonSnapshot(candidate),
  };
}

export function naverPlaceSnapshotFromPlaceId(
  rawPlaceId: string,
  source: {
    businessName: string;
    businessAddress?: string | null;
    existingPlace?: {
      name?: string | null;
      address?: string | null;
      category?: string | null;
    } | null;
  }
): ExternalPlaceSnapshot | null {
  const placeId = cleanCandidateText(rawPlaceId, 32);
  if (!/^\d{1,20}$/.test(placeId)) return null;
  const smartPlaceUrl = naverSmartPlaceDetailUrl(placeId);
  if (!smartPlaceUrl) return null;

  return {
    platform: "NAVER",
    externalId: placeId,
    url: smartPlaceUrl,
    name: cleanCandidateText(source.existingPlace?.name, 120) || source.businessName,
    address: cleanCandidateText(source.existingPlace?.address ?? source.businessAddress, 240) || null,
    phone: null,
    category: cleanCandidateText(source.existingPlace?.category, 120) || null,
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    receiptReviewCount: null,
    matchConfidence: 100,
    rawJson: safeJsonSnapshot({
      source: "ADMIN_MANUAL_NAVER_PLACE_ID",
      placeId,
    }),
  };
}

export interface AutoNaverCandidateResult {
  place: ExternalPlaceSnapshot | null;
  providerConfigured: boolean;
  query: string;
  candidateCount: number;
}

export const MIN_AUTO_NAVER_MATCH_CONFIDENCE = 40;

export async function findBestNaverPlaceSnapshotForCampaign(
  campaign: AdminCampaignNaverSource,
  minConfidence = MIN_AUTO_NAVER_MATCH_CONFIDENCE
): Promise<AutoNaverCandidateResult> {
  const target = naverSearchTargetFromCampaign(campaign);
  const searchQueries = naverCandidateSearchQueries(target.base);
  let providerConfigured = false;
  let bestCandidate: NaverCandidate | null = null;
  let bestQuery = searchQueries[0] ?? target.query;
  let candidateCount = 0;

  for (const searchQuery of searchQueries.length ? searchQueries : [target.query]) {
    const result = await findNaverCandidates(target.base, searchQuery);
    providerConfigured = result.providerConfigured;
    if (!result.providerConfigured) {
      return { place: null, providerConfigured: false, query: searchQuery, candidateCount: 0 };
    }

    candidateCount += result.candidates.length;
    const candidate = result.candidates[0] ?? null;
    if (candidate && candidate.matchConfidence > (bestCandidate?.matchConfidence ?? -1)) {
      bestCandidate = candidate;
      bestQuery = searchQuery;
    }

    if (bestCandidate && bestCandidate.matchConfidence >= minConfidence) break;
  }

  const place =
    bestCandidate && bestCandidate.matchConfidence >= minConfidence
      ? naverPlaceSnapshotFromCandidate(bestCandidate, campaign.business.name)
      : null;

  return { place, providerConfigured, query: bestQuery, candidateCount };
}
