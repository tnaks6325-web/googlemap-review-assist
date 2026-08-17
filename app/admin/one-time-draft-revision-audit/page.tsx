import { redirect } from "next/navigation";
import { getAdminId } from "@/lib/auth/session";
import { auditCampaignPreparedDraftRevisions } from "@/lib/domain/campaign-review-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OneTimeDraftRevisionAuditPage() {
  if (!(await getAdminId())) redirect("/admin/login");
  const audit = await auditCampaignPreparedDraftRevisions();

  return (
    <main className="mx-auto max-w-5xl p-8 text-sm text-ink">
      <h1 className="text-xl font-bold">일회성 원고 수정 이력 대조</h1>
      <p className="mt-2 text-ink-sub">
        수정 이력의 마지막 저장본과 현재 원고를 읽기 전용으로 비교했습니다. 원고 본문은 표시하지 않습니다.
      </p>
      <dl className="mt-6 grid grid-cols-3 gap-3">
        <Metric label="수정 이력 원고" value={audit.revisedDraftCount} />
        <Metric label="일치" value={audit.matchingDraftCount} />
        <Metric label="불일치" value={audit.mismatches.length} />
      </dl>
      {audit.mismatches.length ? (
        <ul className="mt-6 space-y-3" aria-label="불일치 원고 목록">
          {audit.mismatches.map((item) => (
            <li key={item.latestRevisionId} className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="font-bold">{item.businessName}</p>
              <p className="mt-1 text-ink-sub">{item.campaignName}</p>
              <p className="mt-2 font-mono text-xs text-ink-weak">{item.draftId}</p>
              <p className="mt-1 text-xs text-danger">
                {item.state === "DRAFT_MISSING" ? "현재 원고 없음" : "현재 원고가 마지막 수정본과 다름"} · {item.revisedAt}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 font-semibold text-green-800">
          마지막 수정본과 현재 원고가 다른 항목이 없습니다.
        </p>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <dt className="text-ink-weak">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}건</dd>
    </div>
  );
}
