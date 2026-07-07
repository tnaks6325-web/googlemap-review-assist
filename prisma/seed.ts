import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  // 데모 관리자 (정산 승인용) — F3: 비운영에서만 시드. 운영은 별도 프로비저닝.
  if (process.env.NODE_ENV !== "production") {
    await prisma.admin.upsert({
      where: { email: "admin@demo.com" },
      update: {},
      create: { email: "admin@demo.com", password: hashPassword("admin1234") },
    });
  }

  console.log("seed 완료: 관리자 계정만 확인했습니다. 가상 매장/캠페인은 생성하지 않습니다.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
