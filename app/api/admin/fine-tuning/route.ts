import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import {
  activateModelRelease,
  buildFineTuningDataset,
  cancelFineTuningJob,
  createManualTrainingExample,
  getFineTuningDashboard,
  importAdminRevisions,
  saveModelEvaluation,
  startFineTuningJob,
  syncFineTuningJob,
  updateTrainingExample,
} from "@/lib/domain/draft-fine-tuning-admin";
import { DraftFineTuningError } from "@/lib/domain/draft-fine-tuning";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const HOUR_MS = 60 * 60 * 1000;

function errorResponse(error: unknown) {
  if (error instanceof DraftFineTuningError) return err(error.code, error.message, error.status);
  return err("FINE_TUNING_OPERATION_FAILED", "파인튜닝 작업을 완료하지 못했습니다.", 500);
}

export async function GET() {
  if (!(await getAdminId())) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  try { return ok(await getFineTuningDashboard()); } catch (error) { return errorResponse(error); }
}

export async function POST(req: Request) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return err("INVALID_INPUT", "요청 내용을 확인해 주세요.");
  const limit = body.action === "start-job" ? 2 : 120;
  if (!(await rateLimit(`admin:fine-tuning:${body.action}:${adminId}:${clientIp(req)}`, limit, HOUR_MS)).ok) return err("RATE_LIMITED", "잠시 후 다시 시도해 주세요.", 429);
  try {
    switch (body.action) {
      case "create-example": return ok(await createManualTrainingExample(adminId, body), 201);
      case "update-example": return ok(await updateTrainingExample(adminId, String(body.id ?? ""), body));
      case "import-revisions": return ok(await importAdminRevisions(adminId));
      case "build-dataset": return ok(await buildFineTuningDataset(adminId), 201);
      case "start-job": return ok(await startFineTuningJob(adminId, String(body.datasetId ?? "")), 201);
      case "sync-job": return ok(await syncFineTuningJob(String(body.id ?? "")));
      case "cancel-job": return ok(await cancelFineTuningJob(String(body.id ?? "")));
      case "save-evaluation": return ok(await saveModelEvaluation(String(body.releaseId ?? ""), body));
      case "activate-release": return ok(await activateModelRelease(adminId, String(body.releaseId ?? ""), body.confirmed === true));
      default: return err("ACTION_NOT_SUPPORTED", "지원하지 않는 작업입니다.", 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
