import type { OcrProvider, OcrInput, OcrResult } from "./types";
import { parseReceiptText } from "./parse";

// Google Cloud Vision TEXT_DETECTION (API 키 방식 REST).
// 운영: OCR_PROVIDER=vision + GOOGLE_VISION_API_KEY 설정 시 사용.
// 대안(Naver Clova 등)도 동일 인터페이스로 교체 가능.
const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

interface VisionPage {
  confidence?: number;
}
interface VisionResp {
  responses?: Array<{
    fullTextAnnotation?: { text?: string; pages?: VisionPage[] };
    error?: { message?: string };
  }>;
}

export class VisionOcrProvider implements OcrProvider {
  name = "google-vision";

  async extract(input: OcrInput): Promise<OcrResult> {
    const key = process.env.GOOGLE_VISION_API_KEY;
    if (!key || !input.imageBytes || input.imageBytes.length === 0) {
      return { rawText: "", confidence: 0 };
    }

    const content = Buffer.from(input.imageBytes).toString("base64");
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // DOCUMENT_TEXT_DETECTION이 per-page confidence를 더 일관되게 제공(F3)
        requests: [{ image: { content }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }],
      }),
    });
    // F1: 제공자 메시지를 클라이언트로 전달하지 않도록 일반 에러만 throw
    if (!res.ok) throw new Error(`vision_http_${res.status}`);

    const data = (await res.json()) as VisionResp;
    const r = data.responses?.[0];
    if (r?.error?.message) throw new Error("vision_error");
    const text = r?.fullTextAnnotation?.text ?? "";
    if (!text) return { rawText: "", confidence: 0 };

    // F3: 페이지 신뢰도 평균. 부재 시 기본값 0 → confidence 게이트가 fail-closed
    const pages = r?.fullTextAnnotation?.pages ?? [];
    const confs = pages.map((p) => p.confidence).filter((c): c is number => typeof c === "number");
    const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;

    const p = parseReceiptText(text);
    return { ...p, rawText: text.slice(0, 2000), confidence };
  }
}
