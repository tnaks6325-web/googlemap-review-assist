import { NextResponse } from "next/server";
import { err } from "@/lib/http";
import { getAdminId } from "@/lib/auth/session";
import { isAdminRequest } from "@/lib/auth/admin-guard";
import {
  getAdminSettlementRequests,
  settlementRequestsToCsv,
} from "@/lib/domain/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const adminId = await getAdminId();
  if (!adminId && !(await isAdminRequest(req))) {
    return err("FORBIDDEN", "관리자 로그인이 필요해요", 403);
  }

  const rows = await getAdminSettlementRequests("REQUESTED");
  const csv = settlementRequestsToCsv(rows);
  const filename = `settlements-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
