// 개발 전용: 리뷰어 적립금을 충전(ADJUST 원장 + 잔액)해 정산 흐름을 테스트한다.
// 사용: npx tsx scripts/dev-topup.ts <reviewerId> <amount>
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [reviewerId, amountStr] = process.argv.slice(2);
  const amount = Number(amountStr);
  if (!reviewerId || !Number.isInteger(amount) || amount <= 0) {
    throw new Error("사용: npx tsx scripts/dev-topup.ts <reviewerId> <amount>");
  }
  await prisma.$transaction(async (tx) => {
    await tx.pointTransaction.create({
      data: {
        reviewerId,
        type: "ADJUST",
        amount,
        idempotencyKey: `dev-topup:${reviewerId}:${Date.now()}`,
        memo: "dev topup",
      },
    });
    await tx.pointWallet.update({
      where: { reviewerId },
      data: { balance: { increment: amount } },
    });
  });
  console.log(`topup 완료: reviewer=${reviewerId} +${amount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
