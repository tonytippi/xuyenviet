CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN IF NOT EXISTS "target_digest" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN IF NOT EXISTS "safe_signal_summary" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN IF NOT EXISTS "schedule_anchor_at" timestamp;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN IF NOT EXISTS "next_due_at" timestamp;
--> statement-breakpoint
-- Story 18.3 is an unapplied clean break. This migration deliberately changes
-- schema only; it neither transforms nor backfills pre-18.3 proposal rows.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'youtube_discovery_query_proposals'::regclass AND conname = 'youtube_discovery_query_proposals_target_check') THEN
    ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_target_check" CHECK (("origin" = 'system' AND "reason" IN ('coverage_gap', 'freshness_risk', 'unresolved_conflict', 'anonymized_demand') AND "target_digest" ~ '^[a-f0-9]{64}$' AND "safe_signal_summary" = "reason") OR ("origin" = 'operator' AND "target_digest" IS NULL AND "safe_signal_summary" IS NULL));
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'youtube_discovery_query_proposals'::regclass AND conname = 'youtube_discovery_query_proposals_schedule_check') THEN
    ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_schedule_check" CHECK (("schedule_anchor_at" IS NULL AND "next_due_at" IS NULL) OR ("schedule_anchor_at" IS NOT NULL AND ("next_due_at" IS NULL OR "next_due_at" > "schedule_anchor_at")));
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_discovery_system_query_target_idx" ON "youtube_discovery_query_proposals" ("reason", "target_digest") WHERE "origin" = 'system';
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN IF NOT EXISTS "schedule_interval_at" timestamp;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "youtube_discovery_runs_proposal_interval_idx" ON "youtube_discovery_runs" ("query_proposal_id", "schedule_interval_at") WHERE "query_proposal_id" IS NOT NULL AND "schedule_interval_at" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "youtube_discovery_planning_leases" ("id" text PRIMARY KEY, "policy_version_id" text REFERENCES "youtube_discovery_policy_versions"("id") ON DELETE RESTRICT, "state" text NOT NULL DEFAULT 'queued', "next_run_at" timestamp NOT NULL, "claimed_by" text, "claimed_at" timestamp, "lease_expires_at" timestamp, "fencing_token" text, "terminal_at" timestamp, "outcome" text, "created_or_refreshed_count" integer NOT NULL DEFAULT 0, "unavailable_codes" text[] NOT NULL DEFAULT '{}', "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "youtube_discovery_planning_singleton_check" CHECK ("id" = 'youtube-discovery-planning'), CONSTRAINT "youtube_discovery_planning_state_check" CHECK ("state" IN ('queued','running','completed','cancelled')), CONSTRAINT "youtube_discovery_planning_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('completed','unavailable','contended','cancelled')), CONSTRAINT "youtube_discovery_planning_count_check" CHECK ("created_or_refreshed_count" BETWEEN 0 AND 200), CONSTRAINT "youtube_discovery_planning_codes_check" CHECK ("unavailable_codes" <@ ARRAY['source_unavailable','source_timeout','source_invalid']::text[]), CONSTRAINT "youtube_discovery_planning_claim_check" CHECK (("claimed_by" IS NULL AND "claimed_at" IS NULL AND "lease_expires_at" IS NULL AND "fencing_token" IS NULL) OR ("claimed_by" IS NOT NULL AND length(btrim("claimed_by")) BETWEEN 1 AND 160 AND "claimed_at" IS NOT NULL AND "lease_expires_at" > "claimed_at" AND "fencing_token" ~ '^[a-f0-9]{64}$')), CONSTRAINT "youtube_discovery_planning_state_shape_check" CHECK (("state" = 'running' AND "policy_version_id" IS NOT NULL AND "claimed_by" IS NOT NULL AND "terminal_at" IS NULL AND "outcome" IS NULL AND "created_or_refreshed_count" = 0 AND cardinality("unavailable_codes") = 0) OR ("state" = 'queued' AND "claimed_by" IS NULL AND ("outcome" IS NULL OR ("outcome" IN ('completed','unavailable') AND "terminal_at" IS NOT NULL))) OR ("state" = 'completed' AND "claimed_by" IS NULL AND "terminal_at" IS NOT NULL AND "outcome" IN ('completed','unavailable')) OR ("state" = 'cancelled' AND "claimed_by" IS NULL AND "terminal_at" IS NOT NULL AND "outcome" = 'cancelled')));
--> statement-breakpoint
CREATE TABLE "youtube_discovery_planning_outcomes" ("id" text PRIMARY KEY, "planning_id" text NOT NULL REFERENCES "youtube_discovery_planning_leases"("id") ON DELETE RESTRICT, "policy_version_id" text NOT NULL REFERENCES "youtube_discovery_policy_versions"("id") ON DELETE RESTRICT, "outcome" text NOT NULL, "created_or_refreshed_count" integer NOT NULL, "unavailable_codes" text[] NOT NULL DEFAULT '{}', "completed_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "youtube_discovery_planning_outcomes_state_check" CHECK ("outcome" IN ('completed','unavailable','cancelled')), CONSTRAINT "youtube_discovery_planning_outcomes_count_check" CHECK ("created_or_refreshed_count" BETWEEN 0 AND 200), CONSTRAINT "youtube_discovery_planning_outcomes_codes_check" CHECK ("unavailable_codes" <@ ARRAY['source_unavailable','source_timeout','source_invalid']::text[]));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "youtube_discovery_planning_outcomes_planning_idx" ON "youtube_discovery_planning_outcomes" ("planning_id", "completed_at");
--> statement-breakpoint
INSERT INTO "youtube_discovery_planning_leases" ("id", "next_run_at") VALUES ('youtube-discovery-planning', clock_timestamp()) ON CONFLICT DO NOTHING;
