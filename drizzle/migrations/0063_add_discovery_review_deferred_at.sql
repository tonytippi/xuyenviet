ALTER TABLE "youtube_discovery_candidate_review_states" ADD COLUMN "deferred_at" timestamp;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_candidate_review_states" ADD CONSTRAINT "youtube_discovery_candidate_review_states_deferred_at_check" CHECK (("state" = 'deferred') OR "deferred_at" IS NULL);
