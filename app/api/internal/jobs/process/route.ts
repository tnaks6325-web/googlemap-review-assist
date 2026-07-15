import { timingSafeEqual } from "node:crypto";
import { processOperationalJobs } from "@/lib/domain/operational-jobs";
import { err, ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(req: Request) {
  if (!authorized(req)) return err("UNAUTHORIZED", "작업 처리 권한이 없습니다.", 401);
  const body = await req.json().catch(() => ({}));
  const limit = typeof body?.limit === "number" ? body.limit : 10;
  return ok(await processOperationalJobs(limit));
}
