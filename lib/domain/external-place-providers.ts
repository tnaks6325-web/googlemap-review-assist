import {
  type ExternalPlatform,
  type ParsedGooglePlaceInput,
  type PlaceMatchBase,
  parseGooglePlaceInput,
  parseNaverPlaceInput,
  safeJsonSnapshot,
  scorePlaceCandidate,
} from "@/lib/domain/external-places";

export interface ExternalPlaceSnapshot {
  platform: ExternalPlatform;
  externalId: string | null;
  url: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewCount: number | null;
  receiptReviewCount: number | null;
  matchConfidence: number | null;
  rawJson: string | null;
}

export interface GoogleResolveResult {
  place: ExternalPlaceSnapshot;
  providerConfigured: boolean;
}

export interface NaverCandidate {
  title: string;
  link: string;
  category: string | null;
  roadAddress: string | null;
  address: string | null;
  mapx: number | null;
  mapy: number | null;
  matchConfidence: number;
  rawJson: string | null;
}

export interface NaverCandidatesResult {
  candidates: NaverCandidate[];
  providerConfigured: boolean;
}

const GOOGLE_DETAILS_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "googleMapsTypeLabel",
  "primaryType",
  "primaryTypeDisplayName",
  "nationalPhoneNumber",
];

const GOOGLE_SEARCH_FIELDS = GOOGLE_DETAILS_FIELDS.map((f) => `places.${f}`);
const FETCH_TIMEOUT_MS = 8000;
const GOOGLE_LANDING_REDIRECT_LIMIT = 4;

function stableManualId(prefix: string, value: string) {
  const encoded = Buffer.from(value).toString("base64url").slice(0, 48);
  return `${prefix}:${encoded}`;
}

function hostnameOf(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function shouldExpandGoogleLandingUrl(parsed: ParsedGooglePlaceInput) {
  if (parsed.kind !== "URL" || !parsed.url) return false;
  if (!parsed.placeId && !parsed.textQuery) return true;

  const host = hostnameOf(parsed.url);
  return host === "maps.app.goo.gl" || host === "goo.gl" || host === "share.google" || host.endsWith(".share.google");
}

function safeGoogleRedirectLocation(location: string, currentUrl: string) {
  try {
    const next = new URL(location, currentUrl);
    if (next.protocol !== "https:") return null;
    parseGooglePlaceInput(next.toString());
    return next.toString();
  } catch {
    return null;
  }
}

function isGoogleShareRelayUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    return (host === "google.com" || host.endsWith(".google.com")) && url.pathname === "/share.google";
  } catch {
    return false;
  }
}

async function expandGoogleLandingUrl(url: string) {
  let currentUrl = url;

  for (let i = 0; i < GOOGLE_LANDING_REDIRECT_LIMIT; i++) {
    const res = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "googlemap-review-assist/1.0",
      },
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const nextUrl = safeGoogleRedirectLocation(location, currentUrl);
      if (!nextUrl || nextUrl === currentUrl) return currentUrl;
      const nextParsed = parseGooglePlaceInput(nextUrl);
      if ((nextParsed.placeId || nextParsed.textQuery) && !isGoogleShareRelayUrl(nextUrl)) return nextUrl;
      currentUrl = nextUrl;
      continue;
    }

    return currentUrl;
  }

  return currentUrl;
}

async function normalizeGoogleLandingInput(parsed: ParsedGooglePlaceInput) {
  if (!shouldExpandGoogleLandingUrl(parsed) || !parsed.url) return parsed;

  try {
    const expandedUrl = await expandGoogleLandingUrl(parsed.url);
    if (expandedUrl === parsed.url) return parsed;
    return parseGooglePlaceInput(expandedUrl);
  } catch {
    return parsed;
  }
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function textValue(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "text" in v && typeof (v as { text?: unknown }).text === "string") {
    return (v as { text: string }).text;
  }
  return null;
}

function primaryGoogleDisplayName(value: string) {
  const primary = value.split(/\s*[|｜]\s*/)[0]?.trim();
  return primary || value.trim();
}

function mapGooglePlace(data: Record<string, unknown>, fallback: ParsedGooglePlaceInput): ExternalPlaceSnapshot {
  const displayName = primaryGoogleDisplayName(textValue(data.displayName) || fallback.textQuery || "구글 플레이스");
  const location = data.location && typeof data.location === "object" ? (data.location as Record<string, unknown>) : {};
  const primaryTypeDisplayName =
    data.primaryTypeDisplayName && typeof data.primaryTypeDisplayName === "object"
      ? textValue(data.primaryTypeDisplayName)
      : null;
  const googleMapsTypeLabel =
    data.googleMapsTypeLabel && typeof data.googleMapsTypeLabel === "object" ? textValue(data.googleMapsTypeLabel) : null;
  const id = typeof data.id === "string" ? data.id : fallback.placeId ?? stableManualId("google", displayName);
  return {
    platform: "GOOGLE",
    externalId: id,
    url: typeof data.googleMapsUri === "string" ? data.googleMapsUri : fallback.url ?? null,
    name: displayName,
    address: typeof data.formattedAddress === "string" ? data.formattedAddress : null,
    phone: typeof data.nationalPhoneNumber === "string" ? data.nationalPhoneNumber : null,
    category: googleMapsTypeLabel || primaryTypeDisplayName || (typeof data.primaryType === "string" ? data.primaryType : null),
    lat: asNumber(location.latitude),
    lng: asNumber(location.longitude),
    rating: asNumber(data.rating),
    reviewCount: Number.isInteger(data.userRatingCount) ? (data.userRatingCount as number) : null,
    receiptReviewCount: null,
    matchConfidence: 100,
    rawJson: safeJsonSnapshot(data),
  };
}

function manualGooglePlace(parsed: ParsedGooglePlaceInput): ExternalPlaceSnapshot {
  const label = parsed.textQuery || (parsed.placeId ? "구글 플레이스" : "구글 플레이스 URL");
  return {
    platform: "GOOGLE",
    externalId: parsed.placeId ?? stableManualId("google", parsed.url || label),
    url: parsed.url ?? (parsed.placeId ? `https://www.google.com/maps/search/?api=1&query_place_id=${parsed.placeId}` : null),
    name: label,
    address: null,
    phone: null,
    category: null,
    lat: null,
    lng: null,
    rating: null,
    reviewCount: null,
    receiptReviewCount: null,
    matchConfidence: parsed.placeId ? 100 : 60,
    rawJson: safeJsonSnapshot({ parsed, providerConfigured: false }),
  };
}

async function googleDetails(placeId: string, key: string) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": GOOGLE_DETAILS_FIELDS.join(","),
    },
  });
  if (!res.ok) throw new Error(`GOOGLE_PLACE_DETAILS_${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

async function googleTextSearch(textQuery: string, key: string) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": GOOGLE_SEARCH_FIELDS.join(","),
    },
    body: JSON.stringify({ textQuery, languageCode: "ko" }),
  });
  if (!res.ok) throw new Error(`GOOGLE_TEXT_SEARCH_${res.status}`);
  const data = (await res.json()) as { places?: Record<string, unknown>[] };
  return data.places?.[0] ?? null;
}

export async function resolveGooglePlace(urlOrPlaceId: string): Promise<GoogleResolveResult> {
  const parsed = await normalizeGoogleLandingInput(parseGooglePlaceInput(urlOrPlaceId));
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { place: manualGooglePlace(parsed), providerConfigured: false };

  const data = parsed.placeId
    ? await googleDetails(parsed.placeId, key)
    : parsed.textQuery
      ? await googleTextSearch(parsed.textQuery, key)
      : null;
  if (!data) return { place: manualGooglePlace(parsed), providerConfigured: true };
  return { place: mapGooglePlace(data, parsed), providerConfigured: true };
}

function cleanNaverTitle(title: string) {
  return title.replace(/<b>/g, "").replace(/<\/b>/g, "").replace(/&amp;/g, "&").trim();
}

function smartPlaceLink(rawLink: unknown) {
  const link = String(rawLink ?? "").trim();
  if (!link) return "";
  try {
    return parseNaverPlaceInput(link).url ?? "";
  } catch {
    return "";
  }
}

function mapNaverItem(item: Record<string, unknown>, base: PlaceMatchBase): NaverCandidate {
  const title = cleanNaverTitle(String(item.title ?? ""));
  const lotAddress = String(item.address ?? "").trim() || null;
  const roadAddress = String(item.roadAddress ?? item.address ?? "").trim() || null;
  const mapx = Number(item.mapx);
  const mapy = Number(item.mapy);
  const matchConfidence = Math.max(
    scorePlaceCandidate(base, {
      name: title,
      address: roadAddress,
      category: String(item.category ?? ""),
    }),
    scorePlaceCandidate(base, {
      name: title,
      address: lotAddress,
      category: String(item.category ?? ""),
    })
  );

  return {
    title,
    link: smartPlaceLink(item.link),
    category: String(item.category ?? "").trim() || null,
    roadAddress,
    address: lotAddress,
    mapx: Number.isFinite(mapx) ? mapx : null,
    mapy: Number.isFinite(mapy) ? mapy : null,
    matchConfidence,
    rawJson: safeJsonSnapshot(item),
  };
}

export async function findNaverCandidates(base: PlaceMatchBase, query?: string): Promise<NaverCandidatesResult> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return { candidates: [], providerConfigured: false };

  const q = (query?.trim() || [base.name, base.address].filter(Boolean).join(" ")).slice(0, 120);
  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", q);
  url.searchParams.set("display", "5");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "random");
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "X-Naver-Client-Id": id,
      "X-Naver-Client-Secret": secret,
    },
  });
  if (!res.ok) throw new Error(`NAVER_LOCAL_SEARCH_${res.status}`);
  const data = (await res.json()) as { items?: Record<string, unknown>[] };
  const candidates = (data.items ?? [])
    .map((item) => mapNaverItem(item, base))
    .sort((a, b) => b.matchConfidence - a.matchConfidence);
  return { candidates, providerConfigured: true };
}
