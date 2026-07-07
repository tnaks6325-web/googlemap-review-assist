import Link from "next/link";
import { connection } from "next/server";
import { CampaignList } from "@/components/campaign/CampaignList";
import { Footer } from "@/components/Footer";
import { listPublicCampaigns } from "@/lib/domain/operator-campaigns";

export const runtime = "nodejs";

export default async function CampaignsPage() {
  await connection();
  const campaigns = await listPublicCampaigns();

  return (
    <>
      <main className="mx-auto max-w-md px-5 py-8">
        <header className="mb-6">
          <p className="text-sm font-semibold text-brand">Google Maps 방문 캠페인</p>
          <h1 className="mt-2 text-[26px] font-bold leading-snug text-ink">
            방문 가능한 캠페인을 선택하세요
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-ink-sub">
            실제 방문 후 경험을 입력하면 리뷰 초안을 만들고 적립금을 받을 수 있어요.
          </p>
          <div className="mt-4 flex items-center gap-3 text-sm">
            <Link href="/me" className="font-semibold text-brand">
              내 적립금
            </Link>
            <Link href="/legal/reviews" className="text-ink-weak hover:text-ink-sub">
              리뷰·적립 정책
            </Link>
          </div>
        </header>
        <CampaignList campaigns={campaigns} />
      </main>
      <Footer />
    </>
  );
}
