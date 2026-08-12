import { redirect } from "next/navigation";
import { AdminHanaSettlementManager } from "@/components/admin/AdminHanaSettlementManager";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminId } from "@/lib/auth/session";
import { getAdminAutoSettlementCandidates, getAdminSettlementRequests } from "@/lib/domain/admin";
import { getHanaExportBatches } from "@/lib/domain/hana-settlement-results";

export const runtime = "nodejs";

export default async function AdminSettlementsPage() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");
  const [candidates, requested, accountErrors, batches] = await Promise.all([
    getAdminAutoSettlementCandidates(),
    getAdminSettlementRequests("REQUESTED"),
    getAdminSettlementRequests("ACCOUNT_ERROR"),
    getHanaExportBatches(),
  ]);
  return (
    <AdminShell
      current="settlements"
      title="하나은행 정산"
      description="지급 대상 등록, 이체 파일 다운로드, 최종 결과 대조 순서로만 정산을 확정합니다."
    >
      <AdminHanaSettlementManager
        candidates={candidates}
        requested={requested.map((item) => ({
          id: item.id,
          phone: item.maskedPhone,
          amount: item.amount,
          payout: item.payout ? {
            bankName: item.payout.bankName,
            maskedAccountNumber: item.payout.maskedAccountNumber,
          } : null,
        }))}
        accountErrors={accountErrors.map((item) => ({
          id: item.id,
          phone: item.maskedPhone,
          amount: item.amount,
          payout: item.payout ? {
            bankName: item.payout.bankName,
            maskedAccountNumber: item.payout.maskedAccountNumber,
          } : null,
        }))}
        batches={batches.map((batch) => ({
          ...batch,
          createdAt: batch.createdAt.toISOString(),
          result: batch.result ? { ...batch.result, importedAt: batch.result.importedAt.toISOString() } : null,
        }))}
      />
    </AdminShell>
  );
}
