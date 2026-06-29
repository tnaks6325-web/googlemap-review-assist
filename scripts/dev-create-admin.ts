// 개발 전용: 데모 관리자 계정 생성/갱신.
// 사용: npx tsx scripts/dev-create-admin.ts [email=admin@demo.com] [password=admin1234]
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] ?? "admin@demo.com").toLowerCase();
  const password = process.argv[3] ?? "admin1234";
  await prisma.admin.upsert({
    where: { email },
    update: { password: hashPassword(password) },
    create: { email, password: hashPassword(password) },
  });
  console.log(`관리자 준비 완료: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
