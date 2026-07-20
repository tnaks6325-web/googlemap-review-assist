import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface ReviewerHomeAccount {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

function safeGoogleAvatarUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const isGoogleHost =
      url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com");
    return url.protocol === "https:" && isGoogleHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getReviewerHomeAccount(
  reviewerId: string | null,
  db: DbClient = prisma,
): Promise<ReviewerHomeAccount | null> {
  if (!reviewerId) return null;

  const reviewer = await db.reviewer.findUnique({
    where: { id: reviewerId },
    select: {
      googleSub: true,
      name: true,
      email: true,
      avatarUrl: true,
    },
  });
  if (!reviewer?.googleSub) return null;

  return {
    name: reviewer.name,
    email: reviewer.email,
    avatarUrl: safeGoogleAvatarUrl(reviewer.avatarUrl),
  };
}
