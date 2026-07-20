import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findNaverBlogReferences,
  naverBlogReferenceQueries,
} from "@/lib/domain/naver-blog-search";

const originalNaverClientId = process.env.NAVER_CLIENT_ID;
const originalNaverClientSecret = process.env.NAVER_CLIENT_SECRET;

function responseJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(status: number) {
  return new Response(null, { status });
}

describe("naver blog search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalNaverClientId == null) delete process.env.NAVER_CLIENT_ID;
    else process.env.NAVER_CLIENT_ID = originalNaverClientId;
    if (originalNaverClientSecret == null) delete process.env.NAVER_CLIENT_SECRET;
    else process.env.NAVER_CLIENT_SECRET = originalNaverClientSecret;
  });

  it("builds conservative blog reference queries from place context", () => {
    expect(
      naverBlogReferenceQueries({
        businessName: "Fallback Business",
        naverPlaceName: "Grains Cookies Bukchon",
        address: "Seoul Jongno-gu Bukchon-ro 11-gil 1",
        category: "Bakery",
      })
    ).toEqual([
      "Grains Cookies Bukchon",
      "Grains Cookies Bukchon Bakery",
      "Grains Cookies Bukchon Seoul Jongno-gu",
    ]);
  });

  it("returns providerConfigured false when Naver credentials are missing", async () => {
    delete process.env.NAVER_CLIENT_ID;
    delete process.env.NAVER_CLIENT_SECRET;

    const result = await findNaverBlogReferences({
      businessName: "Grains Cookies Bukchon",
      address: null,
      category: null,
    });

    expect(result).toEqual({
      references: [],
      providerConfigured: false,
      queries: ["Grains Cookies Bukchon"],
    });
  });

  it("sanitizes Naver blog search results and deduplicates by link", async () => {
    process.env.NAVER_CLIENT_ID = "test-client-id";
    process.env.NAVER_CLIENT_SECRET = "test-client-secret";
    const fetchMock = vi.fn(async () =>
      responseJson({
        items: [
          {
            title: "<b>Grains</b> Cookies &amp; Coffee",
            link: "https://blog.naver.com/sample/1",
            description: "Quiet <b>hanok</b> bakery &amp; dessert",
            bloggername: "blogger <b>A</b>",
            bloggerlink: "https://blog.naver.com/sample",
            postdate: "20260710",
          },
          {
            title: "Duplicate",
            link: "https://blog.naver.com/sample/1",
            description: "duplicate",
            bloggername: "blogger B",
            bloggerlink: "https://blog.naver.com/sample-b",
            postdate: "bad-date",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await findNaverBlogReferences(
      {
        businessName: "Fallback Business",
        naverPlaceName: "Grains Cookies Bukchon",
        address: null,
        category: null,
      },
      { maxResults: 5 }
    );

    expect(result.providerConfigured).toBe(true);
    expect(result.queries).toEqual(["Grains Cookies Bukchon"]);
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      title: "Grains Cookies & Coffee",
      description: "Quiet hanok bakery & dessert",
      link: "https://blog.naver.com/sample/1",
      bloggerName: "blogger A",
      bloggerLink: "https://blog.naver.com/sample",
      postdate: "20260710",
    });
    expect(result.references[0]?.publishedAt?.toISOString()).toBe("2026-07-10T00:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("https://openapi.naver.com/v1/search/blog.json"),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Naver-Client-Id": "test-client-id",
          "X-Naver-Client-Secret": "test-client-secret",
        }),
      })
    );
  });

  it("waits and retries when Naver temporarily rate limits a blog search", async () => {
    process.env.NAVER_CLIENT_ID = "test-client-id";
    process.env.NAVER_CLIENT_SECRET = "test-client-secret";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(responseJson({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await findNaverBlogReferences(
      {
        businessName: "Chaidele Insadong",
        address: null,
        category: null,
      },
      { retryBaseDelayMs: 0 },
    );

    expect(result.providerConfigured).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
