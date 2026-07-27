-- Story 8.3 attribution is an authorized disposable clean break. These derived
-- and operational rows are recreated from source and pipeline work after reset.
DELETE FROM "knowledge_card_search_documents";--> statement-breakpoint
DELETE FROM "knowledge_index_dirty_markers";--> statement-breakpoint
DELETE FROM "knowledge_recommendations";--> statement-breakpoint
DELETE FROM "knowledge_source_suggestions";--> statement-breakpoint
DELETE FROM "knowledge_sampling_candidate_ledger";--> statement-breakpoint
DELETE FROM "knowledge_verify_first_sampling_obligations";--> statement-breakpoint
DELETE FROM "knowledge_sampling_cohort_members";--> statement-breakpoint
DELETE FROM "knowledge_card_evidence";--> statement-breakpoint
DELETE FROM "knowledge_card_sources";--> statement-breakpoint
DELETE FROM "knowledge_ingestion_candidates";--> statement-breakpoint
DELETE FROM "knowledge_ingestion_jobs";--> statement-breakpoint
DELETE FROM "knowledge_extraction_jobs";--> statement-breakpoint
DELETE FROM "facebook_capture_reviews";--> statement-breakpoint
UPDATE "sources" SET "current_capture_version_id" = NULL WHERE "current_capture_version_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "source_capture_versions";--> statement-breakpoint
DELETE FROM "knowledge_cards";--> statement-breakpoint

ALTER TABLE "source_capture_versions" ADD COLUMN "executor_system" text;--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD COLUMN "executor_system" text;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "executor_system" text;--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD COLUMN "executor_system" text;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD COLUMN "executor_system" text;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "executor_system" text;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD COLUMN "executor_system" text;--> statement-breakpoint

ALTER TABLE "facebook_capture_reviews" DROP CONSTRAINT "facebook_capture_reviews_reviewer_shape_check";--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" DROP CONSTRAINT "knowledge_recommendations_resolved_shape_check";--> statement-breakpoint
ALTER TABLE "source_capture_versions" ADD CONSTRAINT "source_capture_versions_executor_system_check" CHECK ("executor_system" is null or length(btrim("executor_system")) between 1 and 160);--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_executor_system_check" CHECK ("executor_system" is null or length(btrim("executor_system")) between 1 and 160);--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_reviewer_shape_check" CHECK ("status" = 'needs_review' or ("reviewer_user_id" is not null and "executor_system" is null and "reviewed_at" is not null) or ("reviewer_user_id" is null and "executor_system" is not null and length(btrim("executor_system")) between 1 and 160 and "reviewed_at" is not null));--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_executor_shape_check" CHECK ("created_by_user_id" is not null or ("executor_system" is not null and length(btrim("executor_system")) between 1 and 160));--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD CONSTRAINT "knowledge_card_search_documents_executor_system_check" CHECK ("executor_system" is not null and length(btrim("executor_system")) between 1 and 160);--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_executor_system_check" CHECK ("executor_system" is null or length(btrim("executor_system")) between 1 and 160);--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_resolved_shape_check" CHECK (("status" in ('open', 'in_review') and "resolution" is null and "resolved_by_user_id" is null and "resolved_at" is null) or ("status" in ('resolved', 'superseded') and "resolution" is not null and "resolved_by_user_id" is not null and "executor_system" is null and "resolved_at" is not null) or ("status" = 'superseded' and "resolution" is not null and "resolved_by_user_id" is null and "executor_system" is not null and length(btrim("executor_system")) between 1 and 160 and "resolved_at" is not null));--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_executor_system_check" CHECK ("executor_system" is null or length(btrim("executor_system")) between 1 and 160);--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_claim_shape_check" CHECK (("claimed_by" is null and "claimed_at" is null and "lease_expires_at" is null and "fencing_token" is null) or ("claimed_by" is not null and length(btrim("claimed_by")) between 1 and 160 and "claimed_at" is not null and "lease_expires_at" is not null and "fencing_token" is not null and "fencing_token" ~ '^[a-f0-9]{64}$'));--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_executor_shape_check" CHECK ("created_by_user_id" is not null or ("executor_system" is not null and length(btrim("executor_system")) between 1 and 160));--> statement-breakpoint

CREATE INDEX "source_capture_versions_executor_system_captured_at_idx" ON "source_capture_versions" USING btree ("executor_system","captured_at");--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_executor_system_updated_at_idx" ON "facebook_capture_reviews" USING btree ("executor_system","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_cards_executor_system_updated_at_idx" ON "knowledge_cards" USING btree ("executor_system","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_executor_system_updated_at_idx" ON "knowledge_card_search_documents" USING btree ("executor_system","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_executor_system_created_at_idx" ON "knowledge_recommendations" USING btree ("executor_system","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_index_dirty_markers_executor_system_created_at_idx" ON "knowledge_index_dirty_markers" USING btree ("executor_system","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_executor_system_created_at_idx" ON "knowledge_source_suggestions" USING btree ("executor_system","created_at");
