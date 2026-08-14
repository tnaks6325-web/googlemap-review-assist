-- Additive, idempotent production migration for campaign automation controls.
-- Run before application code reads the global control or campaign-level flag.

CREATE TABLE IF NOT EXISTS "CampaignAutomationControl" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignAutomationControl_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "automationEnabled" BOOLEAN NOT NULL DEFAULT true;
