import type { OcrProvider, OcrInput, OcrResult } from "./types";

// 영수증 텍스트에서 핵심 필드를 정규식으로 추출(스텁).
// 실제 OCR 프로바이더(Google Vision/Naver Clova 등)는 이미지에서 rawText를 만든 뒤 동일 파서를 재사용할 수 있다.
function parseReceiptText(text: string): OcrResult {
  const approval = text.match(/(?:승인\s*(?:번호|no\.?)|approval)\s*[:：]?\s*([0-9\-]{4,})/i);
  const amountM = text.match(/(?:합계|총액|결제\s*금액|금액|total)\s*[:：]?\s*₩?\s*([0-9,]{2,})/i);
  const dateM = text.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  const merchantM = text.match(/(?:상호|가맹점(?:명)?)\s*[:：]?\s*(.+)/);

  const approvalNo = approval?.[1]?.replace(/[^0-9]/g, "") || undefined;
  const amountNum = amountM ? Number(amountM[1].replace(/[^0-9]/g, "")) : NaN;
  const amount = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : undefined;

  let fields = 0;
  if (approvalNo) fields++;
  if (amount) fields++;
  if (dateM) fields++;
  if (merchantM) fields++;

  return {
    approvalNo,
    amount,
    paidAt: dateM ? `${dateM[1]}-${dateM[2].padStart(2, "0")}-${dateM[3].padStart(2, "0")}` : undefined,
    merchantName: merchantM?.[1]?.trim().slice(0, 80),
    rawText: text.slice(0, 2000),
    confidence: Math.min(1, fields / 4),
  };
}

export class StubOcrProvider implements OcrProvider {
  name = "stub";
  async extract(input: OcrInput): Promise<OcrResult> {
    if (input.mockText) return parseReceiptText(input.mockText);
    // 이미지 바이트만 주어지면 스텁은 인식 불가 → 낮은 신뢰도(수동검토 유도)
    return { rawText: "", confidence: 0 };
  }
}
