ALTER TABLE "knowledge_sampling_policies" ADD COLUMN "enrollment_candidate_count" integer;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_policies" ADD COLUMN "enrollment_selected_count" integer;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_policies" ADD COLUMN "enrollment_digest" text;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_policies" ADD COLUMN "enrollment_sealed_at" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD COLUMN "corridor_bucket" text;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD COLUMN "outside_corridor" boolean;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD COLUMN "selected_for_sampling" boolean;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD COLUMN "required_for_sampling" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_policies" ADD CONSTRAINT "knowledge_sampling_policies_enrollment_counts_check" CHECK (("enrollment_candidate_count" is null and "enrollment_selected_count" is null and "enrollment_digest" is null and "enrollment_sealed_at" is null) or ("enrollment_candidate_count" >= 0 and "enrollment_selected_count" >= 0 and "enrollment_selected_count" <= "enrollment_candidate_count" and "enrollment_digest" ~ '^[a-f0-9]{64}$' and "enrollment_sealed_at" is not null));--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD CONSTRAINT "knowledge_sampling_cohort_members_corridor_shape_check" CHECK (("corridor_bucket" is null and "outside_corridor" is null) or ("corridor_bucket" is not null and "outside_corridor" = false) or ("corridor_bucket" is null and "outside_corridor" = true));--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_required_sampling_check" CHECK ("required_for_sampling" = false or "reason" = 'sampling');--> statement-breakpoint
CREATE TABLE "knowledge_sampling_candidate_ledger" (
  "id" text PRIMARY KEY NOT NULL,
  "terminal_ingestion_job_id" text NOT NULL REFERENCES "knowledge_ingestion_jobs"("id") ON DELETE restrict,
  "policy_id" text NOT NULL REFERENCES "knowledge_sampling_policies"("id") ON DELETE cascade,
  "knowledge_card_id" text NOT NULL REFERENCES "knowledge_cards"("id") ON DELETE cascade,
  "content_version" integer NOT NULL,
  "evidence_set_revision" integer NOT NULL,
  "corridor_bucket" text NOT NULL,
  "outside_corridor" boolean NOT NULL,
  "selected_for_sampling" boolean NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_sampling_candidate_ledger_versions_check" CHECK ("content_version" >= 1 and "evidence_set_revision" >= 1),
  CONSTRAINT "knowledge_sampling_candidate_ledger_corridor_shape_check" CHECK (("corridor_bucket" <> '' and "outside_corridor" = false) or ("corridor_bucket" = '' and "outside_corridor" = true))
);--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_candidate_ledger_terminal_fence_idx" ON "knowledge_sampling_candidate_ledger" USING btree ("terminal_ingestion_job_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_candidate_ledger_policy_fence_idx" ON "knowledge_sampling_candidate_ledger" USING btree ("policy_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE INDEX "knowledge_sampling_candidate_ledger_policy_idx" ON "knowledge_sampling_candidate_ledger" USING btree ("policy_id");--> statement-breakpoint
CREATE TABLE "knowledge_verify_first_sampling_obligations" (
  "id" text PRIMARY KEY NOT NULL,
  "terminal_ingestion_job_id" text NOT NULL REFERENCES "knowledge_ingestion_jobs"("id") ON DELETE restrict,
  "policy_id" text NOT NULL REFERENCES "knowledge_sampling_policies"("id") ON DELETE restrict,
  "knowledge_card_id" text NOT NULL REFERENCES "knowledge_cards"("id") ON DELETE cascade,
  "content_version" integer NOT NULL,
  "evidence_set_revision" integer NOT NULL,
  "corridor_bucket" text NOT NULL,
  "outside_corridor" boolean NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_verify_first_sampling_obligations_versions_check" CHECK ("content_version" >= 1 and "evidence_set_revision" >= 1),
  CONSTRAINT "knowledge_verify_first_sampling_obligations_corridor_shape_check" CHECK (("corridor_bucket" <> '' and "outside_corridor" = false) or ("corridor_bucket" = '' and "outside_corridor" = true))
);--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_verify_first_sampling_obligations_terminal_fence_idx" ON "knowledge_verify_first_sampling_obligations" USING btree ("terminal_ingestion_job_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_verify_first_sampling_obligations_policy_fence_idx" ON "knowledge_verify_first_sampling_obligations" USING btree ("policy_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE INDEX "knowledge_verify_first_sampling_obligations_policy_idx" ON "knowledge_verify_first_sampling_obligations" USING btree ("policy_id");
