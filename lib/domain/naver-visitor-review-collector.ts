import chromium from "@sparticuz/chromium-min";
import puppeteer from "puppeteer-core";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  NaverVisitorReviewPreviewError,
  normalizeNaverVisitorReviewPreviews,
  parseNaverVisitorReviewInput,
  type NaverVisitorReviewPreviewInput,
  type NaverVisitorReviewRunStatus,
} from "@/lib/domain/naver-visitor-review-preview";

const RETENTION_DAYS = 90;
const ACTIVE_RUN_MAX_AGE_MS = 10 * 60 * 1000;

export class NaverVisitorReviewCollectorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "NaverVisitorReviewCollectorError";
  }
}

function boundedMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown collection error";
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function statusFromPageText(text: string): NaverVisitorReviewRunStatus | null {
  const normalized = text.toLowerCase();
  if (/captcha|로봇|비정상적인 접근|자동화된 접근/.test(normalized)) return "CAPTCHA_REQUIRED";
  if (/접근이 제한|접근이 차단|차단되었습니다|권한이 없습니다/.test(normalized)) return "BLOCKED";
  return null;
}

function randomDelayMs() {
  return 3000 + Math.floor(Math.random() * 3001);
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function localChromeExecutablePath() {
  return process.env.NAVER_VISITOR_REVIEW_CHROME_EXECUTABLE_PATH || undefined;
}

async function resolveExecutablePath() {
  const configured = localChromeExecutablePath();
  if (configured) return configured;
  const packUrl = process.env.NAVER_VISITOR_REVIEW_CHROMIUM_PACK_URL;
  if (!packUrl) {
    throw new NaverVisitorReviewCollectorError(
      "BROWSER_RUNTIME_UNAVAILABLE",
      "네이버 방문자리뷰 수집 브라우저 런타임이 설정되지 않았습니다.",
      503,
    );
  }
  return chromium.executablePath(packUrl);
}

type BrowserPage = Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.launch>>["newPage"]>>;

async function extractPublicPreviewCards(page: BrowserPage): Promise<{ placeName: string | null; cards: NaverVisitorReviewPreviewInput[] }> {
  return page.evaluate(new Function(`
    return (() => {
    const compact = (value) => (value ?? "").replace(/\\s+/g, " ").trim();
    const textOf = (root, selectors) => {
      for (const selector of selectors) {
        const value = compact(root.querySelector(selector)?.textContent);
        if (value) return value;
      }
      return "";
    };
    const articleSelectors = ["li.place_apply_pui[data-adlog-place-id]", "li.pui__X35jYm", "li[class*='review']", "article[class*='review']"];
    const nodes = articleSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))).filter((node, index, all) => all.indexOf(node) === index);
    const cards = nodes.slice(0, 10).map((node) => {
      const content = textOf(node, [".pui__vn15t2", "[class*='review_text']", "[class*='ReviewText']", "[class*='text']"]);
      const authorMasked = textOf(node, [".pui__NMi-Dp", "[class*='nick']", "[class*='name']"]);
      const rawText = compact(node.textContent);
      const ratingMatch = rawText.match(/(?:별점|평점)\\s*([1-5](?:\\.0)?)/);
      const dateMatch = rawText.match(/\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}\\.?|\\d{4}년\\s*\\d{1,2}월\\s*\\d{1,2}일/);
      const verificationMethod = /영수증|카드|예약|주문|방문/.exec(rawText)?.[0] ?? "";
      return { authorMasked, content, rating: ratingMatch ? Number(ratingMatch[1]) : null, visitDate: dateMatch?.[0] ?? "", verificationMethod };
    });
    const placeName = textOf(document.body, [".place_section_header h2", "h2", "h1"]);
    return { placeName: placeName || null, cards };
    })();
  `) as () => { placeName: string | null; cards: NaverVisitorReviewPreviewInput[] });
}

export async function collectPublicNaverVisitorReviewPreview(visitorReviewUrl: string) {
  const executablePath = await resolveExecutablePath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: chromium.args,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (compatible; CampaignReferencePreview/1.0; +https://googlemap-review-assist.vercel.app)");
    await delay(randomDelayMs());
    await page.goto(visitorReviewUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForNetworkIdle({ idleTime: 700, timeout: 8_000 }).catch(() => undefined);
    const pageText = await page.$eval("body", (body) => body.textContent ?? "").catch(() => "");
    const blockedStatus = statusFromPageText(pageText);
    if (blockedStatus) return { status: blockedStatus, placeName: null, previews: [] as ReturnType<typeof normalizeNaverVisitorReviewPreviews> };
    const extracted = await extractPublicPreviewCards(page);
    const previews = normalizeNaverVisitorReviewPreviews(extracted.cards);
    if (previews.length) return { status: "SUCCESS" as const, placeName: extracted.placeName, previews };
    const declaredEmpty = /방문자\s*리뷰[^\n]{0,30}(?:0개|없음|없습니다)/.test(pageText);
    return { status: declaredEmpty ? "NO_REVIEWS" as const : "PAGE_CHANGED" as const, placeName: extracted.placeName, previews };
  } finally {
    await browser.close();
  }
}

async function removeExpiredRuns() {
  const expiresBefore = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.naverVisitorReviewRun.deleteMany({ where: { createdAt: { lt: expiresBefore } } });
}

export async function collectCampaignNaverVisitorReviewPreviews(campaignId: string, rawInput: string) {
  let parsed: ReturnType<typeof parseNaverVisitorReviewInput>;
  try {
    parsed = parseNaverVisitorReviewInput(rawInput);
  } catch (error) {
    if (error instanceof NaverVisitorReviewPreviewError) {
      throw new NaverVisitorReviewCollectorError(error.code, "네이버 플레이스 URL 또는 숫자 ID를 확인해 주세요.");
    }
    throw error;
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, businessId: true },
  });
  if (!campaign) throw new NaverVisitorReviewCollectorError("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없습니다.", 404);

  const runningAfter = new Date(Date.now() - ACTIVE_RUN_MAX_AGE_MS);
  const activeRun = await prisma.naverVisitorReviewRun.findFirst({
    where: { campaignId, status: "RUNNING", startedAt: { gt: runningAfter } },
    select: { id: true },
  });
  if (activeRun) throw new NaverVisitorReviewCollectorError("COLLECTION_IN_PROGRESS", "이 캠페인의 방문자리뷰 수집이 진행 중입니다.", 409);

  await prisma.naverVisitorReviewRun.updateMany({
    where: { campaignId, status: "RUNNING", startedAt: { lte: runningAfter } },
    data: { status: "TIMEOUT", activeKey: null, errorCode: "STALE_RUN", errorMessage: "수집 시간이 초과되었습니다.", finishedAt: new Date() },
  });
  await removeExpiredRuns();

  let run;
  try {
    run = await prisma.naverVisitorReviewRun.create({
      data: { campaignId, placeId: parsed.placeId, inputUrl: parsed.sourceUrl, visitorReviewUrl: parsed.visitorReviewUrl, status: "RUNNING", activeKey: campaignId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new NaverVisitorReviewCollectorError("COLLECTION_IN_PROGRESS", "이 캠페인의 방문자리뷰 수집이 진행 중입니다.", 409);
    }
    throw error;
  }

  try {
    const result = await collectPublicNaverVisitorReviewPreview(parsed.visitorReviewUrl);
    await prisma.$transaction(async (tx) => {
      await tx.naverVisitorReviewRun.update({
        where: { id: run.id },
        data: {
          status: result.status,
          activeKey: null,
          placeName: result.placeName,
          finishedAt: new Date(),
          previews: result.previews.length
            ? { create: result.previews.map((preview) => ({ ...preview, keywordsJson: JSON.stringify(preview.keywords) })) }
            : undefined,
        },
      });
    });
  } catch (error) {
    const code = error instanceof NaverVisitorReviewCollectorError ? error.code : "COLLECTION_FAILED";
    await prisma.naverVisitorReviewRun.update({
      where: { id: run.id },
      data: { status: "FAILED", activeKey: null, errorCode: code, errorMessage: boundedMessage(error), finishedAt: new Date() },
    });
    if (error instanceof NaverVisitorReviewCollectorError) throw error;
  }

  return prisma.naverVisitorReviewRun.findUniqueOrThrow({
    where: { id: run.id },
    include: { previews: { orderBy: { ordinal: "asc" } } },
  });
}
