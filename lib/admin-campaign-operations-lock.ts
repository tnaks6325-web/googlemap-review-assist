import {
  isCampaignOperationsLocked,
  isCampaignSheetImportLocked,
} from "@/lib/domain/campaign-operations-lock";
import { err } from "@/lib/http";

export async function campaignOperationsMutationLockResponse(
  scope: "GLOBAL" | "SHEET_IMPORT" = "GLOBAL",
) {
  const isLocked = scope === "SHEET_IMPORT"
    ? await isCampaignSheetImportLocked()
    : await isCampaignOperationsLocked();
  if (!isLocked) return null;
  return err(
    "CAMPAIGN_OPERATIONS_LOCKED",
    "신규 캠페인 자동화가 진행 중입니다. 원고보관함과 리뷰제출함은 열람만 가능하며, 변경 작업은 자동화가 끝난 뒤 다시 시도해 주세요.",
    409,
  );
}
