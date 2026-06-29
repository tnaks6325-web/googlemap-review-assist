export interface OcrInput {
  imageBytes?: Uint8Array;
  mimeType?: string;
  /** 개발 전용: 실제 OCR 대신 파싱할 텍스트(스텁). 운영 라우트에서는 무시. */
  mockText?: string;
}

export interface OcrResult {
  approvalNo?: string;
  amount?: number;
  paidAt?: string; // YYYY-MM-DD
  merchantName?: string;
  rawText: string;
  confidence: number; // 0..1
}

export interface OcrProvider {
  name: string;
  extract(input: OcrInput): Promise<OcrResult>;
}
