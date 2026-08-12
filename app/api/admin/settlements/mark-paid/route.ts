import { err } from "@/lib/http";
import { checkOrigin } from "@/lib/auth/origin";

export const runtime = "nodejs";

/** Direct completion is intentionally disabled after bank-file reconciliation is enabled. */
export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  return err(
    "MANUAL_COMPLETION_DISABLED",
    "정산 완료는 하나은행 이체결과 파일을 업로드해 대조한 뒤에만 처리할 수 있습니다.",
    409,
  );
}
