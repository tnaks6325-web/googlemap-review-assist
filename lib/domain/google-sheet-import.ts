import { parseGooglePlaceInput } from "@/lib/domain/external-places";
import type { ExternalPlaceSnapshot } from "@/lib/domain/external-place-providers";

export type SheetImportRowStatus = "READY" | "ERROR";
export type SheetImportPlacePreviewStatus = "RESOLVED" | "MANUAL" | "FAILED" | "SKIPPED";

export interface SheetImportPlacePreview {
  status: SheetImportPlacePreviewStatus;
  providerConfigured: boolean;
  input: string;
  placeId: string | null;
  name: string | null;
  address: string | null;
  url: string | null;
  rating: number | null;
  reviewCount: number | null;
  matchConfidence: number | null;
  message: string | null;
}

export interface SheetImportDryRunRow {
  rowNumber: number;
  status: SheetImportRowStatus;
  advertiserName: string;
  businessName: string;
  searchKeyword: string;
  landingUrl: string;
  startDate: string;
  endDate: string;
  totalQuota: number | null;
  dailyQuota: number | null;
  guide: string;
  examplePhraseCount: number;
  excludedDays: string[];
  errors: string[];
  warnings: string[];
  googlePlace?: SheetImportPlacePreview;
}

export interface SheetImportDryRunSummary {
  totalRows: number;
  readyRows: number;
  errorRows: number;
  warningRows: number;
}

export interface SheetImportDryRunResult {
  headerRowNumber: number;
  summary: SheetImportDryRunSummary;
  rows: SheetImportDryRunRow[];
}

const COLUMN = {
  startDate: 2,
  endDate: 3,
  advertiserName: 5,
  businessName: 6,
  searchKeyword: 7,
  landingUrl: 12,
  totalQuota: 13,
  dailyQuota: 14,
  guide: 15,
  examples: 16,
  excludedDays: 17,
} as const;

function cell(row: unknown[], index: number) {
  const value = row[index];
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isBlankImportRow(row: unknown[]) {
  return [
    COLUMN.landingUrl,
    COLUMN.totalQuota,
    COLUMN.dailyQuota,
    COLUMN.guide,
  ].every((index) => !cell(row, index));
}

function parsePositiveInt(value: string) {
  const normalized = value.replace(/,/g, "").match(/[0-9]+/)?.[0] ?? "";
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitDays(value: string) {
  return value
    .split(/[,\s/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function findHeaderRow(values: unknown[][]) {
  const index = values.findIndex((row) => row.some((value) => String(value).includes("업체명")));
  return index >= 0 ? index : 4;
}

export function googlePlaceInputForSheetRow(
  row: Pick<SheetImportDryRunRow, "businessName" | "searchKeyword" | "landingUrl">
) {
  const fallbackQuery = [row.businessName, row.searchKeyword].filter(Boolean).join(" ").trim();
  const landingUrl = row.landingUrl.trim();

  if (!landingUrl) return fallbackQuery;

  try {
    const parsed = parseGooglePlaceInput(landingUrl);
    if (parsed.kind === "URL") return landingUrl;
  } catch {
    return fallbackQuery || landingUrl;
  }

  return fallbackQuery || landingUrl;
}

function hasReliableGooglePlaceName(place: ExternalPlaceSnapshot, providerConfigured: boolean) {
  const name = place.name.trim();
  if (!name || !providerConfigured) return false;
  if (place.externalId?.startsWith("google:") && !place.address && place.rating == null && place.reviewCount == null) {
    return false;
  }
  return true;
}

export function applyResolvedGooglePlaceNameToSheetRow(
  row: SheetImportDryRunRow,
  place: ExternalPlaceSnapshot,
  providerConfigured: boolean
): SheetImportDryRunRow {
  if (row.businessName.trim() || !hasReliableGooglePlaceName(place, providerConfigured)) return row;
  return { ...row, businessName: place.name.trim() };
}

export function summarizeSheetImportRows(rows: SheetImportDryRunRow[]): SheetImportDryRunSummary {
  return {
    totalRows: rows.length,
    readyRows: rows.filter((row) => row.status === "READY").length,
    errorRows: rows.filter((row) => row.status === "ERROR").length,
    warningRows: rows.filter((row) => row.warnings.length > 0).length,
  };
}

export function parseGoogleMapReviewSheet(values: unknown[][]): SheetImportDryRunResult {
  const headerIndex = findHeaderRow(values);
  const rows: SheetImportDryRunRow[] = [];

  values.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + 2 + offset;
    if (isBlankImportRow(row)) return;

    const advertiserName = cell(row, COLUMN.advertiserName);
    const businessName = cell(row, COLUMN.businessName);
    const searchKeyword = cell(row, COLUMN.searchKeyword);
    const landingUrl = cell(row, COLUMN.landingUrl);
    const startDate = cell(row, COLUMN.startDate);
    const endDate = cell(row, COLUMN.endDate);
    const totalQuota = parsePositiveInt(cell(row, COLUMN.totalQuota));
    const dailyQuota = parsePositiveInt(cell(row, COLUMN.dailyQuota));
    const guide = cell(row, COLUMN.guide);
    const examplePhraseCount = splitLines(cell(row, COLUMN.examples)).length;
    const excludedDays = splitDays(cell(row, COLUMN.excludedDays));

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!advertiserName) errors.push("광고주명이 필요합니다");
    if (!businessName) errors.push("업체명이 필요합니다");
    if (!landingUrl && !searchKeyword) errors.push("랜딩 URL 또는 검색키워드가 필요합니다");
    if (!startDate) errors.push("광고 시작일이 필요합니다");
    if (!endDate) errors.push("광고 종료일이 필요합니다");
    if (!totalQuota) errors.push("전체 수량이 필요합니다");
    if (!dailyQuota) errors.push("데일리 수량이 필요합니다");
    if (!businessName && landingUrl) {
      errors.splice(advertiserName ? 0 : 1, 1);
    }
    if (totalQuota && dailyQuota && dailyQuota > totalQuota) {
      errors.push("데일리 수량은 전체 수량보다 클 수 없습니다");
    }
    if (landingUrl && !/^https?:\/\//i.test(landingUrl)) {
      warnings.push("랜딩 URL이 http 또는 https로 시작하지 않습니다");
    }
    if (!guide) warnings.push("가이드라인이 비어 있습니다");
    if (examplePhraseCount === 0) warnings.push("리뷰 문구 예시가 비어 있습니다");

    rows.push({
      rowNumber,
      status: errors.length ? "ERROR" : "READY",
      advertiserName,
      businessName,
      searchKeyword,
      landingUrl,
      startDate,
      endDate,
      totalQuota,
      dailyQuota,
      guide,
      examplePhraseCount,
      excludedDays,
      errors,
      warnings,
    });
  });

  return {
    headerRowNumber: headerIndex + 1,
    summary: summarizeSheetImportRows(rows),
    rows,
  };
}
