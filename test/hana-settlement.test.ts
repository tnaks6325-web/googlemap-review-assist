import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  hanaBankCode,
  hanaTransferExportDedupeKey,
  hasAmbiguousHanaTransferTarget,
  matchHanaTransferConfirmation,
} from "@/lib/domain/hana-settlement";
import { createHanaTransferXls } from "@/lib/hana-transfer-workbook";
import {
  HanaResultError,
  hasHanaExportSettlementOverlap,
  parseHanaTransferResult,
} from "@/lib/domain/hana-settlement-results";

describe("Hana settlement files", () => {
  it("uses Hana bank codes and preserves text account identifiers in the transfer workbook", () => {
    expect(hanaBankCode("하나은행")).toBe("081");
    expect(hanaBankCode("KB국민은행")).toBe("004");
    const workbook = createHanaTransferXls([
      { bankCode: "081", accountNumber: "011012345678", amount: 500, accountHolder: "김정산" },
    ]);
    expect(workbook.subarray(0, 8).toString("hex")).toBe("d0cf11e0a1b11ae1");
    const parsed = XLSX.read(workbook, { type: "buffer" });
    expect(parsed.SheetNames).toEqual(["1209", "Sheet2", "Sheet3"]);
    expect(XLSX.utils.sheet_to_json(parsed.Sheets["1209"], { header: 1 })).toEqual([
      ["입금은행코드", "입금계좌번호", "이체금액", "예상예금주", "보내는분 통장표시내용", "받는분 통장표시내용", "CMS/모집인코드"],
      ["081", "011012345678", 500, "김정산", "김정산 IA플레이스", "IA플레이스", ""],
    ]);
  });

  it("accepts a completed row only when account, amount, and recipient all match", () => {
    expect(matchHanaTransferConfirmation(
      { settlementId: "s-1", accountNumber: "110123456789", amount: 5000, accountHolder: "김정산" },
      { account: "하나은행 110-123-456789", amount: "5,000", recipient: "김정산", status: "처리완료" },
    )).toEqual({ matched: true });
    expect(matchHanaTransferConfirmation(
      { settlementId: "s-1", accountNumber: "110123456789", amount: 5000, accountHolder: "김정산" },
      { account: "110123456789", amount: 5000, recipient: "김정산", status: "처리중" },
    )).toMatchObject({ matched: false, reason: "NOT_COMPLETED" });
  });

  it("parses a final Hana result but rejects reservation or pending files", () => {
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([
      ["등록일자", "이체처리(예정)일", "입금계좌", "이체금액", "수수료", "받는분", "받는분 통장 표시", "처리상태"],
      ["", "", "하나 110-123-456789", 500, 0, "김정산", "김정산 IA플레이스", "처리완료"],
    ]), "Sheet1");
    expect(parseHanaTransferResult(XLSX.write(source, { type: "buffer", bookType: "biff8" }))).toEqual([
      { account: "110123456789", amount: 500, recipient: "김정산", state: "SUCCESS" },
    ]);
    XLSX.utils.sheet_add_aoa(source.Sheets.Sheet1, [["", "", "하나 110-123-456789", 500, 0, "김정산", "김정산 IA플레이스", "등록 (예약대기)"]], { origin: "A2" });
    expect(() => parseHanaTransferResult(XLSX.write(source, { type: "buffer", bookType: "biff8" }))).toThrow(HanaResultError);
  });

  it("detects an overlap with an unreconciled export before another bank file is created", () => {
    const pendingBatch = JSON.stringify({ settlementIds: ["settlement-1", "settlement-2"] });

    expect(hasHanaExportSettlementOverlap([pendingBatch], ["settlement-2", "settlement-3"])).toBe(true);
    expect(hasHanaExportSettlementOverlap([pendingBatch], ["settlement-3"])).toBe(false);
    expect(hasHanaExportSettlementOverlap(["not-json"], ["settlement-1"])).toBe(false);
  });

  it("uses one stable key for the same set of bank transfer settlements", () => {
    expect(hanaTransferExportDedupeKey(["settlement-2", "settlement-1"])).toBe(
      hanaTransferExportDedupeKey(["settlement-1", "settlement-2"]),
    );
    expect(hanaTransferExportDedupeKey(["settlement-1"])).not.toBe(
      hanaTransferExportDedupeKey(["settlement-2"]),
    );
  });

  it("rejects ambiguous bank result targets before a transfer workbook is created", () => {
    const target = { accountNumber: "110-123-456789", amount: 5000, accountHolder: "김정산" };
    expect(hasAmbiguousHanaTransferTarget([
      { settlementId: "settlement-1", ...target },
      { settlementId: "settlement-2", ...target },
    ])).toBe(true);
    expect(hasAmbiguousHanaTransferTarget([
      { settlementId: "settlement-1", ...target },
      { settlementId: "settlement-2", ...target, amount: 6000 },
    ])).toBe(false);
  });
});
