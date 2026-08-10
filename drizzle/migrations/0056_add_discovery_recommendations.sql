ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "relevance_weight" numeric(7,6);--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "expected_value_weight" numeric(7,6);--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "freshness_fit_weight" numeric(7,6);--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "commercial_risk_weight" numeric(7,6);--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "duplicate_risk_weight" numeric(7,6);--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "defer_minimum" numeric(7,6);--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD COLUMN "consider_minimum" numeric(7,6);--> statement-breakpoint
UPDATE "youtube_discovery_policy_versions" SET "relevance_weight" = 0.300000, "expected_value_weight" = 0.300000, "freshness_fit_weight" = 0.200000, "commercial_risk_weight" = 0.100000, "duplicate_risk_weight" = 0.100000, "defer_minimum" = 0.350000, "consider_minimum" = 0.650000;--> statement-breakpoint
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ALTER COLUMN "relevance_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ALTER COLUMN "expected_value_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ALTER COLUMN "freshness_fit_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ALTER COLUMN "commercial_risk_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ALTER COLUMN "duplicate_risk_weight" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ALTER COLUMN "defer_minimum" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ALTER COLUMN "consider_minimum" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD CONSTRAINT "youtube_discovery_policy_versions_ranking_check" CHECK ("relevance_weight" between 0 and 1 and "expected_value_weight" between 0 and 1 and "freshness_fit_weight" between 0 and 1 and "commercial_risk_weight" between 0 and 1 and "duplicate_risk_weight" between 0 and 1 and "relevance_weight" + "expected_value_weight" + "freshness_fit_weight" + "commercial_risk_weight" + "duplicate_risk_weight" = 1.000000 and "defer_minimum" >= 0 and "defer_minimum" < "consider_minimum" and "consider_minimum" <= 1);--> statement-breakpoint
ALTER TABLE "youtube_discovery_triages" ADD CONSTRAINT "youtube_discovery_triages_id_provenance_unique" UNIQUE ("id", "candidate_id", "appearance_id", "run_id", "policy_version_id");--> statement-breakpoint
CREATE TABLE "youtube_discovery_recommendations" (
  "id" text PRIMARY KEY NOT NULL,
  "candidate_id" text NOT NULL REFERENCES "youtube_discovery_candidates"("id") ON DELETE restrict,
  "appearance_id" text NOT NULL,
  "run_id" text NOT NULL,
  "policy_version_id" text NOT NULL,
  "triage_id" text NOT NULL REFERENCES "youtube_discovery_triages"("id") ON DELETE restrict,
  "score" numeric(7,6) NOT NULL, "relevance_score" numeric(7,6) NOT NULL, "expected_value_score" numeric(7,6) NOT NULL, "freshness_fit_score" numeric(7,6) NOT NULL, "commercial_risk_score" numeric(7,6) NOT NULL, "duplicate_risk_score" numeric(7,6) NOT NULL,
  "recommendation" text NOT NULL, "factors" text[] NOT NULL DEFAULT '{}', "penalties" text[] NOT NULL DEFAULT '{}', "reason" text NOT NULL, "signals" text[] NOT NULL DEFAULT '{}', "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "youtube_discovery_recommendations_appearance_provenance_fk" FOREIGN KEY ("appearance_id", "candidate_id", "run_id") REFERENCES "youtube_discovery_appearances"("id", "candidate_id", "run_id") ON DELETE restrict,
  CONSTRAINT "youtube_discovery_recommendations_run_policy_fk" FOREIGN KEY ("run_id", "policy_version_id") REFERENCES "youtube_discovery_runs"("id", "policy_version_id") ON DELETE restrict,
  CONSTRAINT "youtube_discovery_recommendations_triage_provenance_fk" FOREIGN KEY ("triage_id", "candidate_id", "appearance_id", "run_id", "policy_version_id") REFERENCES "youtube_discovery_triages"("id", "candidate_id", "appearance_id", "run_id", "policy_version_id") ON DELETE restrict,
  CONSTRAINT "youtube_discovery_recommendations_scores_check" CHECK ("score" between 0 and 1 and "relevance_score" between 0 and 1 and "expected_value_score" between 0 and 1 and "freshness_fit_score" between 0 and 1 and "commercial_risk_score" between 0 and 1 and "duplicate_risk_score" between 0 and 1),
  CONSTRAINT "youtube_discovery_recommendations_codes_check" CHECK ("recommendation" in ('skip','defer','consider') and "factors" <@ array['relevance','expected_value','freshness_fit']::text[] and "penalties" <@ array['commercial_risk','duplicate_risk']::text[] and cardinality("factors") + cardinality("penalties") <= 5 and "reason" in ('eligible_score_band','below_defer_band','between_defer_and_consider_band','already_compatible','canonical_mismatch','not_current_run_enriched') and "signals" <@ array['recent_discussion','stale_or_changed_warning','practical_question_demand','creator_responsiveness','commercial_risk','contradictory_discussion']::text[] and cardinality("signals") <= 6)
);--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_recommendations_provenance_idx" ON "youtube_discovery_recommendations" ("candidate_id", "appearance_id", "run_id", "policy_version_id", "triage_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION youtube_discovery_recommendation_requires_succeeded_triage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM youtube_discovery_triages WHERE id = NEW.triage_id AND candidate_id = NEW.candidate_id AND appearance_id = NEW.appearance_id AND run_id = NEW.run_id AND policy_version_id = NEW.policy_version_id AND status = 'succeeded') THEN
    RAISE EXCEPTION 'youtube discovery recommendations require succeeded triage';
  END IF;
  RETURN NEW;
END; $$;--> statement-breakpoint
CREATE TRIGGER youtube_discovery_recommendation_triage_guard BEFORE INSERT ON "youtube_discovery_recommendations" FOR EACH ROW EXECUTE FUNCTION youtube_discovery_recommendation_requires_succeeded_triage();--> statement-breakpoint
ALTER TABLE "youtube_discovery_ranking_history" ADD COLUMN "recommendation_id" text;--> statement-breakpoint
ALTER TABLE "youtube_discovery_ranking_history" DROP CONSTRAINT "youtube_discovery_ranking_history_stage_check";--> statement-breakpoint
ALTER TABLE "youtube_discovery_ranking_history" ADD CONSTRAINT "youtube_discovery_ranking_history_stage_check" CHECK ("stage" in ('discovered','enriched','triaged','recommended'));--> statement-breakpoint
ALTER TABLE "youtube_discovery_ranking_history" ADD CONSTRAINT "youtube_discovery_ranking_history_recommendation_fk" FOREIGN KEY ("recommendation_id") REFERENCES "youtube_discovery_recommendations"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "youtube_discovery_ranking_history" ADD CONSTRAINT "youtube_discovery_ranking_history_recommendation_check" CHECK (("stage" = 'recommended' and "recommendation_id" is not null) or ("stage" <> 'recommended' and "recommendation_id" is null));--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_ranking_history_recommendation_idx" ON "youtube_discovery_ranking_history" ("recommendation_id") WHERE "recommendation_id" is not null;--> statement-breakpoint
CREATE OR REPLACE FUNCTION youtube_discovery_recommendation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'DELETE' AND current_setting('youtube_discovery.retention_guard', true) = 'on' THEN RETURN OLD; END IF; RAISE EXCEPTION 'youtube discovery recommendations are immutable'; END; $$;--> statement-breakpoint
CREATE TRIGGER youtube_discovery_recommendation_immutable_trigger BEFORE UPDATE OR DELETE ON "youtube_discovery_recommendations" FOR EACH ROW EXECUTE FUNCTION youtube_discovery_recommendation_immutable();
