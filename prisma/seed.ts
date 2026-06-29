import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

const MENUS = [
  { name: "김치찌개", category: "식사" },
  { name: "제육볶음", category: "식사" },
  { name: "계란말이", category: "사이드" },
  { name: "된장국", category: "식사" },
  { name: "공기밥", category: "사이드" },
];

async function main() {
  const existing = await prisma.campaign.findUnique({ where: { slug: "demo" } });
  if (existing) {
    console.log("seed: 데모 데이터가 이미 존재합니다. 건너뜁니다.");
    return;
  }

  const owner = await prisma.owner.upsert({
    where: { email: "demo@demo.com" },
    update: {},
    create: { email: "demo@demo.com", password: hashPassword("demo1234") },
  });

  const business = await prisma.business.create({
    data: {
      ownerId: owner.id,
      name: "온기담은식당",
      address: "서울특별시 어딘가 1-2",
      googlePlaceId: "DEMO_PLACE_ID",
      menus: { create: MENUS },
    },
  });

  const campaign = await prisma.campaign.create({
    data: { businessId: business.id, slug: "demo", name: "기본 캠페인", active: true },
  });

  // 발급 코드 DEMO0001 ~ DEMO0020 (정규화 형태로 저장)
  await prisma.campaignCode.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      campaignId: campaign.id,
      code: `DEMO${String(i + 1).padStart(4, "0")}`,
    })),
  });

  console.log("seed 완료:");
  console.log("  매장:", business.name, `(id=${business.id})`);
  console.log("  캠페인 진입:", `/r/${campaign.slug}`);
  console.log("  발급 코드: DEMO0001 ~ DEMO0020");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
