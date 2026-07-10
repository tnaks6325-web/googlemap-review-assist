import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminCampaignBlogReferences } from "@/components/admin/AdminCampaignBlogReferences";
import { AdminCampaignNaverCandidates } from "@/components/admin/AdminCampaignNaverCandidates";
import { AdminLogout } from "@/components/admin/AdminLogout";
import { SheetImportDryRun } from "@/components/admin/SheetImportDryRun";
import { Card } from "@/components/ui";
import { getAdminId } from "@/lib/auth/session";
import { listAdminCampaigns } from "@/lib/domain/operator-campaigns";

export const runtime = "nodejs";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1utkH6WnPnDnqbvF2Szg3yIxFwU73vFBMMAWu1DjOE5s/edit?gid=342145819#gid=342145819";

export default async function AdminCampaignsPage() {
  const adminId = await getAdminId();
  if (!adminId) redirect("/admin/login");

  const campaigns = await listAdminCampaigns();
  const activeCount = campaigns.filter((campaign) => campaign.active).length;
  const assignedCount = campaigns.reduce((sum, campaign) => sum + campaign.assignedCount, 0);
  const completedCount = campaigns.reduce((sum, campaign) => sum + campaign.completedCount, 0);
  const paidPointAmount = campaigns.reduce((sum, campaign) => sum + campaign.paidPointAmount, 0);

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-3 text-sm text-ink-weak">
            <Link href="/admin" className="hover:text-ink-sub">
              관리자 홈
            </Link>
            <Link href="/admin/reviewers" className="hover:text-ink-sub">
              리뷰어 관리
            </Link>
          </div>
          <h1 className="mt-3 text-[24px] font-bold text-ink">캠페인 운영</h1>
          <p className="mt-1 text-[15px] text-ink-sub">
            Google Sheet 접수건을 리뷰 캠페인으로 반영하고 운영합니다.
          </p>
        </div>
        <AdminLogout />
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        <Metric label="진행 중" value={`${activeCount}건`} />
        <Metric label="배정" value={`${assignedCount.toLocaleString("ko-KR")}건`} />
        <Metric label="완료" value={`${completedCount.toLocaleString("ko-KR")}건`} />
        <Metric label="지급 포인트" value={`${paidPointAmount.toLocaleString("ko-KR")}P`} />
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold text-ink-weak">Google Sheet 반영</h2>
        <Card className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-semibold text-ink">광고 요청 시트</p>
              <p className="mt-1 text-sm text-ink-weak">
                업체명, 구글플레이스 URL, 목표 수량, 가이드라인 기준으로 캠페인을 생성합니다.
              </p>
            </div>
            <a
              href={SHEET_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-btn bg-brand-tint px-4 text-sm font-semibold text-brand"
            >
              시트 열기
            </a>
          </div>
          <SheetImportDryRun />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink-weak">캠페인 목록</h2>
        {campaigns.length ? (
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <Card key={campaign.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-brand">{campaign.statusLabel}</p>
                    <h3 className="mt-1 text-lg font-bold text-ink">{campaign.businessName}</h3>
                    <p className="mt-1 text-sm text-ink-weak">
                      {[campaign.category, campaign.address].filter(Boolean).join(" · ") ||
                        campaign.campaignName}
                    </p>
                  </div>
                  <Link
                    href={`/r/${campaign.slug}`}
                    className="shrink-0 rounded-full bg-brand-tint px-3 py-1 text-sm font-semibold text-brand"
                  >
                    참여 링크
                  </Link>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <SmallMetric label="배정" value={`${campaign.assignedCount}건`} />
                  <SmallMetric label="완료" value={`${campaign.completedCount}건`} />
                  <SmallMetric label="지급" value={`${campaign.paidPointAmount.toLocaleString("ko-KR")}P`} />
                  <SmallMetric label="코드" value={`${campaign.issuedCodeCount}개`} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                  <SmallMetric
                    label="원고자료"
                    value={`${campaign.draftSourceGroupCount}/4${campaign.canGenerateReviewDraft ? "" : " 부족"}`}
                  />
                  <SmallMetric label="Google" value={campaign.draftSourceGroups.googlePlace ? "연결" : "미연결"} />
                  <SmallMetric label="Naver" value={campaign.draftSourceGroups.naverPlace ? "연결" : "미연결"} />
                  <SmallMetric label="블로그 참고" value={`${campaign.blogReferenceCount}건`} />
                  <SmallMetric label="리뷰 참고" value={`${campaign.reviewReferenceCount}건`} />
                </div>
                <AdminCampaignNaverCandidates
                  campaignId={campaign.id}
                  initialPlace={campaign.naverPlace}
                  hasGooglePlace={campaign.hasGooglePlace}
                />
                <AdminCampaignBlogReferences
                  campaignId={campaign.id}
                  initialReferences={campaign.blogReferences}
                  initialCount={campaign.blogReferenceCount}
                />
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="font-semibold text-ink">아직 캠페인이 없어요.</p>
            <p className="mt-2 text-sm text-ink-weak">
              시트 반영 기능으로 접수 행을 캠페인으로 생성할 수 있습니다.
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-ink-weak">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </Card>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card bg-canvas p-3">
      <p className="text-xs text-ink-weak">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
  );
}
