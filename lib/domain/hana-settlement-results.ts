import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { runMoneyTx } from "@/lib/tx";
import { decodeSettlementPayoutInfo } from "@/lib/domain/settlement";

const REQUIRED_HEADERS = ["입금계좌", "이체금액", "받는분", "처리상태"] as const;
const MAX_SHEETS = 5;
const MAX_ROWS = 2_000;
const MAX_COLUMNS = 40;

type ResultState = "SUCCESS" | "FAILED";

interface HanaResultRow {
  account: string;
  amount: number;
  recipient: string;
  state: ResultState;
}

interface ExportPayload {
  settlementIds?: unknown;
  filename?: unknown;
  count?: unknown;
  totalAmount?: unknown;
}

export interface HanaExportBatchSummary {
  id: string;
  filename: string;
  count: number;
  totalAmount: number;
  createdAt: Date;
  status: string;
  result: HanaImportSummary | null;
}

export interface HanaImportSummary {
  paidCount: number;
  accountErrorCount: number;
  importedAt: Date;
}

export class HanaResultError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
  }
}

const normalizeHeader = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();
const normalizeDigits = (value: unknown) => String(value ?? "").replace(/[^0-9]/g, "");
const normalizeName = (value: unknown) => String(value ?? "").replace(/\s+/g, "").trim();

function parseAmount(value: unknown): number | null {
  const digits = normalizeDigits(value);
  if (!digits) return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function classifyResultStatus(value: unknown): ResultState {
  const status = normalizeHeader(value);
  if (/처리완료|이체완료|정상처리|정상완료|성공/.test(status)) return "SUCCESS";
  if (/처리중|등록|예약|대기/.test(status)) {
    throw new HanaResultError("RESULT_NOT_FINAL", "하나은행에서 이체 완료 또는 실패로 확정된 결과 파일만 반영할 수 있습니다.");
  }
  if (/실패|오류|반려|불능|거절/.test(status)) return "FAILED";
  throw new HanaResultError("UNKNOWN_RESULT_STATE", "하나은행 결과 파일의 처리상태를 확인할 수 없습니다.");
}

function parseExportPayload(value: string) {
  let payload: ExportPayload;
  try {
    payload = JSON.parse(value) as ExportPayload;
  } catch {
    throw new HanaResultError("INVALID_EXPORT_BATCH", "다운로드 이력을 읽을 수 없습니다.", 409);
  }
  const settlementIds = Array.isArray(payload.settlementIds)
    ? [...new Set(payload.settlementIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  if (!settlementIds.length) {
    throw new HanaResultError("INVALID_EXPORT_BATCH", "다운로드 건에 정산 대상 정보가 없습니다.", 409);
  }
  return {
    settlementIds,
    filename: typeof payload.filename === "string" ? payload.filename : "하나은행 이체 파일",
    count: typeof payload.count === "number" ? payload.count : settlementIds.length,
    totalAmount: typeof payload.totalAmount === "number" ? payload.totalAmount : 0,
  };
}

/**
 * A settlement must never be sent to the bank twice while its previously
 * downloaded transfer file is still awaiting a final result reconciliation.
 * Invalid historical job payloads are ignored here and remain inspectable by
 * administrators rather than blocking every future export.
 */
export function hasHanaExportSettlementOverlap(payloads: string[], settlementIds: string[]) {
  const currentIds = new Set(settlementIds);
  return payloads.some((payload) => {
    try {
      return parseExportPayload(payload).settlementIds.some((id) => currentIds.has(id));
    } catch {
      return false;
    }
  });
}

function assertSafeWorkbookShape(workbook: XLSX.WorkBook, sheet: XLSX.WorkSheet) {
  if (!workbook.SheetNames.length || workbook.SheetNames.length > MAX_SHEETS) {
    throw new HanaResultError("INVALID_RESULT_FILE", "결과 파일의 시트 수가 허용 범위를 벗어났습니다.");
  }
  const ref = sheet["!ref"];
  if (!ref) throw new HanaResultError("EMPTY_RESULT_FILE", "대조할 이체 결과 행이 없습니다.");
  const range = XLSX.utils.decode_range(ref);
  if (range.e.r - range.s.r + 1 > MAX_ROWS || range.e.c - range.s.c + 1 > MAX_COLUMNS) {
    throw new HanaResultError("RESULT_FILE_TOO_LARGE", "결과 파일의 행 또는 열 수가 허용 범위를 벗어났습니다.");
  }
}

/** Parses a final Hana result workbook without retaining the uploaded file or PII. */
export function parseHanaTransferResult(buffer: Buffer): HanaResultRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch {
    throw new HanaResultError("INVALID_RESULT_FILE", "하나은행 결과 파일을 읽을 수 없습니다.");
  }
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
  if (!sheet) throw new HanaResultError("INVALID_RESULT_FILE", "결과 파일에 시트가 없습니다.");
  assertSafeWorkbookShape(workbook, sheet);

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerIndex = rows.findIndex((row) => {
    const headers = new Set(row.map(normalizeHeader));
    return REQUIRED_HEADERS.every((header) => headers.has(header));
  });
  if (headerIndex < 0) {
    throw new HanaResultError("INVALID_RESULT_FILE", "하나은행 결과 파일의 필수 열을 찾을 수 없습니다.");
  }
  const headers = rows[headerIndex].map(normalizeHeader);
  const column = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)])) as Record<(typeof REQUIRED_HEADERS)[number], number>;
  const resultRows = rows.slice(headerIndex + 1).flatMap((row) => {
    const account = normalizeDigits(row[column["입금계좌"]]);
    const amount = parseAmount(row[column["이체금액"]]);
    const recipient = normalizeName(row[column["받는분"]]);
    const status = row[column["처리상태"]];
    if (!account && !amount && !recipient && !normalizeHeader(status)) return [];
    if (!account || !amount || !recipient || !normalizeHeader(status)) {
      throw new HanaResultError("INVALID_RESULT_ROW", "결과 파일에 계좌·금액·예금주·처리상태가 비어 있는 행이 있습니다.");
    }
    return [{ account, amount, recipient, state: classifyResultStatus(status) }];
  });
  if (!resultRows.length) throw new HanaResultError("EMPTY_RESULT_FILE", "대조할 이체 결과 행이 없습니다.");
  return resultRows;
}

function sameSettlementSet(left: string[], right: string[]) {
  return left.length === right.length && [...left].sort().every((id, index) => id === [...right].sort()[index]);
}

export async function reconcileHanaTransferResult(input: {
  batchId: string;
  buffer: Buffer;
  actor: string;
}) {
  const rows = parseHanaTransferResult(input.buffer);
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const batch = await prisma.operationalJob.findFirst({
    where: { id: input.batchId, type: "HANA_TRANSFER_EXPORT" },
    select: { id: true, payloadJson: true, status: true, createdAt: true },
  });
  if (!batch) throw new HanaResultError("EXPORT_BATCH_NOT_FOUND", "다운로드 이력을 찾을 수 없습니다.", 404);
  if (batch.status === "RECONCILED") throw new HanaResultError("BATCH_ALREADY_RECONCILED", "이 결과 파일은 이미 처리되었습니다.", 409);
  const payload = parseExportPayload(batch.payloadJson);

  const settlements = await prisma.settlement.findMany({
    where: { id: { in: payload.settlementIds } },
    select: { id: true, reviewerId: true, amount: true, payoutInfo: true, status: true },
  });
  if (
    settlements.length !== payload.settlementIds.length ||
    settlements.some((item) => item.status !== "EXPORTED" && item.status !== "REQUESTED")
  ) {
    throw new HanaResultError("BATCH_CHANGED", "다운로드 이후 정산 대상 상태가 변경되어 결과를 반영할 수 없습니다.", 409);
  }
  if (rows.length !== settlements.length) {
    throw new HanaResultError("RESULT_ROW_COUNT_MISMATCH", "결과 파일의 이체 건수가 내보낸 정산 건수와 일치하지 않습니다.");
  }

  const remainingRows = [...rows];
  const outcomes = settlements.map((settlement) => {
    const payout = decodeSettlementPayoutInfo(settlement.payoutInfo);
    if (!payout) throw new HanaResultError("INVALID_PAYOUT", "정산 대상의 계좌 정보를 확인할 수 없습니다.", 409);
    const index = remainingRows.findIndex((row) =>
      row.account === normalizeDigits(payout.accountNumber) &&
      row.amount === settlement.amount &&
      normalizeName(row.recipient) === normalizeName(payout.accountHolder),
    );
    if (index < 0) {
      throw new HanaResultError("RESULT_MISMATCH", "결과 파일의 계좌·금액·예금주가 내보낸 정산 내역과 일치하지 않습니다.");
    }
    const [matched] = remainingRows.splice(index, 1);
    return { settlement, state: matched.state };
  });
  if (remainingRows.length) throw new HanaResultError("RESULT_MISMATCH", "결과 파일에 내보낸 정산에 없는 이체 행이 있습니다.");

  const importedAt = new Date();
  return runMoneyTx(async (tx) => {
    const existingImport = await tx.operationalJob.findUnique({
      where: { dedupeKey: `hana-transfer-result:${batch.id}:${fileHash}` },
      select: { id: true },
    });
    if (existingImport) throw new HanaResultError("RESULT_ALREADY_IMPORTED", "이 결과 파일은 이미 처리되었습니다.", 409);

    const exports = await tx.operationalJob.findMany({
      where: { type: "HANA_TRANSFER_EXPORT", status: { not: "RECONCILED" } },
      select: { id: true, payloadJson: true, createdAt: true },
    });
    const hasNewerEquivalentExport = exports.some((item) => {
      if (item.id === batch.id || item.createdAt <= batch.createdAt) return false;
      try {
        return sameSettlementSet(parseExportPayload(item.payloadJson).settlementIds, payload.settlementIds);
      } catch {
        return false;
      }
    });
    if (hasNewerEquivalentExport) {
      throw new HanaResultError("STALE_EXPORT_BATCH", "같은 정산 대상의 더 최근 하나은행 파일이 있어 이전 파일 결과는 반영할 수 없습니다.", 409);
    }
    const stillRequested = await tx.settlement.count({
      where: { id: { in: payload.settlementIds }, status: { in: ["EXPORTED", "REQUESTED"] } },
    });
    if (stillRequested !== payload.settlementIds.length) {
      throw new HanaResultError("BATCH_CHANGED", "다른 처리로 정산 대상 상태가 변경되어 결과를 반영할 수 없습니다.", 409);
    }

    let paidCount = 0;
    let accountErrorCount = 0;
    for (const outcome of outcomes) {
      if (outcome.state === "SUCCESS") {
        paidCount += 1;
        await tx.settlement.update({ where: { id: outcome.settlement.id }, data: { status: "PAID", processedBy: input.actor } });
        await tx.reviewerNotification.create({
          data: {
            reviewerId: outcome.settlement.reviewerId,
            type: "SETTLEMENT_PAID",
            title: "정산 완료",
            body: `${outcome.settlement.amount.toLocaleString("ko-KR")}P 입금이 완료되었습니다.`,
            metadataJson: JSON.stringify({ settlementId: outcome.settlement.id, batchId: batch.id }),
          },
        });
      } else {
        accountErrorCount += 1;
        await tx.pointTransaction.create({
          data: {
            reviewerId: outcome.settlement.reviewerId,
            type: "ADJUST",
            amount: outcome.settlement.amount,
            settlementId: outcome.settlement.id,
            idempotencyKey: `hana-account-error:${outcome.settlement.id}`,
            memo: "하나은행 이체 실패로 정산 포인트 복구",
          },
        });
        await tx.pointWallet.update({ where: { reviewerId: outcome.settlement.reviewerId }, data: { balance: { increment: outcome.settlement.amount } } });
        await tx.settlement.update({ where: { id: outcome.settlement.id }, data: { status: "ACCOUNT_ERROR", processedBy: input.actor } });
        await tx.reviewerNotification.create({
          data: {
            reviewerId: outcome.settlement.reviewerId,
            type: "PAYOUT_ACCOUNT_ERROR",
            title: "정산 계좌 확인이 필요합니다",
            body: "이체가 완료되지 않아 포인트가 복구되었습니다. 등록한 계좌번호를 확인해 주세요.",
            metadataJson: JSON.stringify({ settlementId: outcome.settlement.id, batchId: batch.id }),
          },
        });
      }
    }
    await tx.operationalJob.create({
      data: {
        type: "HANA_TRANSFER_RESULT_IMPORT",
        status: "COMPLETED",
        dedupeKey: `hana-transfer-result:${batch.id}:${fileHash}`,
        payloadJson: JSON.stringify({ batchId: batch.id, fileHash, importedBy: input.actor, paidCount, accountErrorCount, unmatchedResultRows: 0 }),
        maxAttempts: 1,
        completedAt: importedAt,
      },
    });
    await tx.operationalJob.update({ where: { id: batch.id }, data: { status: "RECONCILED", completedAt: importedAt } });
    return { paidCount, accountErrorCount, unmatchedResultRows: 0 };
  });
}

function importSummaryForBatch(batchId: string, jobs: Array<{ payloadJson: string; completedAt: Date | null }>) {
  const summaries = jobs.flatMap((job) => {
    if (!job.completedAt) return [];
    try {
      const value = JSON.parse(job.payloadJson) as {
        batchId?: unknown;
        paidCount?: unknown;
        accountErrorCount?: unknown;
      };
      if (
        value.batchId !== batchId ||
        !Number.isSafeInteger(value.paidCount) ||
        !Number.isSafeInteger(value.accountErrorCount) ||
        (value.paidCount as number) < 0 ||
        (value.accountErrorCount as number) < 0
      ) return [];
      return [{ paidCount: value.paidCount as number, accountErrorCount: value.accountErrorCount as number, importedAt: job.completedAt }];
    } catch {
      return [];
    }
  });
  return summaries.sort((left, right) => right.importedAt.getTime() - left.importedAt.getTime())[0] ?? null;
}

/** Returns recent export metadata only; uploaded result files and account numbers are never retained here. */
export async function getHanaExportBatches(): Promise<HanaExportBatchSummary[]> {
  const [exports, imports] = await Promise.all([
    prisma.operationalJob.findMany({
      where: { type: "HANA_TRANSFER_EXPORT" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, payloadJson: true, createdAt: true, status: true },
    }),
    prisma.operationalJob.findMany({
      where: { type: "HANA_TRANSFER_RESULT_IMPORT", status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 100,
      select: { payloadJson: true, completedAt: true },
    }),
  ]);
  return exports.flatMap((job) => {
    try {
      const payload = parseExportPayload(job.payloadJson);
      return [{
        id: job.id,
        filename: payload.filename,
        count: payload.count,
        totalAmount: payload.totalAmount,
        createdAt: job.createdAt,
        status: job.status,
        result: importSummaryForBatch(job.id, imports),
      }];
    } catch {
      return [];
    }
  });
}
