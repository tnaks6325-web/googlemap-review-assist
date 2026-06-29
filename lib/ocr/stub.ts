import type { OcrProvider, OcrInput, OcrResult } from "./types";
import { parseReceiptText } from "./parse";

// 개발용 스텁: mockText를 공유 파서로 처리. 이미지 바이트만 있으면 인식 불가(낮은 신뢰도).
export class StubOcrProvider implements OcrProvider {
  name = "stub";
  async extract(input: OcrInput): Promise<OcrResult> {
    if (input.mockText) {
      const p = parseReceiptText(input.mockText);
      return { ...p, rawText: input.mockText.slice(0, 2000), confidence: p.fieldsFound / 4 };
    }
    return { rawText: "", confidence: 0 };
  }
}
