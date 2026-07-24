ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "scenario_id" text;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "scenario_version" text;
--> statement-breakpoint
UPDATE "public_mvp_evaluation_results" SET "scenario_id" = CASE "prompt_type"
  WHEN 'magic_moment_family_trip' THEN 'community_observation'
  WHEN 'route_logistics' THEN 'independent_community_pattern'
  WHEN 'freshness_sensitive' THEN 'conditional_high_risk_claim'
  WHEN 'service_activity' THEN 'source_withdrawal'
  ELSE 'web_fallback_unavailable'
END, "scenario_version" = 'v1';
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ALTER COLUMN "scenario_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ALTER COLUMN "scenario_version" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "unsupported_community_wording_flag" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "required_caveat_omitted_flag" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "conflicted_knowledge_excluded_flag" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "stale_withdrawn_source_exposure_flag" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "raw_evidence_leakage_flag" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "fallback_verification_guidance_met_flag" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" DROP CONSTRAINT IF EXISTS "public_mvp_evaluation_results_scenario_id_check";
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD CONSTRAINT "public_mvp_evaluation_results_scenario_id_check" CHECK ("scenario_id" in ('community_observation', 'independent_community_pattern', 'conditional_high_risk_claim', 'conflict_exclusion', 'source_withdrawal', 'web_fallback_unavailable'));
--> statement-breakpoint
DROP INDEX "public_mvp_evaluation_results_run_prompt_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "public_mvp_evaluation_results_run_prompt_scenario_idx" ON "public_mvp_evaluation_results" USING btree ("run_id", "prompt_type", "scenario_id");
--> statement-breakpoint
CREATE TABLE "public_mvp_evaluation_result_policy_snapshots" (
  "result_id" text PRIMARY KEY NOT NULL REFERENCES "public_mvp_evaluation_results"("id") ON DELETE cascade,
  "scenario_id" text NOT NULL,
  "scenario_version" text NOT NULL,
  "selected_knowledge" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "excluded_candidate_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "excluded_reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_candidate_excluded" boolean DEFAULT false NOT NULL,
  "source_or_evidence_outcome" text NOT NULL,
  "web_fallback" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "finalization_outcome" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "public_mvp_evaluation_policy_snapshots_scenario_check" CHECK ("scenario_id" in ('community_observation', 'independent_community_pattern', 'conditional_high_risk_claim', 'conflict_exclusion', 'source_withdrawal', 'web_fallback_unavailable')),
  CONSTRAINT "public_mvp_evaluation_policy_snapshots_selected_check" CHECK (jsonb_typeof("selected_knowledge") = 'array' and jsonb_array_length("selected_knowledge") <= 5),
  CONSTRAINT "public_mvp_evaluation_policy_snapshots_counts_check" CHECK (jsonb_typeof("excluded_candidate_counts") = 'object' and octet_length("excluded_candidate_counts"::text) <= 1024),
  CONSTRAINT "public_mvp_evaluation_policy_snapshots_reasons_check" CHECK (jsonb_typeof("excluded_reason_codes") = 'array' and jsonb_array_length("excluded_reason_codes") <= 10),
  CONSTRAINT "public_mvp_evaluation_policy_snapshots_fallback_check" CHECK (jsonb_typeof("web_fallback") = 'object' and octet_length("web_fallback"::text) <= 2048)
);
--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_policy_snapshots_scenario_idx" ON "public_mvp_evaluation_result_policy_snapshots" USING btree ("scenario_id", "created_at");
