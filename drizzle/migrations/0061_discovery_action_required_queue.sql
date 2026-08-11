ALTER TABLE "youtube_discovery_policy_versions"
  ADD COLUMN "action_queue_high_priority_maximum" integer NOT NULL DEFAULT 20,
  ADD COLUMN "action_queue_maximum_operator_review_age_hours" integer NOT NULL DEFAULT 72,
  ADD COLUMN "action_queue_maximum_mission_stall_hours" integer NOT NULL DEFAULT 48,
  ADD COLUMN "action_queue_persistent_incident_failure_count" integer NOT NULL DEFAULT 2,
  ADD COLUMN "action_queue_persistent_incident_window_hours" integer NOT NULL DEFAULT 24;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_policy_versions" ADD CONSTRAINT "youtube_discovery_policy_versions_action_queue_check" CHECK ("youtube_discovery_policy_versions"."action_queue_high_priority_maximum" between 1 and 100 and "youtube_discovery_policy_versions"."action_queue_maximum_operator_review_age_hours" between 1 and 720 and "youtube_discovery_policy_versions"."action_queue_maximum_mission_stall_hours" between 1 and 720 and "youtube_discovery_policy_versions"."action_queue_persistent_incident_failure_count" between 2 and 10 and "youtube_discovery_policy_versions"."action_queue_persistent_incident_window_hours" between 1 and 168);
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD COLUMN "incident_category" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_runs" ADD CONSTRAINT "youtube_discovery_runs_incident_category_check" CHECK ("youtube_discovery_runs"."incident_category" is null or "youtube_discovery_runs"."incident_category" in ('provider_rate_limited', 'triage_schema_invalid', 'execution_terminal'));
--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD COLUMN "discovery_mission_action_id" text;
--> statement-breakpoint
UPDATE "knowledge_recommendations" SET "discovery_mission_action_id" = 'mission-' || md5("id") WHERE "work_type" = 'missing_context';
--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_discovery_mission_action_id_check" CHECK ("discovery_mission_action_id" is null or "discovery_mission_action_id" ~ '^mission-[a-f0-9]{32}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_recommendations_discovery_mission_action_id_idx" ON "knowledge_recommendations" ("discovery_mission_action_id") WHERE "discovery_mission_action_id" is not null;
