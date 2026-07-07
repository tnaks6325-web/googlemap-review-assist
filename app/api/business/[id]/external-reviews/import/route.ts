import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";
import {
  type ExternalPlatform,
  type ExternalReviewImport,
  externalReviewHash,
  parseExternalReviewsCsv,
  safeJsonSnapshot,
} from "@/lib/domain/external-places";

export const runtime = "nodejs";

const MAX_ROWS = 1000;
const MAX_CSV = 300_000;
const PLATFORMS = new Set<ExternalPlatform>(["GOOGLE", "NAVER"]);
const REVIEW_TYPES = new Set(["GENERAL", "RECEIPT", "BOOKING", "ORDER", "UNKNOWN"]);

function platformOf(value: unknown): ExternalPlatform {
  const platform = String(value ?? "NAVER").trim().toUpperCase() as ExternalPlatform;
  return PLATFORMS.has(platform) ? platform : "NAVER";
}

function reviewTypeOf(value: unknown): ExternalReviewImport["reviewType"] {
  const type = String(value ?? "UNKNOWN").trim().toUpperCase();
  return REVIEW_TYPES.has(type) ? (type as ExternalReviewImport["reviewType"]) : "UNKNOWN";
}

function normalizeJsonReviews(input: unknown): ExternalReviewImport[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const content = String(r.content ?? r.text ?? "").trim().slice(0, 2000);
    if (!content) return [];
    const rating = Number(r.rating);
    const publishedAt = r.publishedAt ? new Date(String(r.publishedAt)) : null;
    return [
      {
        reviewType: reviewTypeOf(r.reviewType ?? r.type),
        rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
        content,
        authorMasked: String(r.authorMasked ?? r.author ?? "").trim().slice(0, 80) || null,
        publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
        externalReviewId: String(r.externalReviewId ?? r.id ?? "").trim().slice(0, 200) || null,
      },
    ];
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  let platform: ExternalPlatform = "NAVER";
  let rows: ExternalReviewImport[] = [];
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    platform = platformOf(form.get("platform"));
    const file = form.get("file");
    if (!file || typeof file !== "object" || !("text" in file)) return err("INVALID_INPUT", "CSV 파일을 업로드해 주세요");
    const f = file as File;
    if (f.size > MAX_CSV) return err("FILE_TOO_LARGE", "CSV 파일은 300KB 이하여야 해요", 413);
    rows = parseExternalReviewsCsv(await f.text());
  } else {
    const body = await req.json().catch(() => null);
    platform = platformOf(body?.platform);
    if (typeof body?.csv === "string") {
      if (body.csv.length > MAX_CSV) return err("FILE_TOO_LARGE", "CSV 데이터는 300KB 이하여야 해요", 413);
      rows = parseExternalReviewsCsv(body.csv);
    } else {
      rows = normalizeJsonReviews(body?.reviews);
    }
  }

  if (!rows.length) return err("INVALID_INPUT", "가져올 외부 리뷰가 없어요");
  if (rows.length > MAX_ROWS) return err("TOO_MANY_ROWS", "한 번에 최대 1,000개까지 가져올 수 있어요", 413);

  const place = await prisma.externalPlace.findUnique({
    where: { businessId_platform: { businessId: id, platform } },
    select: { id: true },
  });

  let imported = 0;
  for (const row of rows) {
    const reviewHash = externalReviewHash({
      businessId: id,
      platform,
      externalReviewId: row.externalReviewId,
      content: row.content,
      publishedAt: row.publishedAt,
    });
    await prisma.externalReview.upsert({
      where: { reviewHash },
      create: {
        businessId: id,
        externalPlaceId: place?.id,
        platform,
        reviewType: row.reviewType,
        rating: row.rating,
        content: row.content,
        authorMasked: row.authorMasked,
        publishedAt: row.publishedAt,
        externalReviewId: row.externalReviewId,
        reviewHash,
        rawJson: safeJsonSnapshot(row),
        syncedAt: new Date(),
      },
      update: {
        reviewType: row.reviewType,
        rating: row.rating,
        content: row.content,
        authorMasked: row.authorMasked,
        publishedAt: row.publishedAt,
        externalReviewId: row.externalReviewId,
        rawJson: safeJsonSnapshot(row),
        syncedAt: new Date(),
      },
    });
    imported += 1;
  }

  return ok({ imported, platform });
}
