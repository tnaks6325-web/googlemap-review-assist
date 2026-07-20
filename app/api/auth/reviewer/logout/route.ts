import { checkOrigin } from "@/lib/auth/origin";
import { REVIEWER_COOKIE } from "@/lib/auth/session";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);

  const response = ok({ ok: true });
  response.cookies.set(REVIEWER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
