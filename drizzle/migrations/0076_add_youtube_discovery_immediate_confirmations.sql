ALTER TABLE "youtube_discovery_runs"
  ADD COLUMN "immediate_operator_user_id" text,
  ADD COLUMN "immediate_confirmation_key" text;

ALTER TABLE "youtube_discovery_runs"
  ADD CONSTRAINT "youtube_discovery_runs_immediate_confirmation_check"
  CHECK (("immediate_operator_user_id" IS NULL AND "immediate_confirmation_key" IS NULL) OR ("immediate_operator_user_id" IS NOT NULL AND "immediate_confirmation_key" IS NOT NULL AND "query_proposal_id" IS NOT NULL AND "schedule_interval_at" IS NULL AND length(btrim("immediate_operator_user_id")) BETWEEN 1 AND 128 AND "immediate_confirmation_key" ~ '^[A-Za-z0-9_-]{16,128}$'));

CREATE UNIQUE INDEX "youtube_discovery_runs_immediate_confirmation_idx"
  ON "youtube_discovery_runs" ("query_proposal_id", "immediate_operator_user_id", "immediate_confirmation_key")
  WHERE "query_proposal_id" IS NOT NULL AND "immediate_operator_user_id" IS NOT NULL AND "immediate_confirmation_key" IS NOT NULL;
