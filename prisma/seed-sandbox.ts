import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ownerEmail = "sandbox-operator@example.invalid";
const campaignPrefix = "test-only-campaign-";

function assertSandboxDatabase() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const isLocalSqlite = databaseUrl.includes("dev.db") || databaseUrl.includes("test.db");

  if (process.env.NODE_ENV === "production" || !isLocalSqlite) {
    throw new Error("Sandbox seed only runs against a local dev.db or test.db database.");
  }
}

function phoneFor(index: number) {
  return `010-9000-${String(index).padStart(4, "0")}`;
}

async function main() {
  assertSandboxDatabase();

  const owner = await prisma.owner.upsert({
    where: { email: ownerEmail },
    update: {},
    create: { email: ownerEmail, password: "test-only-no-login" },
  });

  for (let index = 1; index <= 10; index += 1) {
    const label = String(index).padStart(2, "0");
    const businessName = `TEST ONLY 방문 캠페인 ${label}`;
    const campaignSlug = `${campaignPrefix}${label}`;
    const existingBusiness = await prisma.business.findFirst({
      where: { ownerId: owner.id, name: businessName },
      select: { id: true },
    });
    const business = existingBusiness
      ? await prisma.business.update({
          where: { id: existingBusiness.id },
          data: { address: `테스트 전용 주소 ${label}` },
        })
      : await prisma.business.create({
          data: { ownerId: owner.id, name: businessName, address: `테스트 전용 주소 ${label}` },
        });

    await prisma.menu.deleteMany({ where: { businessId: business.id } });
    await prisma.menu.createMany({
      data: [
        { businessId: business.id, name: `테스트 메뉴 ${label}A`, category: "TEST_ONLY" },
        { businessId: business.id, name: `테스트 메뉴 ${label}B`, category: "TEST_ONLY" },
      ],
    });

    const googleUrl = `https://example.invalid/test-only/google-place-${label}`;
    const naverUrl = `https://example.invalid/test-only/naver-place-${label}`;
    const googlePlace = await prisma.externalPlace.upsert({
      where: { businessId_platform: { businessId: business.id, platform: "GOOGLE" } },
      update: {
        externalId: `test-google-${label}`,
        url: googleUrl,
        name: businessName,
        address: `테스트 전용 주소 ${label}`,
        category: "TEST_ONLY",
        matchStatus: "LINKED",
        matchConfidence: 100,
      },
      create: {
        businessId: business.id,
        platform: "GOOGLE",
        externalId: `test-google-${label}`,
        url: googleUrl,
        name: businessName,
        address: `테스트 전용 주소 ${label}`,
        category: "TEST_ONLY",
        matchStatus: "LINKED",
        matchConfidence: 100,
      },
    });
    await prisma.externalPlace.upsert({
      where: { businessId_platform: { businessId: business.id, platform: "NAVER" } },
      update: {
        externalId: `test-naver-${label}`,
        url: naverUrl,
        name: businessName,
        address: `테스트 전용 주소 ${label}`,
        category: "TEST_ONLY",
        matchStatus: "LINKED",
        matchConfidence: 100,
      },
      create: {
        businessId: business.id,
        platform: "NAVER",
        externalId: `test-naver-${label}`,
        url: naverUrl,
        name: businessName,
        address: `테스트 전용 주소 ${label}`,
        category: "TEST_ONLY",
        matchStatus: "LINKED",
        matchConfidence: 100,
      },
    });

    const campaign = await prisma.campaign.upsert({
      where: { slug: campaignSlug },
      update: {
        businessId: business.id,
        name: `${businessName} (샌드박스)`,
        active: true,
        totalQuota: 25,
        dailyQuota: 5,
        startDate: "2020-01-01",
        endDate: "2099-12-31",
      },
      create: {
        businessId: business.id,
        slug: campaignSlug,
        name: `${businessName} (샌드박스)`,
        active: true,
        totalQuota: 25,
        dailyQuota: 5,
        startDate: "2020-01-01",
        endDate: "2099-12-31",
      },
    });

    await prisma.externalReview.upsert({
      where: { reviewHash: `test-only-google-review-${label}` },
      update: {
        businessId: business.id,
        externalPlaceId: googlePlace.id,
        platform: "GOOGLE",
        reviewType: "GENERAL",
        content: `테스트 전용 참고 문구 ${label}. 실제 게시 또는 보상에 사용하지 않습니다.`,
      },
      create: {
        businessId: business.id,
        externalPlaceId: googlePlace.id,
        platform: "GOOGLE",
        reviewType: "GENERAL",
        content: `테스트 전용 참고 문구 ${label}. 실제 게시 또는 보상에 사용하지 않습니다.`,
        reviewHash: `test-only-google-review-${label}`,
      },
    });
    await prisma.campaignBlogReference.upsert({
      where: { campaignId_link: { campaignId: campaign.id, link: `https://example.invalid/test-only/blog-${label}` } },
      update: { status: "ACTIVE" },
      create: {
        campaignId: campaign.id,
        source: "TEST_ONLY",
        searchQuery: businessName,
        title: `${businessName} 테스트 참고자료`,
        description: "원고 생성과 검수 흐름을 확인하기 위한 가상 참고자료입니다.",
        link: `https://example.invalid/test-only/blog-${label}`,
        status: "ACTIVE",
      },
    });
  }

  for (let index = 1; index <= 10; index += 1) {
    const reviewer = await prisma.reviewer.upsert({
      where: { phone: phoneFor(index) },
      update: { name: `테스트 리뷰어 ${String(index).padStart(2, "0")}`, email: `reviewer-${index}@example.invalid` },
      create: {
        phone: phoneFor(index),
        name: `테스트 리뷰어 ${String(index).padStart(2, "0")}`,
        email: `reviewer-${index}@example.invalid`,
      },
    });
    await prisma.pointWallet.upsert({
      where: { reviewerId: reviewer.id },
      update: { balance: 0 },
      create: { reviewerId: reviewer.id, balance: 0 },
    });
  }

  console.log("Sandbox seed complete: 10 test-only campaigns and 10 test reviewers.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
