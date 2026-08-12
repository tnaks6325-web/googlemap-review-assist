import * as XLSX from "xlsx";

export interface HanaTransferWorkbookRow {
  bankCode: string;
  accountNumber: string;
  amount: number;
  accountHolder: string;
}

const HEADERS = [
  "입금은행코드",
  "입금계좌번호",
  "이체금액",
  "예상예금주",
  "보내는분 통장표시내용",
  "받는분 통장표시내용",
  "CMS/모집인코드",
];
const HANA_SHEET_NAMES = ["1209", "Sheet2", "Sheet3"] as const;

function makeTransferSheet(rows: HanaTransferWorkbookRow[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ...rows.map((row) => [
      row.bankCode,
      row.accountNumber,
      row.amount,
      row.accountHolder,
      `${row.accountHolder} IA플레이스`,
      "IA플레이스",
      "",
    ]),
  ]);
  for (let row = 1; row <= rows.length; row += 1) {
    const bankCodeCell = sheet[`A${row + 1}`];
    const accountCell = sheet[`B${row + 1}`];
    if (bankCodeCell) bankCodeCell.t = "s";
    if (accountCell) accountCell.t = "s";
  }
  sheet["!cols"] = [
    { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 18 },
    { wch: 28 }, { wch: 20 }, { wch: 18 },
  ];
  return sheet;
}

/** Creates Hana's Excel 97-2003 multi-transfer workbook. */
export function createHanaTransferXls(rows: HanaTransferWorkbookRow[]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, makeTransferSheet(rows), HANA_SHEET_NAMES[0]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), HANA_SHEET_NAMES[1]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), HANA_SHEET_NAMES[2]);
  return XLSX.write(workbook, { bookType: "biff8", type: "buffer", compression: false });
}
