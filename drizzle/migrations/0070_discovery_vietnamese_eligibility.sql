ALTER TABLE "youtube_discovery_policy_versions"
  ADD COLUMN "language_classifier_version" integer NOT NULL DEFAULT 0,
  ADD COLUMN "minimum_useful_duration_seconds" integer NOT NULL DEFAULT 180,
  ADD COLUMN "allow_foreign_fallback" boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT "youtube_discovery_policy_versions_language_classifier_version_check" CHECK ("language_classifier_version" between 0 and 1 and "minimum_useful_duration_seconds" between 180 and 86400);

ALTER TABLE "youtube_discovery_appearances"
  ADD COLUMN "default_language" text,
  ADD COLUMN "default_audio_language" text,
  ADD COLUMN "language_fit" text,
  ADD COLUMN "duration_fit" text,
  ADD COLUMN "eligibility_reason" text,
  ADD COLUMN "query_builder_version" integer,
  ADD COLUMN "language_classifier_version" integer,
  ADD COLUMN "minimum_useful_duration_seconds" integer,
  ADD CONSTRAINT "youtube_discovery_appearances_eligibility_check" CHECK (("language_fit" is null and "duration_fit" is null and "eligibility_reason" is null and "query_builder_version" is null and "language_classifier_version" is null and "minimum_useful_duration_seconds" is null) OR ("language_fit" in ('vi','likely_vi','unknown','non_vi') and "duration_fit" in ('eligible','too_short','duration_unknown') and "eligibility_reason" = case when "duration_fit" = 'too_short' then 'too_short' when "duration_fit" = 'duration_unknown' then 'duration_unknown' when "language_fit" in ('vi','likely_vi') then 'eligible_vietnamese' when "eligibility_reason" = 'foreign_fallback' and "language_fit" in ('unknown','non_vi') then 'foreign_fallback' when "language_fit" = 'non_vi' then 'non_vietnamese' else 'language_unknown' end and "query_builder_version" between 1 and 2 and "language_classifier_version" = 1 and "minimum_useful_duration_seconds" between 180 and 86400));

WITH current_policy AS (
  UPDATE "youtube_discovery_policy_versions" SET "is_current" = false WHERE "is_current" and "language_classifier_version" = 0 RETURNING *
), next_version AS (
  SELECT COALESCE(MAX("version"), 0) + 1 AS "version" FROM "youtube_discovery_policy_versions"
)
INSERT INTO "youtube_discovery_policy_versions" ("id", "version", "is_current", "enabled", "query_builder_version", "language_classifier_version", "minimum_useful_duration_seconds", "allow_foreign_fallback", "minimum_candidate_score", "priority_score_weight", "freshness_score_weight", "relevance_weight", "expected_value_weight", "freshness_fit_weight", "commercial_risk_weight", "duplicate_risk_weight", "defer_minimum", "consider_minimum", "cadence_minutes", "retention_days", "comment_signal_ttl_days", "max_concurrent_runs", "max_retry_attempts", "retry_delay_minutes", "candidate_backlog_threshold", "action_queue_high_priority_maximum", "action_queue_maximum_operator_review_age_hours", "action_queue_maximum_mission_stall_hours", "action_queue_persistent_incident_failure_count", "action_queue_persistent_incident_window_hours")
SELECT gen_random_uuid()::text, next_version."version", true, current_policy."enabled", current_policy."query_builder_version", 1, 180, current_policy."allow_foreign_fallback", current_policy."minimum_candidate_score", current_policy."priority_score_weight", current_policy."freshness_score_weight", current_policy."relevance_weight", current_policy."expected_value_weight", current_policy."freshness_fit_weight", current_policy."commercial_risk_weight", current_policy."duplicate_risk_weight", current_policy."defer_minimum", current_policy."consider_minimum", current_policy."cadence_minutes", current_policy."retention_days", current_policy."comment_signal_ttl_days", current_policy."max_concurrent_runs", current_policy."max_retry_attempts", current_policy."retry_delay_minutes", current_policy."candidate_backlog_threshold", current_policy."action_queue_high_priority_maximum", current_policy."action_queue_maximum_operator_review_age_hours", current_policy."action_queue_maximum_mission_stall_hours", current_policy."action_queue_persistent_incident_failure_count", current_policy."action_queue_persistent_incident_window_hours"
FROM current_policy CROSS JOIN next_version;

CREATE OR REPLACE FUNCTION "prevent_youtube_discovery_policy_version_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(OLD) - ARRAY['id', 'is_current', 'created_at']) IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['id', 'is_current', 'created_at']) THEN
    RAISE EXCEPTION 'YouTube Discovery policy version configuration is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
