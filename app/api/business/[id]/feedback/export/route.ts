import { prisma } from "@/lib/db";
import { err } from "@/lib/http";
import { getOwnedBusiness } from "@/lib/auth/owner-guard";

export const runtime = "nodejs";

const csvField = (v: string) => `"${v.replace(/"/g, '""')}"`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ownerId, business } = await getOwnedBusiness(id);
  if (!ownerId) return err("UNAUTHORIZED", "로그인이 필요해요", 401);
  if (!business) return err("FORBIDDEN", "권한이 없어요", 403);

  const menus = await prisma.menu.findMany({ where: { businessId: id }, select: { id: true, name: true } });
  const menuName = new Map(menus.map((m) => [m.id, m.name]));

  const feedbacks = await prisma.feedback.findMany({
    where: { receipt: { businessId: id } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { rating: true, menuIdsJson: true, comment: true, createdAt: true },
  });

  const rows = feedbacks.map((f) => {
    let ids: string[] = [];
    try {
      ids = JSON.parse(f.menuIdsJson || "[]");
    } catch {
      ids = [];
    }
    const names = ids.map((i) => menuName.get(i)).filter(Boolean).join("|");
    return [
      csvField(f.createdAt.toISOString()),
      String(f.rating),
      csvField(names),
      csvField(f.comment ?? ""),
    ].join(",");
  });

  // BOM 추가(엑셀 한글 깨짐 방지)
  const csv = "﻿" + ["date,rating,menus,comment", ...rows].join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="feedback-${id}.csv"`,
    },
  });
}
