import { NextResponse } from "next/server";
import { err } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { getAdminSettlementRequests } from "@/lib/domain/admin";
import {
  hanaBankCode,
  hanaTransferExportDedupeKey,
  hasAmbiguousHanaTransferTarget,
} from "@/lib/domain/hana-settlement";
import { hasHanaExportSettlementOverlap } from "@/lib/domain/hana-settlement-results";
import { createHanaTransferXls } from "@/lib/hana-transfer-workbook";
import { prisma } from "@/lib/db";
import { runMoneyTx } from "@/lib/tx";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("FORBIDDEN", "관리자 로그인이 필요합니다.", 403);
  if (!(await rateLimit(`admin:hana-export:${adminId}:${clientIp(req)}`, 20, HOUR_MS)).ok) {
    return err("RATE_LIMITED", "다운로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }

  const rows = await getAdminSettlementRequests("REQUESTED");
  if (!rows.length) return err("NO_SETTLEMENTS", "지급 대기 정산이 없습니다.", 422);
  const invalid = rows.find((row) => !row.payout || !hanaBankCode(row.payout.bankName));
  if (invalid) return err("INVALID_PAYOUT", "은행코드 또는 정산 계좌를 확인할 수 없는 지급 대상이 있습니다.", 422);
  if (hasAmbiguousHanaTransferTarget(rows.map((row) => ({
    settlementId: row.id,
    accountNumber: row.payout!.accountNumber,
    amount: row.amount,
    accountHolder: row.payout!.accountHolder,
  })))) {
    return err(
      "AMBIGUOUS_TRANSFER_TARGET",
      "계좌번호·금액·예금주가 같은 지급 대상이 둘 이상 있습니다. 하나은행 결과를 안전하게 대조할 수 없어 파일을 만들지 않았습니다.",
      422,
    );
  }
  const pendingExports = await prisma.operationalJob.findMany({
    where: { type: "HANA_TRANSFER_EXPORT", status: { not: "RECONCILED" } },
    select: { payloadJson: true },
    take: 100,
  });
  if (hasHanaExportSettlementOverlap(pendingExports.map((item) => item.payloadJson), rows.map((row) => row.id))) {
    return err(
      "EXPORT_RECONCILIATION_REQUIRED",
      "같은 지급 대상이 포함된 하나은행 파일이 아직 최종 결과 대조 전입니다. 해당 결과 파일을 먼저 대조하세요.",
      409,
    );
  }

  const timestamp = new Date();
  const filename = `IA플레이스_하나은행_다건이체_${timestamp.toISOString().slice(0, 10)}.xls`;
  const workbook = createHanaTransferXls(rows.map((row) => ({
    bankCode: hanaBankCode(row.payout!.bankName)!,
    accountNumber: row.payout!.accountNumber,
    amount: row.amount,
    accountHolder: row.payout!.accountHolder,
  })));
  const reserved = await runMoneyTx(async (tx) => {
    const claimed = await tx.settlement.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: "REQUESTED" },
      data: { status: "EXPORTED" },
    });
    if (claimed.count !== rows.length) return false;
    await tx.operationalJob.create({
      data: {
        type: "HANA_TRANSFER_EXPORT",
        status: "COMPLETED",
        dedupeKey: hanaTransferExportDedupeKey(rows.map((row) => row.id)),
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
    return true;
  });
  if (!reserved) {
    return err(
      "EXPORT_RECONCILIATION_REQUIRED",
      "지급 대상 상태가 바뀌었거나 같은 대상의 이체 파일이 이미 생성되었습니다. 새로고침 후 결과 대조 이력을 확인하세요.",
      409,
    );
  }
  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "content-type": "application/vnd.ms-excel",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}
