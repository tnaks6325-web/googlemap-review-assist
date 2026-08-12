import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { campaignAutomationRunKey, campaignSourceKey } from "@/lib/domain/campaign-automation-policy";

type DbClient = typeof prisma;

export interface SheetCampaignSourceInput {
  spreadsheetId: string;
  sheetName: string;
  receiptId?: string | null;
  rowNumber: number;
  advertiserName: string;
  landingUrl: string;
  startDate: string;
  rowStatus: "READY" | "INVALID";
  rowPayload: unknown;
}

type SheetCampaignSourceChange = "NEW" | "UNCHANGED" | "UPDATED";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }
  return String(value);
}

function sourceContent(input: SheetCampaignSourceInput) {
  return JSON.stringify({
    sourceStatus: input.rowStatus,
    payload: stableValue(input.rowPayload),
  });
}

function sourceContentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export async function upsertDailyCampaignAutomationRun(date = new Date(), db: DbClient = prisma) {
  const runKey = campaignAutomationRunKey(date);
  const existing = await db.automationRun.findUnique({ where: { runKey } });
  if (existing) return { created: false, run: existing };

  try {
    const run = await db.automationRun.create({ data: { runKey, status: "QUEUED" } });
    return { created: true, run };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const run = await db.automationRun.findUniqueOrThrow({ where: { runKey } });
    return { created: false, run };
  }
}

export async function upsertSheetCampaignSource(input: SheetCampaignSourceInput, db: DbClient = prisma) {
  const sourceKey = campaignSourceKey(input);
  const contentJson = sourceContent(input);
  const contentHash = sourceContentHash(contentJson);
  const existing = await db.sheetCampaignSource.findUnique({ where: { sourceKey } });
  const sourceStatus = input.rowStatus;

  if (!existing) {
    const source = await db.sheetCampaignSource.create({
      data: {
        sourceKey,
        spreadsheetId: input.spreadsheetId.trim(),
        sheetName: input.sheetName.trim(),
        receiptId: input.receiptId?.trim() || null,
        rowNumber: input.rowNumber,
        sourceStatus,
        contentHash,
        contentJson,
      },
    });
    return { change: "NEW" as SheetCampaignSourceChange, source };
  }

  const change: SheetCampaignSourceChange = existing.contentHash === contentHash ? "UNCHANGED" : "UPDATED";
  const source = await db.sheetCampaignSource.update({
    where: { id: existing.id },
    data: {
      rowNumber: input.rowNumber,
      sourceStatus,
      contentHash,
      contentJson,
    },
  });
  return { change, source };
}
