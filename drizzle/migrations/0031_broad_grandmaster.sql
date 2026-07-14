CREATE TABLE "knowledge_extraction_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"facebook_capture_review_id" text,
	"mode" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"locked_by" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_error_code" text,
	"last_error_message" text,
	"result_draft_ids" jsonb,
	"result_draft_count" integer,
	"created_by_user_id" text NOT NULL,
	"created_by_email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_extraction_jobs_mode_check" CHECK ("knowledge_extraction_jobs"."mode" in ('extract_only', 'extract_and_approve_all')),
	CONSTRAINT "knowledge_extraction_jobs_status_check" CHECK ("knowledge_extraction_jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "knowledge_extraction_jobs_attempt_count_check" CHECK ("knowledge_extraction_jobs"."attempt_count" >= 0 and "knowledge_extraction_jobs"."attempt_count" <= "knowledge_extraction_jobs"."max_attempts"),
	CONSTRAINT "knowledge_extraction_jobs_max_attempts_check" CHECK ("knowledge_extraction_jobs"."max_attempts" between 1 and 10),
	CONSTRAINT "knowledge_extraction_jobs_lock_shape_check" CHECK (("knowledge_extraction_jobs"."status" <> 'running') or ("knowledge_extraction_jobs"."locked_at" is not null and "knowledge_extraction_jobs"."locked_by" is not null and "knowledge_extraction_jobs"."started_at" is not null)),
	CONSTRAINT "knowledge_extraction_jobs_finished_shape_check" CHECK ("knowledge_extraction_jobs"."status" not in ('succeeded', 'failed', 'cancelled') or "knowledge_extraction_jobs"."finished_at" is not null),
	CONSTRAINT "knowledge_extraction_jobs_error_message_check" CHECK ("knowledge_extraction_jobs"."last_error_message" is null or (length(btrim("knowledge_extraction_jobs"."last_error_message")) between 1 and 500 and position(chr(10) in "knowledge_extraction_jobs"."last_error_message") = 0 and position(chr(13) in "knowledge_extraction_jobs"."last_error_message") = 0)),
	CONSTRAINT "knowledge_extraction_jobs_result_draft_ids_check" CHECK ("knowledge_extraction_jobs"."result_draft_ids" is null or jsonb_typeof("knowledge_extraction_jobs"."result_draft_ids") = 'array'),
	CONSTRAINT "knowledge_extraction_jobs_result_draft_count_check" CHECK ("knowledge_extraction_jobs"."result_draft_count" is null or "knowledge_extraction_jobs"."result_draft_count" >= 0),
	CONSTRAINT "knowledge_extraction_jobs_created_by_email_check" CHECK (length(btrim("knowledge_extraction_jobs"."created_by_email")) > 0 and char_length("knowledge_extraction_jobs"."created_by_email") <= 320)
);
--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_facebook_capture_review_id_facebook_capture_reviews_id_fk" FOREIGN KEY ("facebook_capture_review_id") REFERENCES "public"."facebook_capture_reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_queue_idx" ON "knowledge_extraction_jobs" USING btree ("status","next_run_at","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_source_status_idx" ON "knowledge_extraction_jobs" USING btree ("source_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_review_status_idx" ON "knowledge_extraction_jobs" USING btree ("facebook_capture_review_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_stale_running_idx" ON "knowledge_extraction_jobs" USING btree ("status","locked_at");