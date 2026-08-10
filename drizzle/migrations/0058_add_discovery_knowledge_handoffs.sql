CREATE TABLE "knowledge_one_url_handoffs" (
  "reference" text PRIMARY KEY NOT NULL,
  "canonical_url" text NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "outcome" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "knowledge_one_url_handoffs" ADD CONSTRAINT "knowledge_one_url_handoffs_reference_check" CHECK (length(btrim("knowledge_one_url_handoffs"."reference")) between 1 and 128);
--> statement-breakpoint
ALTER TABLE "knowledge_one_url_handoffs" ADD CONSTRAINT "knowledge_one_url_handoffs_url_check" CHECK ("knowledge_one_url_handoffs"."canonical_url" ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{6,20}$');
--> statement-breakpoint
ALTER TABLE "knowledge_one_url_handoffs" ADD CONSTRAINT "knowledge_one_url_handoffs_outcome_check" CHECK ("knowledge_one_url_handoffs"."outcome" is null or "knowledge_one_url_handoffs"."outcome" in ('submitted', 'duplicate', 'failed'));
--> statement-breakpoint
ALTER TABLE "knowledge_one_url_handoffs" ADD CONSTRAINT "knowledge_one_url_handoffs_completion_check" CHECK (("knowledge_one_url_handoffs"."outcome" is null and "knowledge_one_url_handoffs"."completed_at" is null) or ("knowledge_one_url_handoffs"."outcome" is not null and "knowledge_one_url_handoffs"."completed_at" is not null));
--> statement-breakpoint
CREATE TABLE "youtube_discovery_knowledge_handoffs" (
  "candidate_id" text PRIMARY KEY NOT NULL REFERENCES "youtube_discovery_candidates"("id") ON DELETE RESTRICT,
  "recommendation_id" text NOT NULL,
  "reference" text NOT NULL,
  "actor_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reconciling" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "youtube_discovery_knowledge_handoffs_recommendation_candidate_fk" FOREIGN KEY ("recommendation_id", "candidate_id") REFERENCES "youtube_discovery_recommendations"("id", "candidate_id") ON DELETE RESTRICT,
  CONSTRAINT "youtube_discovery_knowledge_handoffs_reference_check" CHECK (length(btrim("reference")) between 1 and 128)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_knowledge_handoffs_reference_idx" ON "youtube_discovery_knowledge_handoffs" USING btree ("reference");
