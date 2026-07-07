// AI 리뷰 초안 생성.
// 컴플라이언스 C2: 고객이 제출한 내용(별점/선택 메뉴/소감)만 사실 출처로 사용.
// 경험/메뉴/감상을 새로 지어내지 않는다. menuCatalog는 표기 보정용.

export interface DraftInput {
  businessName: string;
  rating: number;
  selectedMenus: string[];
  comment?: string;
  menuCatalog: string[];
}

export type DraftProvider = "template" | "anthropic";

export interface DraftGenerationResult {
  text: string;
  provider: DraftProvider;
  model: string | null;
  fallbackFrom?: DraftProvider;
}

const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `당신은 사용자가 직접 작성하려는 가게 리뷰의 '초안'을 다듬어 주는 보조 작가입니다.
사용자가 실제로 제출한 정보만 사용해 자연스러운 한국어 리뷰 문장으로 정리하세요.
1. 사용자가 제출한 별점·선택 메뉴·소감에 들어있는 사실만 사용한다.
2. 사용자가 언급하지 않은 메뉴, 경험, 직원, 분위기, 가격, 재방문 의사 등을 새로 지어내지 않는다.
3. 메뉴 이름은 제공된 메뉴 목록 표기에 맞춰 교정하되, 목록에 있어도 사용자가 선택하지 않은 메뉴는 넣지 않는다.
4. 별점과 소감의 톤에 맞춘다.
5. 광고처럼 들리는 정형 문구·과장·이모지 남발을 피하고 담백하게.
6. 1~3문장, 한국어 구어체. 별점을 숫자로 다시 적지 않는다.
출력: 리뷰 본문 텍스트만. 설명·머리말·따옴표 없이.`;

function buildUserPrompt(input: DraftInput): string {
  return [
    `가게: ${input.businessName}`,
    `별점: ${input.rating}/5`,
    `좋았다고 선택한 메뉴: ${input.selectedMenus.join(", ") || "없음"}`,
    `한 줄 소감: ${input.comment?.trim() || "(없음)"}`,
    `(참고용 메뉴 표기 목록: ${input.menuCatalog.join(", ")})`,
    "",
    "위 정보만으로 리뷰 초안을 작성해 줘.",
  ].join("\n");
}

/** 키 없을 때의 결정적 폴백 — 제출 데이터만 조합(창작 없음) */
export function generateTemplateDraft(input: DraftInput): string {
  const parts: string[] = [];
  if (input.selectedMenus.length) {
    parts.push(`${input.selectedMenus.join(", ")} 먹었어요.`);
  }
  const comment = input.comment?.trim().replace(/\s+/g, " ");
  if (comment) parts.push(comment.endsWith(".") ? comment : `${comment}.`);
  parts.push(
    input.rating >= 4
      ? "전체적으로 만족스러웠어요."
      : input.rating === 3
        ? "무난한 방문이었어요."
        : "다음엔 더 좋아지길 기대해요."
  );
  return parts.join(" ");
}

function sanitizeDraftText(text: string) {
  return text
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1000);
}

export function selectDraftProvider(env: NodeJS.ProcessEnv = process.env): DraftProvider {
  if (env.AI_DRAFT_PROVIDER === "template") return "template";
  if (env.AI_DRAFT_PROVIDER === "anthropic") return env.ANTHROPIC_API_KEY ? "anthropic" : "template";
  return env.ANTHROPIC_API_KEY ? "anthropic" : "template";
}

async function generateWithClaude(input: DraftInput): Promise<DraftGenerationResult> {
  const model = process.env.AI_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const data = await res.json();
  const text: string | undefined = data?.content?.[0]?.text?.trim();
  if (!text) throw new Error("empty draft");
  return { text: sanitizeDraftText(text), provider: "anthropic", model };
}

export async function generateDraftResult(input: DraftInput): Promise<DraftGenerationResult> {
  const provider = selectDraftProvider();
  if (provider === "anthropic") {
    try {
      return await generateWithClaude(input);
    } catch {
      // 실패 시 폴백 — 적립/설문에는 영향 없음 (가용성)
      return {
        text: generateTemplateDraft(input),
        provider: "template",
        model: null,
        fallbackFrom: "anthropic",
      };
    }
  }

  return { text: generateTemplateDraft(input), provider: "template", model: null };
}

export async function generateDraft(input: DraftInput): Promise<string> {
  return (await generateDraftResult(input)).text;
}
