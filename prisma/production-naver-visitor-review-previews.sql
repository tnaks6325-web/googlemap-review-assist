-- Additive, idempotent production migration for manually collected public Naver visitor-review previews.
-- These tables are campaign manuscript references only; they never modify submissions, payments, or reviewer accounts.

CREATE TABLE IF NOT EXISTS "NaverVisitorReviewRun" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "inputUrl" TEXT NOT NULL,
  "visitorReviewUrl" TEXT NOT NULL,
  "placeName" TEXT,
  "sort" TEXT NOT NULL DEFAULT 'RECOMMENDED',
  "status" TEXT NOT NULL,
  "activeKey" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NaverVisitorReviewRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NaverVisitorReviewRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "NaverVisitorReviewPreview" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "authorMasked" TEXT,
  "content" TEXT NOT NULL,
  "rating" INTEGER,
  "visitDate" TEXT,
  "verificationMethod" TEXT,
  "keywordsJson" TEXT NOT NULL DEFAULT '[]',
  "hasMedia" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NaverVisitorReviewPreview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NaverVisitorReviewPreview_runId_fkey" FOREIGN KEY ("runId") REFERENCES "NaverVisitorReviewRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "NaverVisitorReviewRun" ADD COLUMN IF NOT EXISTS "activeKey" TEXT;

CREATE INDEX IF NOT EXISTS "NaverVisitorReviewRun_campaignId_createdAt_idx" ON "NaverVisitorReviewRun"("campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "NaverVisitorReviewRun_campaignId_status_createdAt_idx" ON "NaverVisitorReviewRun"("campaignId", "status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "NaverVisitorReviewRun_activeKey_key" ON "NaverVisitorReviewRun"("activeKey");
CREATE UNIQUE INDEX IF NOT EXISTS "NaverVisitorReviewPreview_runId_ordinal_key" ON "NaverVisitorReviewPreview"("runId", "ordinal");
CREATE INDEX IF NOT EXISTS "NaverVisitorReviewPreview_runId_idx" ON "NaverVisitorReviewPreview"("runId");
