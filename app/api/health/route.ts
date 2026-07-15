import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

export async function GET() {
  let database = "ok";
  let pendingJobs = 0;
  try {
    await prisma.$queryRaw`SELECT 1`;
    pendingJobs = await prisma.operationalJob.count({ where: { status: { in: ["PENDING", "RETRY"] } } });
  } catch {
    database = "unavailable";
  }

  const body = {
    status: database === "ok" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    database,
    pendingJobs,
    integrations: {
      sms: process.env.SMS_PROVIDER === "naver-sens" && configured(process.env.NAVER_SENS_ACCESS_KEY),
      ocr: process.env.OCR_PROVIDER === "vision" && configured(process.env.GOOGLE_VISION_API_KEY),
      reviewDraft: process.env.REVIEW_DRAFT_PROVIDER === "gemini" && configured(process.env.GEMINI_API_KEY),
      jobProcessor: configured(process.env.CRON_SECRET),
      blob: configured(process.env.BLOB_READ_WRITE_TOKEN),
    },
  };
  return Response.json(body, {
    status: database === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
