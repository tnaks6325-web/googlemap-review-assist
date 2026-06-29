import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const isPostgres = () =>
  (process.env.DB_PROVIDER ?? "sqlite").toLowerCase() === "postgres";

function isSerializationFailure(e: unknown): boolean {
  // Postgres 직렬화 실패(40001)는 Prisma에서 P2034로 표면화
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034";
}

/**
 * money 트랜잭션 실행기.
 * - SQLite(로컬): 일반 트랜잭션(쓰기 직렬화는 connection_limit=1 + 원자적 조건부 UPDATE로 보장).
 * - PostgreSQL(운영): Serializable 격리 + 직렬화 실패 시 재시도(R1 운영 보강).
 */
export async function runMoneyTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!isPostgres()) return prisma.$transaction(fn);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (isSerializationFailure(e)) {
        lastErr = e;
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
