DELETE FROM "knowledge_index_dirty_markers" older USING "knowledge_index_dirty_markers" newer WHERE older."knowledge_card_id" = newer."knowledge_card_id" AND older."content_version" = newer."content_version" AND (older."created_at", older."id") < (newer."created_at", newer."id");--> statement-breakpoint
DROP INDEX "knowledge_index_dirty_markers_version_reason_idx";--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD COLUMN "accepted_fence" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "claimed_at" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "lease_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "fencing_token" text;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "next_run_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "completion_reason" text;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_card_version_idx" ON "knowledge_card_search_documents" USING btree ("knowledge_card_id","content_version");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_index_dirty_markers_card_version_idx" ON "knowledge_index_dirty_markers" USING btree ("knowledge_card_id","content_version");--> statement-breakpoint
CREATE INDEX "knowledge_index_dirty_markers_due_work_idx" ON "knowledge_index_dirty_markers" USING btree ("next_run_at","created_at") WHERE "knowledge_index_dirty_markers"."status" in ('pending', 'claimed');--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD CONSTRAINT "knowledge_card_search_documents_content_version_check" CHECK ("knowledge_card_search_documents"."content_version" >= 1);--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD CONSTRAINT "knowledge_card_search_documents_accepted_fence_check" CHECK (length(btrim("knowledge_card_search_documents"."accepted_fence")) between 1 and 128);--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_status_check" CHECK ("knowledge_index_dirty_markers"."status" in ('pending', 'claimed', 'completed', 'failed', 'superseded'));--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_attempts_check" CHECK ("knowledge_index_dirty_markers"."attempt_count" >= 0 and "knowledge_index_dirty_markers"."max_attempts" between 1 and 10 and "knowledge_index_dirty_markers"."attempt_count" <= "knowledge_index_dirty_markers"."max_attempts");--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_fence_check" CHECK ("knowledge_index_dirty_markers"."fencing_token" is null or "knowledge_index_dirty_markers"."fencing_token" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_failure_code_check" CHECK ("knowledge_index_dirty_markers"."failure_code" is null or length(btrim("knowledge_index_dirty_markers"."failure_code")) between 1 and 80);--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_failure_reason_check" CHECK ("knowledge_index_dirty_markers"."failure_reason" is null or length(btrim("knowledge_index_dirty_markers"."failure_reason")) between 1 and 240);
