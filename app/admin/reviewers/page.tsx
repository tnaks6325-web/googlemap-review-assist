import { redirect } from "next/navigation";
import { AdminReviewerCooldownReset } from "@/components/admin/AdminReviewerCooldownReset";
import { AdminSettlementBulkActions } from "@/components/admin/AdminSettlementBulkActions";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReviewProofQueue } from "@/components/admin/ReviewProofQueue";
import { Card } from "@/components/ui";
import { getAdminId } from "@/lib/auth/session";
import {
  getAdminReviewerRows,
  getAdminSettlementRequests,
  getPendingReviewProofs,
} from "@/lib/domain/admin";

export const runtime = "nodejs";

export default async function AdminReviewersPage() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const [reviewers, reviewProofs, settlementRequests] = await Promise.all([
    getAdminReviewerRows(),
    getPendingReviewProofs(),
    getAdminSettlementRequests(["REQUESTED", "EXPORTED"]),
  ]);
  const totalBalance = reviewers.reduce((sum, reviewer) => sum + reviewer.balance, 0);
  const pendingAmount = settlementRequests.reduce((sum, settlement) => sum + settlement.amount, 0);
  const paidAmount = reviewers.reduce((sum, reviewer) => sum + reviewer.paidAmount, 0);

  return (
    <AdminShell
      current="reviewers"
      title="리뷰어 · 정산 관리"
      description="리뷰 캡처 검수, 적립금 현황, 정산 신청과 참여 제한 예외를 관리합니다."
    >
      <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="리뷰어" value={`${reviewers.length.toLocaleString("ko-KR")}명`} />
        <Metric label="정산 가능 잔액" value={`${totalBalance.toLocaleString("ko-KR")}P`} />
        <Metric label="리뷰 검수 대기" value={`${reviewProofs.length.toLocaleString("ko-KR")}건`} />
        <Metric label="누적 지급완료" value={`${paidAmount.toLocaleString("ko-KR")}P`} />
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-weak">
            리뷰 캡처 검수 대기 ({reviewProofs.length})
          </h2>
        </div>
        <ReviewProofQueue
          items={reviewProofs.map((item) => ({
            id: item.id,
            reviewerName: item.reviewerName,
            maskedPhone: item.maskedPhone,
            businessName: item.businessName,
            campaignName: item.campaignName,
            rewardPoints: item.rewardPoints,
            draftText: item.draftText,
            hasProofImage: item.hasProofImage,
            proofOriginalName: item.proofOriginalName,
            extractedText: item.extractedText,
            analysisStatus: item.analysisStatus,
            analysisReason: item.analysisReason,
            analysisProvider: item.analysisProvider,
            similarity: item.similarity,
            analysisChecks: item.analysisChecks,
            submittedAt: item.submittedAt.toISOString(),
          }))}
        />
      </section>

      <section className="mb-8 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink-weak">
            정산 대기·이체 결과 대기 ({settlementRequests.length}) · {pendingAmount.toLocaleString("ko-KR")}P
          </h2>
        </div>
        <AdminSettlementBulkActions
          items={settlementRequests.map((item) => ({
            id: item.id,
            maskedPhone: item.maskedPhone,
            amount: item.amount,
            method: item.method,
            createdAt: item.createdAt.toISOString(),
            payout: item.payout
              ? {
                  bankName: item.payout.bankName,
                  maskedAccountNumber: item.payout.maskedAccountNumber,
                  accountHolder: item.payout.accountHolder,
                }
              : null,
          }))}
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-ink-weak">리뷰어 목록</h2>
            <p className="mt-1 text-xs text-ink-weak">
              테스트 또는 고객 지원이 필요한 경우에만 리뷰어별 최근 7일 동일 장소 참여 제한을 해제하세요.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-ink-weak">
              <tr>
                <th className="px-4 py-3 font-semibold">리뷰어</th>
                <th className="px-4 py-3 font-semibold">계좌</th>
                <th className="px-4 py-3 text-right font-semibold">잔액</th>
                <th className="px-4 py-3 text-right font-semibold">대기</th>
                <th className="px-4 py-3 text-right font-semibold">지급완료</th>
                <th className="px-4 py-3 text-right font-semibold">참여</th>
                <th className="px-4 py-3 text-right font-semibold">참여 제한</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reviewers.map((reviewer) => (
                <tr key={reviewer.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{reviewer.displayName}</p>
                    <p className="text-xs text-ink-weak">
                      가입 {reviewer.createdAt.toLocaleDateString("ko-KR")}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-ink-sub">
                    {reviewer.payoutAccount ? (
                      <>
                        <p>
                          {reviewer.payoutAccount.bankName} {reviewer.payoutAccount.maskedAccountNumber}
                        </p>
                        <p className="text-xs text-ink-weak">{reviewer.payoutAccount.accountHolder}</p>
                      </>
                    ) : (
                      "미등록"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {reviewer.balance.toLocaleString("ko-KR")}P
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {reviewer.pendingAmount.toLocaleString("ko-KR")}P
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink">
                    {reviewer.paidAmount.toLocaleString("ko-KR")}P
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-sub">
                    {reviewer.receiptCount.toLocaleString("ko-KR")}건
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AdminReviewerCooldownReset
                      reviewerId={reviewer.id}
                      reviewerName={reviewer.displayName}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!reviewers.length ? (
            <div className="p-6 text-center text-sm text-ink-weak">등록된 리뷰어가 없습니다.</div>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-ink-weak">{label}</p>
      <p className="mt-1 text-xl font-bold text-ink">{value}</p>
    </Card>
  );
}
