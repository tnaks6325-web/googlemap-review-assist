import { ok, err } from "@/lib/http";
import { ADMIN_COOKIE } from "@/lib/auth/session";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const res = ok({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
