import type { OcrProvider } from "./types";
import { StubOcrProvider } from "./stub";

// 운영에서는 OCR_PROVIDER 환경변수로 실제 프로바이더를 주입(후속).
// 현재는 스텁만 제공.
export function getOcrProvider(): OcrProvider {
  return new StubOcrProvider();
}

export type { OcrResult, OcrInput, OcrProvider } from "./types";
