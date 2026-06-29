import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";
import { receiptDedupeHash } from "@/lib/domain/receipts";
import { getOcrProvider } from "@/lib/ocr";
import { decideReceiptStatus } from "@/lib/domain/receipt-verify";

export const runtime = "nodejs";

const DAY = 24 * 60 * 60 * 1000;
const DAILY_CAP = 3;
const MAX_IMAGE = 5 * 1024 * 1024; // 5MB
const MAX_MOCK_TEXT = 8192;

// R7: 클라이언트가 보낸 MIME(f.type)을 신뢰하지 않고 매직바이트로 검사
function sniffImage(b: Uint8Array): boolean {
  if (b.length < 12) return false;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true; // GIF
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return true; // WEBP
  return false;
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  let campaignId = "";
  let mockText: string | undefined;
  let imageBytes: Uint8Array | undefined;
  let mimeType: string | undefined;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    campaignId = String(form.get("campaignId") ?? "");
    const mt = form.get("mockText");
    if (typeof mt === "string") mockText = mt;
    const file = form.get("image");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      if (f.size > MAX_IMAGE) return err("IMAGE_TOO_LARGE", "이미지는 5MB 이하여야 해요", 413);
      imageBytes = new Uint8Array(await f.arrayBuffer());
      mimeType = f.type;
      // R7: 매직바이트로 실제 이미지인지 검증(클라 MIME 불신)
      if (!sniffImage(imageBytes)) {
        return err("INVALID_IMAGE", "이미지 파일만 업로드할 수 있어요");
      }
    }
  } else {
    const body = await req.json().catch(() => null);
    campaignId = String(body?.campaignId ?? "");
    if (typeof body?.mockText === "string") mockText = body.mockText;
  }
  if (mockText && mockText.length > MAX_MOCK_TEXT) mockText = mockText.slice(0, MAX_MOCK_TEXT); // R8

  if (!campaignId) return err("INVALID_INPUT", "캠페인 정보가 없어요");

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { business: true },
  });
  if (!campaign) return err("CAMPAIGN_NOT_FOUND", "캠페인을 찾을 수 없어요", 404);
  if (!campaign.active) return err("CAMPAIGN_INACTIVE", "지금은 참여할 수 없어요", 403);

  // R5: 코드 경로와 동일한 일일 한도(DB 기반)
  const todays = await prisma.receipt.count({
    where: {
      reviewerId,
      businessId: campaign.businessId,
      createdAt: { gte: new Date(Date.now() - DAY) },
    },
  });
  if (todays >= DAILY_CAP) {
    return err("DAILY_LIMIT", "오늘은 이 매장에서 참여 한도를 채웠어요", 429);
  }

  // mockText는 개발 환경에서만 허용(운영에서는 실제 OCR 프로바이더가 무시)
  const devMock = process.env.NODE_ENV !== "production" ? mockText : undefined;
  let result;
  try {
    result = await getOcrProvider().extract({ imageBytes, mimeType, mockText: devMock });
  } catch {
    // F1: 제공자 오류를 일반 응답으로(내부 메시지 비노출). 영수증 미생성(fail-closed).
    return err("OCR_FAILED", "영수증 확인 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요", 502);
  }

  if (!result.approvalNo) {
    return err("RECEIPT_UNREADABLE", "영수증을 인식하지 못했어요. 승인번호를 직접 입력해 주세요", 422);
  }

  const decision = decideReceiptStatus(result, campaign.business.name);
  const dedupeHash = receiptDedupeHash(campaign.businessId, result.approvalNo);

  try {
    const receipt = await prisma.receipt.create({
      data: {
        businessId: campaign.businessId,
        campaignId: campaign.id,
        reviewerId,
        code: result.approvalNo,
        amount: result.amount,
        merchantName: result.merchantName,
        ocrText: result.rawText.slice(0, 2000),
        source: "OCR",
        dedupeHash,
        status: decision.status,
      },
    });
    return ok({ receiptId: receipt.id, status: receipt.status, reason: decision.reason });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("RECEIPT_ALREADY_USED", "이미 참여한 영수증이에요", 409);
    }
    throw e;
  }
}
