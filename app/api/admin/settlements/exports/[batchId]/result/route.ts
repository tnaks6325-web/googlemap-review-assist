import { err, ok } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { HanaResultError, reconcileHanaTransferResult } from "@/lib/domain/hana-settlement-results";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const HOUR_MS = 60 * 60 * 1000;
const CFB_MAGIC = Buffer.from("d0cf11e0a1b11ae1", "hex");

export async function POST(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  if (!(await rateLimit(`admin:hana-result:${adminId}:${clientIp(req)}`, 20, HOUR_MS)).ok) {
    return err("RATE_LIMITED", "결과 파일 업로드 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return err("RESULT_FILE_REQUIRED", "하나은행 결과 .xls 파일을 선택해 주세요.", 400);
  if (!file.name.toLowerCase().endsWith(".xls")) return err("INVALID_RESULT_FILE", "하나은행 결과 파일은 .xls 형식만 업로드할 수 있습니다.", 422);
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return err("INVALID_RESULT_FILE", "결과 파일은 5MB 이하의 .xls 파일만 업로드할 수 있습니다.", 422);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.subarray(0, CFB_MAGIC.length).equals(CFB_MAGIC)) {
    return err("INVALID_RESULT_FILE", "올바른 하나은행 Excel 97-2003(.xls) 파일이 아닙니다.", 422);
  }
  const { batchId } = await params;
  try {
    return ok(await reconcileHanaTransferResult({ batchId, buffer, actor: `admin:${adminId}` }));
  } catch (error) {
    if (error instanceof HanaResultError) return err(error.code, error.message, error.status);
    throw error;
  }
}
