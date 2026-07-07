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

export function safeNaverSmartPlaceUrl(rawUrl?: string | null) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const isSmartPlaceHost =
      host === "map.naver.com" || host === "place.naver.com" || host === "m.place.naver.com" || host.endsWith(".place.naver.com");
    const hasPlaceId =
      /\/(?:p\/)?(?:entry\/)?place\/\d+/.test(url.pathname) ||
      /\/restaurant\/\d+/.test(url.pathname) ||
      url.searchParams.has("id") ||
      url.searchParams.has("placeId");
    return url.protocol === "https:" && isSmartPlaceHost && hasPlaceId ? url.toString() : null;
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
  if (input.placeId) return `https://map.naver.com/p/entry/place/${encodeURIComponent(input.placeId)}`;

  const query = naverSmartPlaceSearchQuery(input);
  return query ? `https://map.naver.com/p/search/${encodeURIComponent(query)}` : null;
}
