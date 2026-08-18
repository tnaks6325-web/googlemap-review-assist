-- Additive, idempotent production migration for conservative blog fact-card detail controls.
ALTER TABLE "CampaignDraftGuidance"
  ADD COLUMN IF NOT EXISTS "blogEvidenceDetailLevel" TEXT NOT NULL DEFAULT 'TITLE_ONLY';
