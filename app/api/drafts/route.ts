import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getReviewerId } from "@/lib/auth/session";
import { generateDraft } from "@/lib/domain/draft";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const reviewerId = await getReviewerId();
  if (!reviewerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);

  const body = await req.json().catch(() => null);
  const feedbackId = String(body?.feedbackId ?? "");

  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    include: {
      receipt: { include: { business: { include: { menus: true } } } },
      drafts: true,
    },
  });
  if (!feedback || feedback.receipt.reviewerId !== reviewerId) {
    return err("FEEDBACK_NOT_FOUND", "피드백을 찾을 수 없어요", 404);
  }

  const menus = feedback.receipt.business.menus;
  const selectedIds: string[] = JSON.parse(feedback.menuIdsJson || "[]");
  const selectedMenus = menus.filter((m) => selectedIds.includes(m.id)).map((m) => m.name);

  const text = await generateDraft({
    businessName: feedback.receipt.business.name,
    rating: feedback.rating,
    selectedMenus,
    comment: feedback.comment ?? undefined,
    menuCatalog: menus.map((m) => m.name),
  });

  const version = feedback.drafts.reduce((max, d) => Math.max(max, d.version), 0) + 1;
  const draft = await prisma.aiDraft.create({ data: { feedbackId, version, text } });
  return ok({ draftId: draft.id, version, text });
}
