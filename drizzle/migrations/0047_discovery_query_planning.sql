CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN "target_digest" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN "safe_signal_summary" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN "schedule_anchor_at" timestamp;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD COLUMN "next_due_at" timestamp;
--> statement-breakpoint
-- Clean break: legacy system operator requests are operator-owned requests,
-- not valid system signals under the new bounded four-reason contract.
UPDATE "youtube_discovery_query_proposals" SET "origin" = 'operator', "enabled" = false, "schedule_anchor_at" = NULL, "next_due_at" = NULL WHERE "origin" = 'system' AND "reason" = 'operator_request';
--> statement-breakpoint
-- Remaining system proposals predate safe upstream tuples. Preserve their
-- immutable system origin while assigning a stable legacy identity.
UPDATE "youtube_discovery_query_proposals" SET "target_digest" = encode(digest("reason" || chr(31) || "query_text" || chr(31) || "id", 'sha256'), 'hex'), "safe_signal_summary" = "reason", "schedule_anchor_at" = clock_timestamp(), "next_due_at" = clock_timestamp() + "cadence_minutes" * interval '1 minute' WHERE "origin" = 'system';
--> statement-breakpoint
UPDATE "youtube_discovery_query_proposals" SET "schedule_anchor_at" = CASE WHEN "enabled" THEN clock_timestamp() ELSE NULL END, "next_due_at" = CASE WHEN "enabled" THEN clock_timestamp() + "cadence_minutes" * interval '1 minute' ELSE NULL END WHERE "origin" = 'operator';
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_target_check" CHECK (("origin" = 'system' AND "target_digest" ~ '^[a-f0-9]{64}$' AND "safe_signal_summary" IS NOT NULL AND "safe_signal_summary" IN ('coverage_gap', 'freshness_risk', 'unresolved_conflict', 'anonymized_demand')) OR ("origin" = 'operator' AND "target_digest" IS NULL AND "safe_signal_summary" IS NULL));
--> statement-breakpoint
ALTER TABLE "youtube_discovery_query_proposals" ADD CONSTRAINT "youtube_discovery_query_proposals_schedule_check" CHECK (("schedule_anchor_at" IS NULL AND "next_due_at" IS NULL) OR ("schedule_anchor_at" IS NOT NULL AND ("next_due_at" IS NULL OR "next_due_at" > "schedule_anchor_at")));
--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_system_query_target_idx" ON "youtube_discovery_query_proposals" ("reason", "target_digest") WHERE "origin" = 'system';
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "schedule_interval_at" timestamp;
--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_runs_proposal_interval_idx" ON "youtube_discovery_runs" ("query_proposal_id", "schedule_interval_at") WHERE "query_proposal_id" IS NOT NULL AND "schedule_interval_at" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "youtube_discovery_planning_leases" ("id" text PRIMARY KEY, "policy_version_id" text REFERENCES "youtube_discovery_policy_versions"("id") ON DELETE RESTRICT, "state" text NOT NULL DEFAULT 'queued', "next_run_at" timestamp NOT NULL, "claimed_by" text, "claimed_at" timestamp, "lease_expires_at" timestamp, "fencing_token" text, "terminal_at" timestamp, "outcome" text, "created_or_refreshed_count" integer NOT NULL DEFAULT 0, "unavailable_codes" text[] NOT NULL DEFAULT '{}', "created_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "youtube_discovery_planning_singleton_check" CHECK ("id" = 'youtube-discovery-planning'), CONSTRAINT "youtube_discovery_planning_state_check" CHECK ("state" IN ('queued','running','completed','cancelled')), CONSTRAINT "youtube_discovery_planning_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('completed','unavailable','contended','cancelled')), CONSTRAINT "youtube_discovery_planning_count_check" CHECK ("created_or_refreshed_count" BETWEEN 0 AND 200), CONSTRAINT "youtube_discovery_planning_codes_check" CHECK ("unavailable_codes" <@ ARRAY['source_unavailable','source_timeout','source_invalid']::text[]), CONSTRAINT "youtube_discovery_planning_claim_check" CHECK (("claimed_by" IS NULL AND "claimed_at" IS NULL AND "lease_expires_at" IS NULL AND "fencing_token" IS NULL) OR ("claimed_by" IS NOT NULL AND length(btrim("claimed_by")) BETWEEN 1 AND 160 AND "claimed_at" IS NOT NULL AND "lease_expires_at" > "claimed_at" AND "fencing_token" ~ '^[a-f0-9]{64}$')), CONSTRAINT "youtube_discovery_planning_state_shape_check" CHECK (("state" = 'running' AND "policy_version_id" IS NOT NULL AND "claimed_by" IS NOT NULL AND "terminal_at" IS NULL AND "outcome" IS NULL AND "created_or_refreshed_count" = 0 AND cardinality("unavailable_codes") = 0) OR ("state" = 'queued' AND "claimed_by" IS NULL AND ("outcome" IS NULL OR ("outcome" IN ('completed','unavailable') AND "terminal_at" IS NOT NULL))) OR ("state" = 'completed' AND "claimed_by" IS NULL AND "terminal_at" IS NOT NULL AND "outcome" IN ('completed','unavailable')) OR ("state" = 'cancelled' AND "claimed_by" IS NULL AND "terminal_at" IS NOT NULL AND "outcome" = 'cancelled')));
--> statement-breakpoint
CREATE TABLE "youtube_discovery_planning_outcomes" ("id" text PRIMARY KEY, "planning_id" text NOT NULL REFERENCES "youtube_discovery_planning_leases"("id") ON DELETE RESTRICT, "policy_version_id" text NOT NULL REFERENCES "youtube_discovery_policy_versions"("id") ON DELETE RESTRICT, "outcome" text NOT NULL, "created_or_refreshed_count" integer NOT NULL, "unavailable_codes" text[] NOT NULL DEFAULT '{}', "completed_at" timestamp NOT NULL DEFAULT now(), CONSTRAINT "youtube_discovery_planning_outcomes_state_check" CHECK ("outcome" IN ('completed','unavailable','cancelled')), CONSTRAINT "youtube_discovery_planning_outcomes_count_check" CHECK ("created_or_refreshed_count" BETWEEN 0 AND 200), CONSTRAINT "youtube_discovery_planning_outcomes_codes_check" CHECK ("unavailable_codes" <@ ARRAY['source_unavailable','source_timeout','source_invalid']::text[]));
--> statement-breakpoint
CREATE INDEX "youtube_discovery_planning_outcomes_planning_idx" ON "youtube_discovery_planning_outcomes" ("planning_id", "completed_at");
--> statement-breakpoint
INSERT INTO "youtube_discovery_planning_leases" ("id", "next_run_at") VALUES ('youtube-discovery-planning', clock_timestamp()) ON CONFLICT DO NOTHING;
