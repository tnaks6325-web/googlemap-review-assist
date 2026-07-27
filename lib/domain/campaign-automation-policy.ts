import { createHash } from "node:crypto";

export const CAMPAIGN_AUTOMATION_DRAFT_TARGET = 25;
export const CAMPAIGN_AUTOMATION_MIN_EVIDENCE = 6;
export const CAMPAIGN_AUTOMATION_MIN_EVIDENCE_FACETS = 3;

export interface CampaignSourceKeyInput {
  receiptId?: string | null;
  spreadsheetId: string;
  sheetName: string;
  advertiserName: string;
  landingUrl: string;
  startDate: string;
}

export interface CampaignAutomationGateInput {
  sourceReady: boolean;
  googlePlaceLinked: boolean;
  naverPlaceLinked: boolean;
  activeReferenceCount: number;
  evidenceCount: number;
  evidenceFacetCount: number;
  unassignedQualityDraftCount: number;
  campaignPeriodValid: boolean;
}

export type CampaignAutomationGateReason =
  | "SOURCE_NOT_READY"
  | "GOOGLE_PLACE_NOT_LINKED"
  | "NAVER_PLACE_NOT_LINKED"
  | "REFERENCE_NOT_READY"
  | "EVIDENCE_NOT_READY"
  | "PREPARED_DRAFT_TARGET_NOT_MET"
  | "CAMPAIGN_PERIOD_INVALID";

function normalizedSourceValue(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ko-KR");
}

export function campaignAutomationRunKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `NEW_CAMPAIGN_DAILY:${value("year")}-${value("month")}-${value("day")}`;
}

export function campaignSourceKey(input: CampaignSourceKeyInput) {
  const receiptId = input.receiptId?.trim();
  if (receiptId) return `receipt:${receiptId}`;

  const fingerprint = [
    input.spreadsheetId,
    input.sheetName,
    input.advertiserName,
    input.landingUrl,
    input.startDate,
  ].map(normalizedSourceValue).join("\n");
  return `legacy:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 32)}`;
}

export function evaluateCampaignAutomationGate(input: CampaignAutomationGateInput) {
  const reasons: CampaignAutomationGateReason[] = [];
  if (!input.sourceReady) reasons.push("SOURCE_NOT_READY");
  if (!input.googlePlaceLinked) reasons.push("GOOGLE_PLACE_NOT_LINKED");
  if (!input.naverPlaceLinked) reasons.push("NAVER_PLACE_NOT_LINKED");
  if (input.activeReferenceCount < 1) reasons.push("REFERENCE_NOT_READY");
  if (
    input.evidenceCount < CAMPAIGN_AUTOMATION_MIN_EVIDENCE ||
    input.evidenceFacetCount < CAMPAIGN_AUTOMATION_MIN_EVIDENCE_FACETS
  ) {
    reasons.push("EVIDENCE_NOT_READY");
  }
  if (input.unassignedQualityDraftCount !== CAMPAIGN_AUTOMATION_DRAFT_TARGET) {
    reasons.push("PREPARED_DRAFT_TARGET_NOT_MET");
  }
  if (!input.campaignPeriodValid) reasons.push("CAMPAIGN_PERIOD_INVALID");
  return { ready: reasons.length === 0, reasons };
}
