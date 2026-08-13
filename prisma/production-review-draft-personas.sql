-- Additive, idempotent migration for virtual reviewer styles.
-- Run explicitly against production before deploying code that uses this schema.

CREATE TABLE IF NOT EXISTS "ReviewDraftPersona" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "styleInstruction" TEXT NOT NULL,
  "examplesJson" TEXT NOT NULL DEFAULT '[]',
  "referenceUrlsJson" TEXT NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReviewDraftPersona_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReviewDraftPersona_name_key" ON "ReviewDraftPersona"("name");
CREATE INDEX IF NOT EXISTS "ReviewDraftPersona_active_createdAt_idx" ON "ReviewDraftPersona"("active", "createdAt");

ALTER TABLE "DraftTrainingExample" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
ALTER TABLE "DraftTuningDataset" ADD COLUMN IF NOT EXISTS "personaId" TEXT;

CREATE INDEX IF NOT EXISTS "DraftTrainingExample_personaId_status_split_createdAt_idx"
  ON "DraftTrainingExample"("personaId", "status", "split", "createdAt");
CREATE INDEX IF NOT EXISTS "DraftTuningDataset_personaId_status_createdAt_idx"
  ON "DraftTuningDataset"("personaId", "status", "createdAt");
