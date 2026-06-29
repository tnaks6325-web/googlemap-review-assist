import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

const MAX_MENUS = 100;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.menus) ? body.menus : [body];
  // 입력 정규화 + 배치 내 중복 제거
  const seen = new Set<string>();
  const incoming = raw
    .map((m: { name?: unknown; category?: unknown }) => ({
      name: String(m?.name ?? "").trim().slice(0, 40),
      category: m?.category ? String(m.category).trim().slice(0, 20) : null,
    }))
    .filter((m: { name: string }) => {
      const key = m.name.toLowerCase();
      if (!m.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
  if (!incoming.length) return err("INVALID_INPUT", "메뉴 이름을 입력해 주세요");

  // 기존 메뉴와 중복(이름) 제거 + 총량 상한
  const existing = await prisma.menu.findMany({ where: { businessId: id }, select: { name: true } });
  const existingNames = new Set(existing.map((m) => m.name.toLowerCase()));
  const toAdd = incoming.filter((m: { name: string }) => !existingNames.has(m.name.toLowerCase()));
  if (existing.length + toAdd.length > MAX_MENUS) {
    return err("MENU_LIMIT", `메뉴는 최대 ${MAX_MENUS}개예요`, 429);
  }
  if (toAdd.length) {
    await prisma.menu.createMany({
      data: toAdd.map((m: { name: string; category: string | null }) => ({
        businessId: id,
        name: m.name,
        category: m.category,
      })),
    });
  }

  const all = await prisma.menu.findMany({ where: { businessId: id }, orderBy: { id: "asc" } });
  return ok({ menus: all });
}
