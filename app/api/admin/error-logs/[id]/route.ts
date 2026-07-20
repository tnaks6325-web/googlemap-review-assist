import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { resolveOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  if (!(await getAdminId())) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);

  const body = await req.json().catch(() => null);
  if (body?.action !== "resolve") {
    return err("INVALID_ACTION", "지원하지 않는 오류 로그 작업입니다.", 400);
  }
  const { id } = await params;
  const result = await resolveOperationalError(id);
  if (!result) return err("ERROR_LOG_NOT_FOUND", "오류 로그를 찾을 수 없습니다.", 404);
  return ok(result);
}
