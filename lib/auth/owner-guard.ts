import { prisma } from "@/lib/db";
import { getOwnerId } from "@/lib/auth/session";

/**
 * 현재 owner 세션과 매장 소유권을 함께 검증.
 * - ownerId=null → 미로그인(401)
 * - business=null(ownerId 있음) → 소유 아님(403)
 */
export async function getOwnedBusiness(businessId: string) {
  const ownerId = await getOwnerId();
  if (!ownerId) return { ownerId: null, business: null };
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || business.ownerId !== ownerId) return { ownerId, business: null };
  return { ownerId, business };
}
