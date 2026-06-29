import { prisma } from "@/lib/db";
import { ReviewFlow } from "@/components/flow/ReviewFlow";

export const runtime = "nodejs";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    include: { business: { include: { menus: true } } },
  });

  if (!campaign || !campaign.active) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-bold text-ink">지금은 참여할 수 없어요</p>
        <p className="mt-2 text-[15px] text-ink-sub">캠페인이 종료되었거나 잘못된 링크예요.</p>
      </main>
    );
  }

  return (
    <ReviewFlow
      campaignId={campaign.id}
      businessName={campaign.business.name}
      menus={campaign.business.menus.map((m) => ({ id: m.id, name: m.name }))}
    />
  );
}
