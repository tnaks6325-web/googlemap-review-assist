import { prisma } from "@/lib/db";
import { ok, err } from "@/lib/http";
import { sha256 } from "@/lib/crypto";

export const runtime = "nodejs";

const normalizePhone = (p: string) => p.replace(/[^0-9]/g, "");

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ""));
  if (phone.length < 10) return err("INVALID_PHONE", "올바른 휴대폰 번호를 입력해 주세요");

  // TODO(P1): 번호·IP 레이트리밋 (SECURITY_AUTH.md §5)
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const challenge = await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 3 * 60 * 1000),
    },
  });

  const payload: Record<string, unknown> = { requestId: challenge.id, expiresIn: 180 };
  // 개발 편의: 실서비스에서는 SMS로만 발송하고 응답에 코드를 넣지 않는다.
  if (process.env.NODE_ENV !== "production") payload.devCode = code;
  return ok(payload);
}
