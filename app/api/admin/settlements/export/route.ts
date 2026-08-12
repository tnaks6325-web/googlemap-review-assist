import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { err } from "@/lib/http";
import { getAdminId } from "@/lib/auth/session";
import { getAdminSettlementRequests } from "@/lib/domain/admin";
import { hanaBankCode } from "@/lib/domain/hana-settlement";
import { createHanaTransferXls } from "@/lib/hana-transfer-workbook";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const adminId = await getAdminId();
  if (!adminId) return err("FORBIDDEN", "관리자 로그인이 필요합니다.", 403);
  if (!(await rateLimit(`admin:hana-export:${adminId}:${clientIp(req)}`, 20, HOUR_MS)).ok) {
    return err("RATE_LIMITED", "다운로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }

  const rows = await getAdminSettlementRequests("REQUESTED");
  if (!rows.length) return err("NO_SETTLEMENTS", "지급 대기 정산이 없습니다.", 422);
  const invalid = rows.find((row) => !row.payout || !hanaBankCode(row.payout.bankName));
  if (invalid) return err("INVALID_PAYOUT", "은행코드 또는 정산 계좌를 확인할 수 없는 지급 대상이 있습니다.", 422);

  const timestamp = new Date();
  const filename = `IA플레이스_하나은행_다건이체_${timestamp.toISOString().slice(0, 10)}.xls`;
  const workbook = createHanaTransferXls(rows.map((row) => ({
    bankCode: hanaBankCode(row.payout!.bankName)!,
    accountNumber: row.payout!.accountNumber,
    amount: row.amount,
    accountHolder: row.payout!.accountHolder,
  })));
  await prisma.operationalJob.create({
    data: {
      type: "HANA_TRANSFER_EXPORT",
      status: "COMPLETED",
      dedupeKey: `hana-transfer-export:${randomUUID()}`,
      payloadJson: JSON.stringify({
        format: "HANA_MULTI_TRANSFER_XLS_V1",
        settlementIds: rows.map((row) => row.id),
        count: rows.length,
        totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
        exportedBy: `admin:${adminId}`,
        filename,
      }),
      maxAttempts: 1,
      completedAt: timestamp,
    },
  });
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "content-type": "application/vnd.ms-excel",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
