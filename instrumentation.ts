import type { Instrumentation } from "next";

export function register() {}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordOperationalError } = await import("@/lib/error-logging");
  await recordOperationalError({
    severity: "CRITICAL",
    source: "SERVER",
    workflow: context.routeType === "render" ? "화면 표시" : "서버 요청 처리",
    stage: `${context.routeType} 처리`,
    code: "UNHANDLED_SERVER_ERROR",
    title: "서버에서 처리되지 않은 오류가 발생했습니다.",
    situation: `${context.routePath} 경로의 ${context.routeType} 작업을 처리하던 중이었습니다.`,
    cause: "프로그램이 미리 처리하지 못한 예외가 발생했습니다. 기술 정보에서 오류 종류를 확인해야 합니다.",
    impact: "해당 요청 또는 화면 표시가 정상적으로 완료되지 않았습니다.",
    action: "최근 배포 변경과 기술 오류 정보를 확인하고 같은 경로에서 재현되는지 점검해 주세요.",
    route: request.path,
    method: request.method,
    digest:
      error && typeof error === "object" && "digest" in error
        ? String(error.digest)
        : null,
    error,
    metadata: {
      router: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource ?? "해당 없음",
    },
  });
};
