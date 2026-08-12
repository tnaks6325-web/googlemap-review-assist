import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { campaignOperationsMutationLockResponse } from "@/lib/admin-campaign-operations-lock";
import {
  CampaignDraftEvidenceError,
  extractCampaignDraftEvidence,
  listCampaignDraftEvidence,
  summarizeCampaignDraftEvidenceFailure,
} from "@/lib/domain/campaign-draft-evidence";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;

async function authorize() {
  return getAdminId();
}

function handleEvidenceError(error: unknown) {
  if (error instanceof CampaignDraftEvidenceError) {
    return err(error.code, error.message, error.status);
  }
  console.error(
    "campaign_draft_evidence_failed",
    summarizeCampaignDraftEvidenceFailure(error),
  );
  return err("DRAFT_EVIDENCE_FAILED", "원고 사실 카드를 처리하지 못했습니다.", 500);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  if (!(await authorize())) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  const { campaignId } = await params;
  try {
    return ok(await listCampaignDraftEvidence(campaignId));
  } catch (error) {
    return handleEvidenceError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않습니다.", 403);
  const adminId = await authorize();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요합니다.", 401);
  const lockResponse = await campaignOperationsMutationLockResponse();
  if (lockResponse) return lockResponse;
  if (!(await rateLimit(`admin:draft-evidence:extract:${adminId}:${clientIp(req)}`, 10, HOUR)).ok) {
    return err("RATE_LIMITED", "자료 분석 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.", 429);
  }
  const { campaignId } = await params;
  try {
    return ok(await extractCampaignDraftEvidence(campaignId));
  } catch (error) {
    return handleEvidenceError(error);
  }
}
