DROP TABLE IF EXISTS "knowledge_sampling_candidate_ledger" CASCADE;
DROP TABLE IF EXISTS "knowledge_verify_first_sampling_obligations" CASCADE;
DROP TABLE IF EXISTS "knowledge_card_state_migration_reports" CASCADE;
DROP TABLE IF EXISTS "knowledge_evidence_backfill_reports" CASCADE;

ALTER TABLE "knowledge_cards"
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "publication_state",
  DROP COLUMN IF EXISTS "review_state",
  DROP COLUMN IF EXISTS "verification_state",
  DROP COLUMN IF EXISTS "needs_review",
  ADD COLUMN "lifecycle_state" text NOT NULL DEFAULT 'draft',
  ADD COLUMN "verification_requirement" text NOT NULL DEFAULT 'none';
ALTER TABLE "knowledge_cards" DROP CONSTRAINT IF EXISTS "knowledge_cards_knowledge_state_check";
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_lifecycle_state_check" CHECK ("lifecycle_state" in ('draft', 'pending_operator', 'active', 'suppressed', 'archived', 'rejected'));
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_knowledge_state_check" CHECK ("knowledge_state" in ('community_observation', 'community_pattern', 'conditional', 'conflicted'));
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_verification_requirement_check" CHECK ("verification_requirement" in ('none', 'operator_required', 'failed'));
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_active_verification_check" CHECK ("lifecycle_state" <> 'active' OR "verification_requirement" = 'none');

ALTER TABLE "knowledge_ingestion_jobs"
  DROP COLUMN IF EXISTS "stage",
  DROP COLUMN IF EXISTS "protocol_version",
  DROP COLUMN IF EXISTS "raw_discovery_response",
  DROP COLUMN IF EXISTS "discovered_candidate_count",
  DROP COLUMN IF EXISTS "terminal_candidate_count",
  DROP COLUMN IF EXISTS "published_candidate_count",
  DROP COLUMN IF EXISTS "suppressed_candidate_count",
  DROP COLUMN IF EXISTS "review_recommended_candidate_count",
  DROP COLUMN IF EXISTS "verify_first_candidate_count",
  DROP COLUMN IF EXISTS "invalid_candidate_count",
  DROP COLUMN IF EXISTS "stage_version",
  ADD COLUMN "status" text NOT NULL DEFAULT 'queued',
  ADD COLUMN "discovery_terminal" boolean NOT NULL DEFAULT false,
  ADD COLUMN "candidate_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "completed_candidate_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "needs_operator_candidate_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "knowledge_ingestion_jobs" DROP CONSTRAINT IF EXISTS "knowledge_ingestion_jobs_stage_check";
ALTER TABLE "knowledge_ingestion_jobs" DROP CONSTRAINT IF EXISTS "knowledge_ingestion_jobs_terminal_claim_check";
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_status_check" CHECK ("status" in ('queued', 'running', 'completed', 'failed'));
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_candidate_counts_check" CHECK ("candidate_count" >= 0 AND "completed_candidate_count" >= 0 AND "completed_candidate_count" <= "candidate_count" AND "failed_candidate_count" >= 0 AND "failed_candidate_count" <= "candidate_count" AND "needs_operator_candidate_count" >= 0 AND "needs_operator_candidate_count" <= "completed_candidate_count");
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_terminal_claim_check" CHECK ("status" not in ('completed', 'failed') OR ("claimed_by" is null AND "claimed_at" is null AND "lease_expires_at" is null AND "fencing_token" is null));

ALTER TABLE "knowledge_ingestion_candidates"
  DROP COLUMN IF EXISTS "stage",
  DROP COLUMN IF EXISTS "stage_version",
  DROP COLUMN IF EXISTS "judge_decision",
  ADD COLUMN "processing_status" text NOT NULL DEFAULT 'queued',
  ADD COLUMN "ai_disposition" text;
ALTER TABLE "knowledge_ingestion_candidates" DROP CONSTRAINT IF EXISTS "knowledge_ingestion_candidates_stage_check";
ALTER TABLE "knowledge_ingestion_candidates" DROP CONSTRAINT IF EXISTS "knowledge_ingestion_candidates_outcome_reason_code_check";
ALTER TABLE "knowledge_ingestion_candidates" DROP CONSTRAINT IF EXISTS "knowledge_ingestion_candidates_judge_decision_check";
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_processing_status_check" CHECK ("processing_status" in ('queued', 'processing', 'completed', 'failed'));
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_decision_shape_check" CHECK (("processing_status" = 'completed' AND "ai_disposition" is not null AND "ai_disposition" in ('apply', 'needs_operator', 'discard') AND "outcome_reason_code" is not null AND "outcome_reason_code" in ('applied', 'verification_required', 'weak_evidence', 'relation_ambiguous', 'missing_context', 'conflict', 'stale_capture', 'policy_rejected') AND length(btrim("outcome_reason_code")) > 0) OR ("processing_status" in ('queued', 'processing', 'failed') AND "ai_disposition" is null AND "outcome_reason_code" is null));

ALTER TABLE "knowledge_recommendations"
  DROP COLUMN IF EXISTS "reason",
  DROP COLUMN IF EXISTS "required_for_sampling",
  DROP COLUMN IF EXISTS "sampling_disposition_reason",
  DROP COLUMN IF EXISTS "sampling_rationale",
  ADD COLUMN "work_type" text NOT NULL DEFAULT 'verification';
ALTER TABLE "knowledge_recommendations" DROP CONSTRAINT IF EXISTS "knowledge_recommendations_status_check";
ALTER TABLE "knowledge_recommendations" DROP CONSTRAINT IF EXISTS "knowledge_recommendations_reason_check";
ALTER TABLE "knowledge_recommendations" DROP CONSTRAINT IF EXISTS "knowledge_recommendations_resolution_check";
ALTER TABLE "knowledge_recommendations" DROP CONSTRAINT IF EXISTS "knowledge_recommendations_resolved_shape_check";
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_status_check" CHECK ("status" in ('open', 'resolved', 'superseded'));
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_work_type_check" CHECK ("work_type" in ('verification', 'relation', 'risk', 'missing_context', 'sampling'));
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_resolution_check" CHECK ("resolution" is null OR "resolution" in ('published_operator_confirmed', 'published_community_observation', 'suppressed', 'edited_and_requeued', 'relation_resolved', 'sampling_passed', 'sampling_failed'));
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_resolved_shape_check" CHECK (("status" = 'open' AND "resolution" is null AND "resolved_by_user_id" is null AND "resolved_at" is null) OR ("status" in ('resolved', 'superseded') AND "resolution" is not null AND "resolved_at" is not null));
DROP INDEX IF EXISTS "knowledge_recommendations_open_version_reason_idx";
DROP INDEX IF EXISTS "knowledge_recommendations_open_queue_idx";
CREATE UNIQUE INDEX "knowledge_open_operator_work_per_version" ON "knowledge_recommendations" ("knowledge_card_id", "content_version", "evidence_set_revision", "work_type") WHERE "status" = 'open';
CREATE UNIQUE INDEX "knowledge_open_primary_work_per_card_version" ON "knowledge_recommendations" ("knowledge_card_id", "content_version", "evidence_set_revision") WHERE "status" = 'open' AND "work_type" in ('verification', 'relation', 'risk', 'missing_context');
CREATE INDEX "knowledge_recommendations_open_queue_idx" ON "knowledge_recommendations" ("status", "priority", "created_at") WHERE "status" = 'open';

CREATE TABLE "knowledge_sampling_obligations" (
  "id" text PRIMARY KEY NOT NULL,
  "candidate_id" text NOT NULL REFERENCES "knowledge_ingestion_candidates"("id") ON DELETE RESTRICT,
  "knowledge_card_id" text REFERENCES "knowledge_cards"("id") ON DELETE RESTRICT,
  "content_version" integer NOT NULL,
  "evidence_set_revision" integer NOT NULL,
  "sampling_disposition" text,
  "sampled_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "knowledge_sampling_obligations_versions_check" CHECK ("content_version" >= 1 AND "evidence_set_revision" >= 1),
  CONSTRAINT "knowledge_sampling_obligations_disposition_shape_check" CHECK (("sampling_disposition" is null AND "sampled_at" is null) OR ("sampling_disposition" in ('sampling_passed', 'sampling_failed') AND "sampled_at" is not null))
);
CREATE UNIQUE INDEX "knowledge_sampling_obligations_candidate_fence_idx" ON "knowledge_sampling_obligations" ("candidate_id", "content_version", "evidence_set_revision");

CREATE OR REPLACE FUNCTION "prevent_completed_candidate_decision_change"() RETURNS trigger AS $$
BEGIN
  IF OLD.processing_status = 'completed' AND (NEW.ai_disposition IS DISTINCT FROM OLD.ai_disposition OR NEW.outcome_reason_code IS DISTINCT FROM OLD.outcome_reason_code) THEN
    RAISE EXCEPTION 'Completed candidate AI decision is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "knowledge_ingestion_candidates_completed_decision_immutable"
BEFORE UPDATE ON "knowledge_ingestion_candidates"
FOR EACH ROW EXECUTE FUNCTION "prevent_completed_candidate_decision_change"();
