import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schemas = [
  readFileSync("prisma/schema.prisma", "utf8"),
  readFileSync("prisma/schema.postgres.prisma", "utf8"),
];

describe.each(schemas.map((schema, index) => ({
  schema,
  name: index === 0 ? "SQLite" : "PostgreSQL",
})))("$name fine-tuning schema", ({ schema }) => {
  it.each([
    "DraftTrainingExample",
    "DraftTuningDataset",
    "DraftTuningDatasetExample",
    "DraftTuningJob",
    "DraftModelRelease",
  ])("contains the %s model", (modelName) => {
    expect(schema).toContain(`model ${modelName} {`);
  });

  it("keeps datasets immutable through explicit example snapshots", () => {
    expect(schema).toMatch(/examples\s+DraftTuningDatasetExample\[\]/);
    expect(schema).toContain("@@unique([datasetId, exampleId])");
    expect(schema).toContain("@@unique([datasetId, split, position])");
  });

  it("stores Vertex job and promoted release separately", () => {
    expect(schema).toMatch(/vertexJobName\s+String\?\s+@unique/);
    expect(schema).toMatch(/tunedEndpointName\s+String\?/);
    expect(schema).toMatch(/tuningJobId\s+String\s+@unique/);
  });
});
