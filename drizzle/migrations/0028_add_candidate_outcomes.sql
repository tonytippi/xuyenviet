ALTER TABLE "knowledge_ingestion_candidates" DROP CONSTRAINT "knowledge_ingestion_candidates_outcome_reason_code_check";
--> statement-breakpoint
UPDATE "knowledge_ingestion_candidates"
SET "outcome_reason_code" = CASE
  WHEN "stage" = 'suppressed' AND "judge_decision" = 'suppress' THEN 'judge_suppressed'
  WHEN "stage" = 'suppressed' THEN 'judge_below_quality_threshold'
  ELSE NULL
END
WHERE "outcome_reason_code" = 'candidate_terminalized';
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_outcome_reason_code_check" CHECK ("knowledge_ingestion_candidates"."outcome_reason_code" is null or "knowledge_ingestion_candidates"."outcome_reason_code" in ('invalid_discovery_candidate', 'candidate_invalid_structure', 'candidate_missing_required_fields', 'candidate_sensitive_content', 'candidate_evidence_mismatch', 'candidate_insufficient_travel_context', 'judge_evidence_not_grounded', 'judge_suppressed', 'judge_below_quality_threshold', 'stale_or_deleted_capture', 'judge_model_unavailable', 'judge_model_not_independent', 'judge_provider_failed', 'relation_provider_failed', 'relation_ambiguous', 'relation_invalid', 'stale_relation_target', 'attach_condition_mismatch', 'conflict_condition_mismatch', 'retry_exhausted'));
