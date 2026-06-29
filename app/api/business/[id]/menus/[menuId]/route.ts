import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; menuId: string }> }
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id, menuId } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  // 메뉴가 해당 매장 소속인지 확인 후 삭제
  const result = await prisma.menu.deleteMany({ where: { id: menuId, businessId: id } });
  if (result.count === 0) return err("NOT_FOUND", "메뉴를 찾을 수 없어요", 404);
  return ok({ ok: true });
}
