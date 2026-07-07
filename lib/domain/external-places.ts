import { createHash } from "node:crypto";

export type ExternalPlatform = "GOOGLE" | "NAVER";
export type ExternalReviewType = "GENERAL" | "RECEIPT" | "BOOKING" | "ORDER" | "UNKNOWN";

export interface ParsedGooglePlaceInput {
  kind: "PLACE_ID" | "URL" | "TEXT";
  placeId?: string;
  textQuery?: string;
  url?: string;
}

export interface ParsedNaverPlaceInput {
  kind: "URL" | "TEXT";
  externalId?: string;
  textQuery?: string;
  url?: string;
}

export interface PlaceMatchBase {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface PlaceCandidate {
  name: string;
  address?: string | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface ExternalReviewImport {
  reviewType: ExternalReviewType;
  rating: number | null;
  content: string;
  authorMasked: string | null;
  publishedAt: Date | null;
  externalReviewId: string | null;
}

const GOOGLE_PLACE_ID_RE = /^[A-Za-z0-9_-]{8,256}$/;
const ALLOWED_GOOGLE_HOSTS = ["google.com", "google.co.kr", "maps.google.com", "maps.app.goo.gl", "share.google", "goo.gl"];
const ALLOWED_NAVER_HOSTS = ["naver.com", "map.naver.com", "place.naver.com", "m.place.naver.com", "naver.me"];
const REVIEW_TYPES = new Set<ExternalReviewType>(["GENERAL", "RECEIPT", "BOOKING", "ORDER", "UNKNOWN"]);

function allowedHost(hostname: string, allowed: string[]) {
  const host = hostname.toLowerCase();
  return allowed.some((base) => host === base || host.endsWith(`.${base}`));
}

function normalizeText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/서울특별시/g, "서울")
    .replace(/부산광역시/g, "부산")
    .replace(/대구광역시/g, "대구")
    .replace(/인천광역시/g, "인천")
    .replace(/광주광역시/g, "광주")
    .replace(/대전광역시/g, "대전")
    .replace(/울산광역시/g, "울산")
    .replace(/[^가-힣a-z0-9]/g, "");
}

function tokenizeAddress(value?: string | null) {
  if (!value) return new Set<string>();
  return new Set(
    normalizeText(value)
      .toLowerCase()
      .replace(/서울특별시/g, "서울")
      .replace(/부산광역시/g, "부산")
      .replace(/대구광역시/g, "대구")
      .replace(/인천광역시/g, "인천")
      .replace(/광주광역시/g, "광주")
      .replace(/대전광역시/g, "대전")
      .replace(/울산광역시/g, "울산")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const token of a) if (b.has(token)) hit += 1;
  return hit / Math.max(1, new Set([...a, ...b]).size);
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseUrl(raw: string) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function decodePathName(pathname: string) {
  const match = pathname.match(/\/(?:maps\/)?place\/([^/]+)/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1].replace(/\+/g, " "));
  } catch {
    return match[1].replace(/\+/g, " ");
  }
}

export function parseGooglePlaceInput(input: string): ParsedGooglePlaceInput {
  const raw = input.trim();
  if (!raw) throw new Error("empty google place input");
  if (!raw.includes("://") && GOOGLE_PLACE_ID_RE.test(raw)) {
    return { kind: "PLACE_ID", placeId: raw };
  }

  const url = parseUrl(raw);
  if (!url) return { kind: "TEXT", textQuery: raw.slice(0, 200) };
  if (!allowedHost(url.hostname, ALLOWED_GOOGLE_HOSTS)) throw new Error("unsupported google host");
  if (url.protocol !== "https:") throw new Error("unsupported google protocol");

  const placeId = url.searchParams.get("query_place_id") || url.searchParams.get("place_id");
  if (placeId && GOOGLE_PLACE_ID_RE.test(placeId)) return { kind: "URL", placeId, url: url.toString() };

  const textQuery = url.searchParams.get("query") || url.searchParams.get("q") || decodePathName(url.pathname);
  return { kind: "URL", textQuery: textQuery ? normalizeText(textQuery).slice(0, 200) : undefined, url: url.toString() };
}

export function parseNaverPlaceInput(input: string): ParsedNaverPlaceInput {
  const raw = input.trim();
  if (!raw) throw new Error("empty naver place input");

  const url = parseUrl(raw);
  if (!url) return { kind: "TEXT", textQuery: raw.slice(0, 200) };
  if (!allowedHost(url.hostname, ALLOWED_NAVER_HOSTS)) throw new Error("unsupported naver host");
  if (url.protocol !== "https:") throw new Error("unsupported naver protocol");

  const pathId =
    url.pathname.match(/\/(?:p\/)?(?:entry\/)?place\/(\d+)/)?.[1] ||
    url.pathname.match(/\/restaurant\/(\d+)/)?.[1] ||
    url.searchParams.get("id") ||
    url.searchParams.get("placeId");
  return { kind: "URL", externalId: pathId ?? undefined, url: url.toString() };
}

export function scorePlaceCandidate(base: PlaceMatchBase, candidate: PlaceCandidate): number {
  const baseName = normalizeForMatch(base.name);
  const candName = normalizeForMatch(candidate.name);
  let score = 0;

  if (baseName && candName) {
    if (baseName === candName) score += 60;
    else if (baseName.includes(candName) || candName.includes(baseName)) score += 50;
    else {
      const baseChars = new Set([...baseName]);
      const candChars = new Set([...candName]);
      score += jaccard(baseChars, candChars) * 45;
    }
  }

  score += jaccard(tokenizeAddress(base.address), tokenizeAddress(candidate.address)) * 30;

  if (candidate.category && /음식|식당|한식|카페|레스토랑/.test(candidate.category)) score += 5;
  if (base.lat != null && base.lng != null && candidate.lat != null && candidate.lng != null) {
    const close = Math.abs(base.lat - candidate.lat) <= 0.002 && Math.abs(base.lng - candidate.lng) <= 0.002;
    if (close) score += 5;
  }

  return clamp(score);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') {
      cur += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseRating(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function normalizeReviewType(value: string | undefined): ExternalReviewType {
  const upper = (value ?? "").trim().toUpperCase() as ExternalReviewType;
  return REVIEW_TYPES.has(upper) ? upper : "UNKNOWN";
}

export function parseExternalReviewsCsv(csv: string): ExternalReviewImport[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).flatMap((line) => {
    const cells = parseCsvLine(line);
    const row = new Map(headers.map((h, i) => [h, cells[i] ?? ""]));
    const content = normalizeText(row.get("content") ?? row.get("text") ?? "").slice(0, 2000);
    if (!content) return [];
    return [
      {
        reviewType: normalizeReviewType(row.get("reviewType") ?? row.get("type")),
        rating: parseRating(row.get("rating")),
        content,
        authorMasked: normalizeText(row.get("authorMasked") ?? row.get("author") ?? "").slice(0, 80) || null,
        publishedAt: parseDate(row.get("publishedAt") ?? row.get("date")),
        externalReviewId: normalizeText(row.get("externalReviewId") ?? row.get("id") ?? "").slice(0, 200) || null,
      },
    ];
  });
}

export function externalReviewHash(input: {
  businessId: string;
  platform: ExternalPlatform;
  externalReviewId?: string | null;
  content?: string | null;
  publishedAt?: Date | null;
}) {
  const key = [
    input.businessId,
    input.platform,
    input.externalReviewId || "",
    normalizeText(input.content || "").slice(0, 500),
    input.publishedAt?.toISOString() || "",
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

export function safeJsonSnapshot(value: unknown, max = 8000) {
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return null;
  }
}
