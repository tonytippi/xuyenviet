CREATE TABLE "knowledge_ingestion_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"capture_version_id" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"submitted_by_email" text NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"stage_version" integer DEFAULT 1 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"last_error_code" text,
	"requeue_reason_code" text,
	"claimed_by" text,
	"claimed_at" timestamp,
	"lease_expires_at" timestamp,
	"fencing_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_ingestion_jobs_stage_check" CHECK ("knowledge_ingestion_jobs"."stage" in ('queued', 'triaging', 'extracting', 'judging', 'relating', 'published', 'suppressed', 'review_recommended', 'verify_first', 'failed')),
	CONSTRAINT "knowledge_ingestion_jobs_stage_version_check" CHECK ("knowledge_ingestion_jobs"."stage_version" >= 1),
	CONSTRAINT "knowledge_ingestion_jobs_attempt_count_check" CHECK ("knowledge_ingestion_jobs"."attempt_count" >= 0 and "knowledge_ingestion_jobs"."attempt_count" <= "knowledge_ingestion_jobs"."max_attempts"),
	CONSTRAINT "knowledge_ingestion_jobs_max_attempts_check" CHECK ("knowledge_ingestion_jobs"."max_attempts" between 1 and 10),
	CONSTRAINT "knowledge_ingestion_jobs_submitter_email_check" CHECK (length(btrim("knowledge_ingestion_jobs"."submitted_by_email")) between 1 and 320),
	CONSTRAINT "knowledge_ingestion_jobs_error_code_check" CHECK ("knowledge_ingestion_jobs"."last_error_code" is null or "knowledge_ingestion_jobs"."last_error_code" ~ '^[a-z0-9_:-]{1,120}$'),
	CONSTRAINT "knowledge_ingestion_jobs_requeue_reason_code_check" CHECK ("knowledge_ingestion_jobs"."requeue_reason_code" is null or "knowledge_ingestion_jobs"."requeue_reason_code" ~ '^[a-z0-9_:-]{1,120}$'),
	CONSTRAINT "knowledge_ingestion_jobs_claim_shape_check" CHECK (("knowledge_ingestion_jobs"."claimed_by" is null and "knowledge_ingestion_jobs"."claimed_at" is null and "knowledge_ingestion_jobs"."lease_expires_at" is null and "knowledge_ingestion_jobs"."fencing_token" is null) or ("knowledge_ingestion_jobs"."claimed_by" is not null and length(btrim("knowledge_ingestion_jobs"."claimed_by")) between 1 and 160 and "knowledge_ingestion_jobs"."claimed_at" is not null and "knowledge_ingestion_jobs"."lease_expires_at" > "knowledge_ingestion_jobs"."claimed_at" and "knowledge_ingestion_jobs"."fencing_token" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "knowledge_ingestion_jobs_terminal_claim_check" CHECK ("knowledge_ingestion_jobs"."stage" not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed') or ("knowledge_ingestion_jobs"."claimed_by" is null and "knowledge_ingestion_jobs"."claimed_at" is null and "knowledge_ingestion_jobs"."lease_expires_at" is null and "knowledge_ingestion_jobs"."fencing_token" is null))
);
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_capture_version_source_fk" FOREIGN KEY ("capture_version_id","source_id") REFERENCES "public"."source_capture_versions"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_ingestion_jobs_capture_version_id_idx" ON "knowledge_ingestion_jobs" USING btree ("capture_version_id");--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_jobs_claim_queue_idx" ON "knowledge_ingestion_jobs" USING btree ("stage","next_run_at","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_jobs_lease_expiry_idx" ON "knowledge_ingestion_jobs" USING btree ("lease_expires_at") WHERE "knowledge_ingestion_jobs"."lease_expires_at" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_jobs_source_id_idx" ON "knowledge_ingestion_jobs" USING btree ("source_id");
--> statement-breakpoint
-- Only readable, retained immutable versions receive new canonical work. Legacy jobs/cards do not imply pipeline completion.
INSERT INTO "knowledge_ingestion_jobs" (
  "id", "source_id", "capture_version_id", "submitted_by_user_id", "submitted_by_email",
  "stage", "stage_version", "attempt_count", "max_attempts", "next_run_at", "created_at", "updated_at"
)
SELECT
  md5('knowledge-ingestion-job:' || capture."id"),
  capture."source_id",
  capture."id",
  source."submitted_by_user_id",
  submitter."email",
  'queued', 1, 0, 3, timezone('UTC', now()), now(), now()
FROM "source_capture_versions" capture
JOIN "sources" source ON source."id" = capture."source_id"
JOIN "users" submitter ON submitter."id" = source."submitted_by_user_id"
WHERE capture."payload_deleted_at" IS NULL
  AND capture."raw_text" IS NOT NULL
   AND length(btrim(capture."raw_text")) > 0
   AND length(btrim(submitter."email")) BETWEEN 1 AND 320
ON CONFLICT ("capture_version_id") DO NOTHING;
