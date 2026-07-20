import { checkOrigin } from "@/lib/auth/origin";
import { normalizeClientErrorReport } from "@/lib/client-error-report";
import { recordOperationalError } from "@/lib/error-logging";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1_000;
const MAX_BODY_BYTES = 8_192;

export async function POST(req: Request) {
  if (!req.headers.get("origin") || !checkOrigin(req)) {
    return err("BAD_ORIGIN", "허용되지 않은 오류 보고 요청입니다.", 403);
  }
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return err("PAYLOAD_TOO_LARGE", "오류 보고 내용이 너무 큽니다.", 413);
  }
  const quota = await rateLimit(`client-error:${clientIp(req)}`, 60, HOUR);
  if (!quota.ok) return err("RATE_LIMITED", "오류 보고 요청이 너무 많습니다.", 429);

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return err("PAYLOAD_TOO_LARGE", "오류 보고 내용이 너무 큽니다.", 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return err("INVALID_REPORT", "오류 보고 형식이 올바르지 않습니다.", 400);
  }
  const report = normalizeClientErrorReport(value);
  if (!report) return err("INVALID_REPORT", "오류 보고 형식이 올바르지 않습니다.", 400);

  await recordOperationalError({
    severity: report.kind === "hydration" ? "ERROR" : "WARNING",
    source: "BROWSER",
    workflow: "화면 사용",
    stage: report.kind === "hydration" ? "React 화면 연결" : "브라우저 동작",
    code: report.kind === "hydration" ? "CLIENT_HYDRATION_ERROR" : "CLIENT_RUNTIME_ERROR",
    title:
      report.kind === "hydration"
        ? "화면을 연결하는 과정에서 오류가 발생했습니다."
        : "브라우저에서 처리되지 않은 오류가 발생했습니다.",
    situation: `${report.path} 화면을 표시하거나 사용하는 중이었습니다.`,
    cause:
      report.kind === "hydration"
        ? "서버에서 만든 화면과 브라우저에서 처음 계산한 화면 내용이 서로 달랐을 가능성이 있습니다."
        : "브라우저에서 실행한 화면 코드가 예상하지 못한 상태를 만났습니다.",
    impact: "해당 화면의 일부 기능이 표시되지 않거나 동작하지 않았을 수 있습니다.",
    action: "같은 화면에서 반복되는지 확인하고, 최근 화면 변경 코드와 네트워크 응답을 점검해 주세요.",
    route: report.path,
    method: "BROWSER",
    error: new Error(`${report.name}: ${report.message}`),
    metadata: { browser: report.browser, kind: report.kind },
  });

  return ok({ recorded: true }, 202);
}
