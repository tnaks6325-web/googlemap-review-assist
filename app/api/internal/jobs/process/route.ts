import { processOperationalJobs } from "@/lib/domain/operational-jobs";
import { err, ok } from "@/lib/http";
import { authorizedInternalCronRequest } from "@/lib/internal-cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function requestedLimit(value: unknown) {
  return typeof value === "number" ? value : 10;
}

async function process(req: Request, limit: number) {
  if (!authorizedInternalCronRequest(req)) return err("UNAUTHORIZED", "작업 처리 권한이 없습니다.", 401);
  return ok(await processOperationalJobs(limit));
}

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit"));
  return process(req, Number.isFinite(limit) && limit > 0 ? limit : 10);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return process(req, requestedLimit(body?.limit));
}
