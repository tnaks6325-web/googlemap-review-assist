import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("persona-scoped fine tuning", () => {
  it("keeps fine-tuning data and active releases inside the selected persona scope", () => {
    const adminSource = readFileSync("lib/domain/draft-fine-tuning-admin.ts", "utf8");
    const generationSource = readFileSync("lib/gemini-generation.ts", "utf8");

    expect(adminSource).toContain("const exampleWhere = { personaId: scope.personaId }");
    expect(adminSource).toContain("personaId: scope.personaId, baseModel");
    expect(adminSource).toContain("dataset: { personaId: release.tuningJob.dataset.personaId }");
    expect(generationSource).toContain("tuningJob: { dataset: { personaId } }");
    expect(generationSource).toContain("dataset: { personaId: null }");
  });

  it("passes the selected active virtual reviewer into both preview and assignment generation", () => {
    const source = readFileSync("lib/domain/campaign-review-draft.ts", "utf8");

    expect(source).toContain("const previewPersona = personaForDraftSequence");
    expect(source).toContain("const persona = personaForDraftSequence");
    expect(source).toContain("persona ? renderPersonaStyle(persona) : \"\"");
    expect(source).toContain("personaId: persona?.id");
  });
});
