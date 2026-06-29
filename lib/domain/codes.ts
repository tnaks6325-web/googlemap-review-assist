import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

// 혼동되기 쉬운 문자(0/O, 1/I 등) 제외. 모두 대문자+숫자 → canonicalizeCode와 동일 형태.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 8): string {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

/** 캠페인에 고유한 1회용 인증 코드 N개 생성 */
export async function generateCodes(campaignId: string, count: number): Promise<string[]> {
  const n = Math.max(1, Math.min(count, 200));
  const existing = new Set(
    (await prisma.campaignCode.findMany({ where: { campaignId }, select: { code: true } })).map(
      (c) => c.code
    )
  );
  const out: string[] = [];
  let guard = 0;
  while (out.length < n && guard < n * 50) {
    guard++;
    const c = randomCode(8);
    if (existing.has(c)) continue;
    existing.add(c);
    out.push(c);
  }
  if (out.length) {
    await prisma.campaignCode.createMany({ data: out.map((code) => ({ campaignId, code })) });
  }
  return out;
}

/** URL-friendly 캠페인 슬러그(소문자+숫자, 10자) — 열거/충돌 방지 */
export async function generateUniqueSlug(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const slug = randomCode(10).toLowerCase();
    const exists = await prisma.campaign.findUnique({ where: { slug } });
    if (!exists) return slug;
  }
  throw new Error("슬러그 생성 실패");
}
