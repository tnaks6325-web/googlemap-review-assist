import { prisma } from "@/lib/db";
import { isReviewDraftProviderConfigured } from "@/lib/gemini-generation";
import { classifyDatabaseHealthError, type DatabaseHealthErrorCode } from "@/lib/health-database-status";
import { recordOperationalError } from "@/lib/error-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

export async function GET() {
  let database = "ok";
  let databaseError: DatabaseHealthErrorCode | undefined;
  let pendingJobs = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    pendingJobs = await prisma.operationalJob.count({ where: { status: { in: ["PENDING", "RETRY"] } } });
  } catch (error) {
    database = "unavailable";
    databaseError = classifyDatabaseHealthError(error);
    console.error("health_database_check_failed", { databaseError });
    await recordOperationalError({
      severity: "CRITICAL",
      source: "SERVER",
      workflow: "서비스 상태 확인",
      stage: "데이터베이스 연결 검사",
      code: "DATABASE_HEALTH_CHECK_FAILED",
      title: "데이터베이스에 연결할 수 없습니다.",
      situation: "서비스 상태 확인 요청에서 데이터베이스 연결 여부를 검사하던 중이었습니다.",
      cause: "데이터베이스 연결, 스키마 또는 응답 시간에 문제가 발생했습니다.",
      impact: "캠페인, 리뷰어, 포인트와 정산 기능이 정상적으로 동작하지 않을 수 있습니다.",
      action: "데이터베이스 연결 정보와 서비스 상태, 최신 스키마 반영 여부를 확인해 주세요.",
      route: "/api/health",
      method: "GET",
      error,
      metadata: { classification: databaseError },
    });
  }

  const body = {
    status: database === "ok" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database,
    ...(databaseError ? { databaseError } : {}),
    pendingJobs,
    integrations: {
      sms: process.env.SMS_PROVIDER === "naver-sens" && configured(process.env.NAVER_SENS_ACCESS_KEY),
      ocr: process.env.OCR_PROVIDER === "vision" && configured(process.env.GOOGLE_VISION_API_KEY),
      reviewDraft: isReviewDraftProviderConfigured(),
      jobProcessor: configured(process.env.CRON_SECRET),
      blob: configured(process.env.BLOB_READ_WRITE_TOKEN),
    },
  };
  return Response.json(body, {
    status: database === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
