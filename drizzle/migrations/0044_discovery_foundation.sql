CREATE TABLE "youtube_discovery_policy_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "version" integer NOT NULL,
  "is_current" boolean DEFAULT false NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "minimum_candidate_score" real NOT NULL,
  "priority_score_weight" real NOT NULL,
  "freshness_score_weight" real NOT NULL,
  "cadence_minutes" integer NOT NULL,
  "retention_days" integer NOT NULL,
  "comment_signal_ttl_days" integer NOT NULL,
  "max_concurrent_runs" integer NOT NULL,
  "max_retry_attempts" integer NOT NULL,
  "retry_delay_minutes" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "youtube_discovery_policy_versions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "youtube_discovery_policy_versions_score_check" CHECK ("minimum_candidate_score" >= 0 AND "minimum_candidate_score" <= 1 AND "priority_score_weight" >= 0 AND "priority_score_weight" <= 1 AND "freshness_score_weight" >= 0 AND "freshness_score_weight" <= 1),
  CONSTRAINT "youtube_discovery_policy_versions_cadence_check" CHECK ("cadence_minutes" BETWEEN 15 AND 10080),
  CONSTRAINT "youtube_discovery_policy_versions_retention_check" CHECK ("retention_days" BETWEEN 1 AND 365 AND "comment_signal_ttl_days" BETWEEN 1 AND "retention_days" - 1),
  CONSTRAINT "youtube_discovery_policy_versions_execution_check" CHECK ("max_concurrent_runs" BETWEEN 1 AND 20 AND "max_retry_attempts" BETWEEN 0 AND 10 AND "retry_delay_minutes" BETWEEN 1 AND 1440)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_policy_versions_version_idx" ON "youtube_discovery_policy_versions" ("version");
--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_policy_versions_one_current_idx" ON "youtube_discovery_policy_versions" ("is_current") WHERE "is_current";
--> statement-breakpoint
CREATE FUNCTION "prevent_youtube_discovery_policy_version_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."version" IS DISTINCT FROM NEW."version" OR OLD."enabled" IS DISTINCT FROM NEW."enabled" OR OLD."minimum_candidate_score" IS DISTINCT FROM NEW."minimum_candidate_score" OR OLD."priority_score_weight" IS DISTINCT FROM NEW."priority_score_weight" OR OLD."freshness_score_weight" IS DISTINCT FROM NEW."freshness_score_weight" OR OLD."cadence_minutes" IS DISTINCT FROM NEW."cadence_minutes" OR OLD."retention_days" IS DISTINCT FROM NEW."retention_days" OR OLD."comment_signal_ttl_days" IS DISTINCT FROM NEW."comment_signal_ttl_days" OR OLD."max_concurrent_runs" IS DISTINCT FROM NEW."max_concurrent_runs" OR OLD."max_retry_attempts" IS DISTINCT FROM NEW."max_retry_attempts" OR OLD."retry_delay_minutes" IS DISTINCT FROM NEW."retry_delay_minutes" THEN
    RAISE EXCEPTION 'YouTube Discovery policy version configuration is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "youtube_discovery_policy_versions_immutable"
BEFORE UPDATE OR DELETE ON "youtube_discovery_policy_versions"
FOR EACH ROW EXECUTE FUNCTION "prevent_youtube_discovery_policy_version_change"();
--> statement-breakpoint
CREATE TABLE "youtube_discovery_query_proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "origin" text NOT NULL,
  "reason" text NOT NULL,
  "priority" integer NOT NULL,
  "query_text" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "cadence_minutes" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "youtube_discovery_query_proposals_origin_check" CHECK ("origin" IN ('system', 'operator')),
  CONSTRAINT "youtube_discovery_query_proposals_reason_check" CHECK (length(btrim("reason")) BETWEEN 1 AND 160 AND position(chr(10) IN "reason") = 0 AND position(chr(13) IN "reason") = 0),
  CONSTRAINT "youtube_discovery_query_proposals_priority_check" CHECK ("priority" BETWEEN 1 AND 100),
  CONSTRAINT "youtube_discovery_query_proposals_query_check" CHECK (length(btrim("query_text")) BETWEEN 1 AND 240 AND position(chr(10) IN "query_text") = 0 AND position(chr(13) IN "query_text") = 0),
  CONSTRAINT "youtube_discovery_query_proposals_cadence_check" CHECK ("cadence_minutes" BETWEEN 15 AND 10080)
);
--> statement-breakpoint
CREATE INDEX "youtube_discovery_query_proposals_enabled_cadence_idx" ON "youtube_discovery_query_proposals" ("enabled", "cadence_minutes");
--> statement-breakpoint
CREATE TABLE "youtube_discovery_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "policy_version_id" text NOT NULL REFERENCES "youtube_discovery_policy_versions"("id") ON DELETE RESTRICT,
  "query_proposal_id" text REFERENCES "youtube_discovery_query_proposals"("id") ON DELETE RESTRICT,
  "state" text DEFAULT 'queued' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "youtube_discovery_runs_state_check" CHECK ("state" IN ('queued', 'running', 'retrying', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX "youtube_discovery_runs_state_created_at_idx" ON "youtube_discovery_runs" ("state", "created_at");
--> statement-breakpoint
CREATE INDEX "youtube_discovery_runs_policy_version_idx" ON "youtube_discovery_runs" ("policy_version_id");
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_no_system_executor_id_check";
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_no_system_executor_id_check" CHECK ("id" NOT IN ('system-ai-orchestration', 'system-knowledge-pipeline', 'system-trip-planning', 'system-facebook-capture', 'system-youtube-capture', 'system-admin-bootstrap', 'system-youtube-discovery'));
--> statement-breakpoint
INSERT INTO "youtube_discovery_policy_versions" ("id", "version", "is_current", "enabled", "minimum_candidate_score", "priority_score_weight", "freshness_score_weight", "cadence_minutes", "retention_days", "comment_signal_ttl_days", "max_concurrent_runs", "max_retry_attempts", "retry_delay_minutes")
SELECT 'youtube-discovery-policy-initial', COALESCE(MAX("version"), 0) + 1, true, true, 0.5, 0.6, 0.4, 1440, 180, 30, 1, 3, 15
FROM "youtube_discovery_policy_versions"
HAVING NOT COALESCE(BOOL_OR("is_current"), false);
--> statement-breakpoint
CREATE FUNCTION "enforce_youtube_discovery_current_policy"() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM "youtube_discovery_policy_versions" WHERE "is_current") <> 1 THEN
    RAISE EXCEPTION 'Exactly one YouTube Discovery policy version must be current';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "youtube_discovery_policy_versions_exactly_one_current" AFTER INSERT OR UPDATE OR DELETE ON "youtube_discovery_policy_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_youtube_discovery_current_policy"();
