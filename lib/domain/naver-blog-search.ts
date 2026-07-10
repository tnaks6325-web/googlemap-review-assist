export interface NaverBlogReferenceSearchTarget {
  businessName: string;
  googlePlaceName?: string | null;
  naverPlaceName?: string | null;
  address?: string | null;
  category?: string | null;
}

export interface NaverBlogReference {
  title: string;
  description: string | null;
  link: string;
  bloggerName: string | null;
  bloggerLink: string | null;
  postdate: string | null;
  publishedAt: Date | null;
  searchQuery: string;
  rawJson: string | null;
}

export interface NaverBlogReferenceResult {
  references: NaverBlogReference[];
  providerConfigured: boolean;
  queries: string[];
}

interface NaverBlogSearchOptions {
  maxResults?: number;
  displayPerQuery?: number;
}

const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_DISPLAY_PER_QUERY = 5;

function cleanText(value: unknown, max = 240) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeExternalUrl(value: unknown, max = 800) {
  const raw = cleanText(value, max);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeJsonSnapshot(value: unknown, max = 8000) {
  try {
    return JSON.stringify(value).slice(0, max);
  } catch {
    return null;
  }
}

function parsePostdate(value: string | null) {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addressHint(address?: string | null) {
  const tokens = cleanText(address, 120).split(/\s+/).filter(Boolean);
  return tokens.slice(0, 2).join(" ");
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => cleanText(value, 120)).filter(Boolean)));
}

export function naverBlogReferenceQueries(target: NaverBlogReferenceSearchTarget) {
  const base = cleanText(target.naverPlaceName || target.googlePlaceName || target.businessName, 80);
  if (!base) return [];

  const category = cleanText(target.category, 40);
  const hint = addressHint(target.address);
  return unique([
    base,
    category && !base.includes(category) ? `${base} ${category}` : "",
    hint ? `${base} ${hint}` : "",
  ]);
}

function mapBlogItem(item: Record<string, unknown>, searchQuery: string): NaverBlogReference | null {
  const title = cleanText(item.title, 180);
  const link = safeExternalUrl(item.link);
  if (!title || !link) return null;

  const postdate = cleanText(item.postdate, 16) || null;
  return {
    title,
    description: cleanText(item.description, 500) || null,
    link,
    bloggerName: cleanText(item.bloggername, 120) || null,
    bloggerLink: safeExternalUrl(item.bloggerlink),
    postdate,
    publishedAt: parsePostdate(postdate),
    searchQuery,
    rawJson: safeJsonSnapshot(item),
  };
}

export async function findNaverBlogReferences(
  target: NaverBlogReferenceSearchTarget,
  options: NaverBlogSearchOptions = {},
): Promise<NaverBlogReferenceResult> {
  const queries = naverBlogReferenceQueries(target);
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return { references: [], providerConfigured: false, queries };

  const maxResults = Math.max(1, Math.min(30, options.maxResults ?? DEFAULT_MAX_RESULTS));
  const displayPerQuery = Math.max(1, Math.min(10, options.displayPerQuery ?? DEFAULT_DISPLAY_PER_QUERY));
  const references: NaverBlogReference[] = [];
  const seenLinks = new Set<string>();

  for (const query of queries) {
    if (references.length >= maxResults) break;

    const url = new URL("https://openapi.naver.com/v1/search/blog.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(Math.min(displayPerQuery, maxResults - references.length)));
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "sim");

    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "X-Naver-Client-Id": id,
        "X-Naver-Client-Secret": secret,
      },
    });
    if (!res.ok) throw new Error(`NAVER_BLOG_SEARCH_${res.status}`);

    const data = (await res.json()) as { items?: Record<string, unknown>[] };
    for (const item of data.items ?? []) {
      const reference = mapBlogItem(item, query);
      if (!reference || seenLinks.has(reference.link)) continue;
      seenLinks.add(reference.link);
      references.push(reference);
      if (references.length >= maxResults) break;
    }
  }

  return { references, providerConfigured: true, queries };
}
