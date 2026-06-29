import type { OcrProvider } from "./types";
import { StubOcrProvider } from "./stub";
import { VisionOcrProvider } from "./vision";

// 운영: OCR_PROVIDER=vision + GOOGLE_VISION_API_KEY → Vision. 그 외 → 스텁(개발).
export function getOcrProvider(): OcrProvider {
  if (process.env.OCR_PROVIDER === "vision" && process.env.GOOGLE_VISION_API_KEY) {
    return new VisionOcrProvider();
  }
  return new StubOcrProvider();
}

export type { OcrResult, OcrInput, OcrProvider } from "./types";
