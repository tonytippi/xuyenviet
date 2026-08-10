ALTER TABLE "ai_gateway_models" DROP CONSTRAINT "ai_gateway_models_purpose_check";--> statement-breakpoint
ALTER TABLE "ai_gateway_models" ADD CONSTRAINT "ai_gateway_models_purpose_check" CHECK ("purpose" in ('ai_ask_initial_answer', 'extraction', 'embeddings', 'evaluation', 'youtube_discovery_triage'));--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "youtube_discovery_run_id" text REFERENCES "youtube_discovery_runs"("id") ON DELETE set null;--> statement-breakpoint
CREATE INDEX "ai_usage_events_youtube_discovery_run_id_idx" ON "ai_usage_events" USING btree ("youtube_discovery_run_id");--> statement-breakpoint
CREATE TABLE "youtube_discovery_triages" (
  "id" text PRIMARY KEY NOT NULL,
  "candidate_id" text NOT NULL REFERENCES "youtube_discovery_candidates"("id") ON DELETE restrict,
  "run_id" text NOT NULL REFERENCES "youtube_discovery_runs"("id") ON DELETE restrict,
  "policy_version_id" text NOT NULL REFERENCES "youtube_discovery_policy_versions"("id") ON DELETE restrict,
  "prompt_version" text NOT NULL,
  "status" text NOT NULL,
  "relevance_score" real,
  "expected_value_score" real,
  "freshness_fit_score" real,
  "commercial_risk_score" real,
  "duplicate_risk_score" real,
  "signals" text[],
  "ai_gateway_model_id" text REFERENCES "ai_gateway_models"("id") ON DELETE set null,
  "usage_event_id" text REFERENCES "ai_usage_events"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "youtube_discovery_triages_status_check" CHECK ("status" in ('succeeded', 'no_eligible_model', 'gateway_failed', 'invalid_output')),
  CONSTRAINT "youtube_discovery_triages_prompt_version_check" CHECK (length(btrim("prompt_version")) between 1 and 120),
  CONSTRAINT "youtube_discovery_triages_scores_check" CHECK (("relevance_score" is null or ("relevance_score" >= 0 and "relevance_score" <= 1)) and ("expected_value_score" is null or ("expected_value_score" >= 0 and "expected_value_score" <= 1)) and ("freshness_fit_score" is null or ("freshness_fit_score" >= 0 and "freshness_fit_score" <= 1)) and ("commercial_risk_score" is null or ("commercial_risk_score" >= 0 and "commercial_risk_score" <= 1)) and ("duplicate_risk_score" is null or ("duplicate_risk_score" >= 0 and "duplicate_risk_score" <= 1))),
  CONSTRAINT "youtube_discovery_triages_signals_check" CHECK ("signals" is null or ("signals" <@ array['recent_discussion','stale_or_changed_warning','practical_question_demand','creator_responsiveness','commercial_risk','contradictory_discussion']::text[] and cardinality("signals") between 1 and 6 and coalesce(cardinality(array_positions("signals", 'recent_discussion')), 0) <= 1 and coalesce(cardinality(array_positions("signals", 'stale_or_changed_warning')), 0) <= 1 and coalesce(cardinality(array_positions("signals", 'practical_question_demand')), 0) <= 1 and coalesce(cardinality(array_positions("signals", 'creator_responsiveness')), 0) <= 1 and coalesce(cardinality(array_positions("signals", 'commercial_risk')), 0) <= 1 and coalesce(cardinality(array_positions("signals", 'contradictory_discussion')), 0) <= 1)),
  CONSTRAINT "youtube_discovery_triages_shape_check" CHECK (("status" = 'succeeded' and "relevance_score" is not null and "expected_value_score" is not null and "freshness_fit_score" is not null and "commercial_risk_score" is not null and "duplicate_risk_score" is not null and "signals" is not null and "ai_gateway_model_id" is not null and "usage_event_id" is not null) or ("status" <> 'succeeded' and "relevance_score" is null and "expected_value_score" is null and "freshness_fit_score" is null and "commercial_risk_score" is null and "duplicate_risk_score" is null and "signals" is null))
);--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_discovery_triages_invocation_idx" ON "youtube_discovery_triages" USING btree ("candidate_id", "run_id", "prompt_version");--> statement-breakpoint
CREATE INDEX "youtube_discovery_triages_candidate_idx" ON "youtube_discovery_triages" USING btree ("candidate_id");
