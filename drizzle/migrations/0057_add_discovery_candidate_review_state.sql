CREATE UNIQUE INDEX "youtube_discovery_recommendations_id_candidate_idx" ON "youtube_discovery_recommendations" ("id", "candidate_id");--> statement-breakpoint
CREATE TABLE "youtube_discovery_candidate_review_states" (
  "candidate_id" text PRIMARY KEY NOT NULL REFERENCES "youtube_discovery_candidates"("id") ON DELETE restrict,
  "recommendation_id" text NOT NULL,
  "state" text NOT NULL DEFAULT 'pending',
  CONSTRAINT "youtube_discovery_candidate_review_states_recommendation_candidate_fk" FOREIGN KEY ("recommendation_id", "candidate_id") REFERENCES "youtube_discovery_recommendations"("id", "candidate_id") ON DELETE restrict,
  CONSTRAINT "youtube_discovery_candidate_review_states_state_check" CHECK ("state" in ('pending', 'accepted', 'deferred', 'skipped'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_candidate_review_states_recommendation_idx" ON "youtube_discovery_candidate_review_states" ("recommendation_id");--> statement-breakpoint
CREATE INDEX "youtube_discovery_candidate_review_states_pending_idx" ON "youtube_discovery_candidate_review_states" ("state", "recommendation_id") WHERE "state" = 'pending';--> statement-breakpoint
-- Retain qualifying rows committed by a pre-19.3 worker while this migration rolls out.
CREATE OR REPLACE FUNCTION youtube_discovery_create_review_state() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW."recommendation" = 'consider' AND EXISTS (SELECT 1 FROM "youtube_discovery_runs" WHERE "id" = NEW."run_id" AND "policy_version_id" = NEW."policy_version_id" AND "query_proposal_id" IS NOT NULL) THEN
    INSERT INTO "youtube_discovery_candidate_review_states" ("candidate_id", "recommendation_id", "state") VALUES (NEW."candidate_id", NEW."id", 'pending') ON CONFLICT ("candidate_id") DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;--> statement-breakpoint
CREATE TRIGGER "youtube_discovery_recommendation_review_state" AFTER INSERT ON "youtube_discovery_recommendations" FOR EACH ROW EXECUTE FUNCTION youtube_discovery_create_review_state();--> statement-breakpoint
-- This one-time backfill chooses each candidate's newest qualifying immutable
-- recommendation. Runtime review admission always uses this durable association.
INSERT INTO "youtube_discovery_candidate_review_states" ("candidate_id", "recommendation_id", "state")
SELECT "candidate_id", "id", 'pending'
FROM (
  SELECT r."candidate_id", r."id", row_number() over (partition by r."candidate_id" order by r."created_at" desc, r."id" desc) AS position
  FROM "youtube_discovery_recommendations" r
  JOIN "youtube_discovery_runs" run ON run."id" = r."run_id" AND run."policy_version_id" = r."policy_version_id"
  WHERE r."recommendation" = 'consider' AND run."query_proposal_id" IS NOT NULL
) qualifying
WHERE position = 1
ON CONFLICT ("candidate_id") DO NOTHING;
