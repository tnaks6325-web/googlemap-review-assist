import { checkOrigin } from "@/lib/auth/origin";
import { getAdminId } from "@/lib/auth/session";
import { campaignOperationsMutationLockResponse } from "@/lib/admin-campaign-operations-lock";
import {
  CampaignReviewDraftError,
  CampaignReviewDraftWarningError,
  deleteCampaignPreparedDraft,
  promoteCampaignQualityExcludedDraft,
  updateCampaignPreparedDraft,
} from "@/lib/domain/campaign-review-draft";
import { err, ok } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 60 * 60 * 1000;

type DraftRouteContext = {
  params: Promise<{ campaignId: string; draftId: string }>;
};

async function authorizeMutation(req: Request, action: string) {
  if (!checkOrigin(req)) return err("BAD_ORIGIN", "요청 출처가 올바르지 않아요", 403);
  const adminId = await getAdminId();
  if (!adminId) return err("UNAUTHORIZED", "관리자 로그인이 필요해요", 401);
  const lockResponse = await campaignOperationsMutationLockResponse();
  if (lockResponse) return lockResponse;
  const allowed = await rateLimit(
    `admin:prepared-draft:${action}:${adminId}:${clientIp(req)}`,
    120,
    HOUR,
  );
  return allowed.ok ? adminId : err("RATE_LIMITED", "잠시 후 다시 시도해 주세요", 429);
}

function mutationError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof CampaignReviewDraftWarningError) {
    return ok({
      error: {
        code: error.code,
        message: error.message,
        warnings: error.warnings,
      },
    }, error.status);
  }
  if (error instanceof CampaignReviewDraftError) {
    return err(error.code, error.message, error.status);
  }
  return err(fallbackCode, fallbackMessage, 500);
}

export async function PATCH(req: Request, { params }: DraftRouteContext) {
  const authorization = await authorizeMutation(req, "update");
  if (typeof authorization !== "string") return authorization;

  const body = (await req.json().catch(() => null)) as
    | { text?: unknown; action?: unknown; force?: unknown }
    | null;
  if (body?.force !== undefined && typeof body.force !== "boolean") {
    return err("INVALID_DRAFT_OVERRIDE", "경고 무시 여부를 확인해 주세요", 400);
  }
  const { campaignId, draftId } = await params;
  try {
    if (body?.action === "PROMOTE_TO_UNASSIGNED") {
      return ok({
        draft: await promoteCampaignQualityExcludedDraft(campaignId, draftId, {
          force: body.force === true,
        }),
      });
    }
    if (typeof body?.text !== "string" || body.text.length > 2_000) {
      return err("INVALID_DRAFT_TEXT", "수정할 원고 내용을 확인해 주세요", 400);
    }
    return ok({
      draft: await updateCampaignPreparedDraft(campaignId, draftId, {
        text: body.text,
        adminId: authorization,
        force: body.force === true,
      }),
    });
  } catch (error) {
    return mutationError(error, "DRAFT_UPDATE_FAILED", "원고를 수정하지 못했어요");
  }
}

export async function DELETE(req: Request, { params }: DraftRouteContext) {
  const authorization = await authorizeMutation(req, "delete");
  if (typeof authorization !== "string") return authorization;

  const { campaignId, draftId } = await params;
  try {
    return ok(await deleteCampaignPreparedDraft(campaignId, draftId));
  } catch (error) {
    return mutationError(error, "DRAFT_DELETE_FAILED", "원고를 삭제하지 못했어요");
  }
}
