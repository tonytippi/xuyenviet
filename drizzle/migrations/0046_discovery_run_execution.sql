ALTER TABLE "youtube_discovery_runs" ADD COLUMN "next_run_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "claimed_by" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "claimed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "lease_expires_at" timestamp;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "fencing_token" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "max_retry_attempts" integer;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "retry_delay_minutes" integer;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "max_concurrent_runs" integer;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "terminal_at" timestamp;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "terminal_outcome" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "safe_error_code" text;
--> statement-breakpoint
UPDATE "youtube_discovery_runs" run SET "max_retry_attempts" = policy."max_retry_attempts", "retry_delay_minutes" = policy."retry_delay_minutes", "max_concurrent_runs" = policy."max_concurrent_runs" FROM "youtube_discovery_policy_versions" policy WHERE policy."id" = run."policy_version_id";
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ALTER COLUMN "max_retry_attempts" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ALTER COLUMN "retry_delay_minutes" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ALTER COLUMN "max_concurrent_runs" SET NOT NULL;
--> statement-breakpoint
CREATE INDEX "youtube_discovery_runs_claim_queue_idx" ON "youtube_discovery_runs" ("state", "next_run_at", "created_at");
--> statement-breakpoint
CREATE INDEX "youtube_discovery_runs_lease_expiry_idx" ON "youtube_discovery_runs" ("lease_expires_at") WHERE "lease_expires_at" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD CONSTRAINT "youtube_discovery_runs_snapshots_check" CHECK ("max_retry_attempts" BETWEEN 0 AND 10 AND "retry_delay_minutes" BETWEEN 1 AND 1440 AND "max_concurrent_runs" BETWEEN 1 AND 20 AND "attempt_count" BETWEEN 0 AND "max_retry_attempts" + 1);
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD CONSTRAINT "youtube_discovery_runs_error_code_check" CHECK ("safe_error_code" IS NULL OR "safe_error_code" IN ('stage_transient', 'retry_exhausted', 'lease_retry_exhausted', 'policy_revoked'));
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD CONSTRAINT "youtube_discovery_runs_claim_shape_check" CHECK (("claimed_by" IS NULL AND "claimed_at" IS NULL AND "lease_expires_at" IS NULL AND "fencing_token" IS NULL) OR ("claimed_by" IS NOT NULL AND length(btrim("claimed_by")) BETWEEN 1 AND 160 AND "claimed_at" IS NOT NULL AND "lease_expires_at" > "claimed_at" AND "fencing_token" ~ '^[a-f0-9]{64}$'));
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD CONSTRAINT "youtube_discovery_runs_state_shape_check" CHECK (("state" = 'queued' AND "claimed_by" IS NULL AND "terminal_at" IS NULL AND "terminal_outcome" IS NULL AND "safe_error_code" IS NULL) OR ("state" = 'running' AND "claimed_by" IS NOT NULL AND "terminal_at" IS NULL AND "terminal_outcome" IS NULL AND "safe_error_code" IS NULL) OR ("state" = 'retrying' AND "claimed_by" IS NULL AND "next_run_at" > "created_at" AND "terminal_at" IS NULL AND "terminal_outcome" IS NULL AND "safe_error_code" = 'stage_transient') OR ("state" IN ('completed', 'failed', 'cancelled') AND "claimed_by" IS NULL AND "terminal_at" IS NOT NULL AND "terminal_outcome" = "state" AND ("state" <> 'failed' OR "safe_error_code" IN ('retry_exhausted', 'lease_retry_exhausted')) AND ("state" <> 'cancelled' OR "safe_error_code" = 'policy_revoked') AND ("state" <> 'completed' OR "safe_error_code" IS NULL)));
--> statement-breakpoint
CREATE FUNCTION "prevent_youtube_discovery_run_snapshot_change"() RETURNS trigger AS $$
BEGIN
  IF OLD."policy_version_id" IS DISTINCT FROM NEW."policy_version_id" OR OLD."max_retry_attempts" IS DISTINCT FROM NEW."max_retry_attempts" OR OLD."retry_delay_minutes" IS DISTINCT FROM NEW."retry_delay_minutes" OR OLD."max_concurrent_runs" IS DISTINCT FROM NEW."max_concurrent_runs" THEN
    RAISE EXCEPTION 'YouTube Discovery run snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "youtube_discovery_runs_snapshots_immutable" BEFORE UPDATE ON "youtube_discovery_runs" FOR EACH ROW EXECUTE FUNCTION "prevent_youtube_discovery_run_snapshot_change"();
--> statement-breakpoint
CREATE FUNCTION "prevent_youtube_discovery_run_terminal_change"() RETURNS trigger AS $$
BEGIN
  IF OLD."state" IN ('completed', 'failed', 'cancelled') AND OLD IS DISTINCT FROM NEW THEN
    RAISE EXCEPTION 'YouTube Discovery terminal runs are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "youtube_discovery_runs_terminal_immutable" BEFORE UPDATE ON "youtube_discovery_runs" FOR EACH ROW EXECUTE FUNCTION "prevent_youtube_discovery_run_terminal_change"();
