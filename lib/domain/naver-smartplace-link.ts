import { naverSmartPlaceIdFromUrl } from "@/lib/domain/external-places";

export interface NaverSmartPlaceLinkInput {
  url?: string | null;
  placeId?: string | null;
  name?: string | null;
  address?: string | null;
  query?: string | null;
}

function cleanText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function naverSmartPlaceDetailUrl(placeId: string) {
  const id = cleanText(placeId);
  return /^\d+$/.test(id) ? `https://map.naver.com/p/entry/place/${id}` : null;
}

export function safeNaverSmartPlaceUrl(rawUrl?: string | null) {
  if (!rawUrl) return null;
  try {
    const placeId = naverSmartPlaceIdFromUrl(rawUrl);
    return placeId ? naverSmartPlaceDetailUrl(placeId) : null;
  } catch {
    return null;
  }
}

export function naverSmartPlaceSearchQuery(input: Pick<NaverSmartPlaceLinkInput, "name" | "address" | "query">) {
  const name = cleanText(input.name);
  if (name) return name;

  const query = cleanText(input.query);
  const address = cleanText(input.address);
  if (query && address) {
    const withoutAddress = cleanText(query.replace(address, ""));
    if (withoutAddress) return withoutAddress;
  }

  return query || address;
}

export function naverSmartPlaceLink(input: NaverSmartPlaceLinkInput) {
  const url = safeNaverSmartPlaceUrl(input.url);
  if (url) return url;
  const placeUrl = input.placeId ? naverSmartPlaceDetailUrl(input.placeId) : null;
  if (placeUrl) return placeUrl;

  const query = naverSmartPlaceSearchQuery(input);
  return query ? `https://map.naver.com/p/search/${encodeURIComponent(query)}` : null;
}
