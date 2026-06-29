// 개발 전용: 기존 캠페인에 발급 코드를 추가(중복 제외).
// 사용: npx tsx scripts/dev-issue-codes.ts [slug=demo] [count=20]
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const slug = process.argv[2] ?? "demo";
  const count = Number(process.argv[3] ?? "20");
  const campaign = await prisma.campaign.findUnique({ where: { slug } });
  if (!campaign) throw new Error(`캠페인 없음: ${slug}`);

  const want = Array.from({ length: count }, (_, i) => `DEMO${String(i + 1).padStart(4, "0")}`);
  const existing = await prisma.campaignCode.findMany({
    where: { campaignId: campaign.id, code: { in: want } },
    select: { code: true },
  });
  const have = new Set(existing.map((c) => c.code));
  const toAdd = want.filter((c) => !have.has(c));
  if (toAdd.length) {
    await prisma.campaignCode.createMany({
      data: toAdd.map((code) => ({ campaignId: campaign.id, code })),
    });
  }
  console.log(`발급 완료: ${slug} +${toAdd.length}개 (총 ${want.length} 중)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
