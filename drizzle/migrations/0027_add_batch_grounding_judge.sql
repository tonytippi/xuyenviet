ALTER TABLE "knowledge_ingestion_candidates" ADD COLUMN "judge_decision" text;
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" DROP CONSTRAINT "knowledge_ingestion_candidates_outcome_reason_code_check";
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_outcome_reason_code_check" CHECK ("knowledge_ingestion_candidates"."outcome_reason_code" is null or "knowledge_ingestion_candidates"."outcome_reason_code" in ('candidate_terminalized', 'invalid_discovery_candidate', 'candidate_invalid_structure', 'candidate_missing_required_fields', 'candidate_sensitive_content', 'candidate_evidence_mismatch', 'candidate_insufficient_travel_context', 'judge_evidence_not_grounded', 'stale_or_deleted_capture', 'judge_model_unavailable', 'judge_model_not_independent', 'judge_provider_failed', 'relation_provider_failed', 'relation_ambiguous', 'relation_invalid', 'stale_relation_target', 'attach_condition_mismatch', 'conflict_condition_mismatch', 'retry_exhausted'));
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_judge_decision_check" CHECK ("knowledge_ingestion_candidates"."judge_decision" is null or "knowledge_ingestion_candidates"."judge_decision" in ('publish', 'review_recommended', 'verify_first', 'suppress'));
