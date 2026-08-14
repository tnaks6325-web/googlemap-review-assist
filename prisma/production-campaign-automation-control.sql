-- Additive, idempotent migration for the operator-controlled campaign mode.
-- Run explicitly against production before code reads or writes this table.

CREATE TABLE IF NOT EXISTS "CampaignAutomationControl" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampaignAutomationControl_pkey" PRIMARY KEY ("id")
);
