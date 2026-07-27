-- Epic 8 attribution data is a disposable clean break. `db:reset` recreates this
-- schema before reseeding; applying this migration to a durable populated database
-- is unsupported because it deliberately discards these historical attribution rows.
DELETE FROM "audit_events";--> statement-breakpoint
DELETE FROM "trip_plan_change_history";--> statement-breakpoint
DELETE FROM "ai_usage_events";--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ALTER COLUMN "actor_email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_shape_check" CHECK (("audit_events"."actor_class" = 'user' and "audit_events"."actor_user_id" is not null and "audit_events"."actor_email" is not null and length(btrim("audit_events"."actor_email")) > 0 and "audit_events"."actor_system" is null) or ("audit_events"."actor_class" = 'system' and "audit_events"."actor_user_id" is null and "audit_events"."actor_email" is null and "audit_events"."actor_system" is not null and length(btrim("audit_events"."actor_system")) > 0));--> statement-breakpoint
ALTER TABLE "trip_plan_change_history" ADD CONSTRAINT "trip_plan_change_history_actor_shape_check" CHECK (("trip_plan_change_history"."actor_class" = 'user' and "trip_plan_change_history"."actor_user_id" is not null and "trip_plan_change_history"."actor_system" is null) or ("trip_plan_change_history"."actor_class" = 'system' and "trip_plan_change_history"."actor_user_id" is null and "trip_plan_change_history"."actor_system" is not null and length(btrim("trip_plan_change_history"."actor_system")) > 0));--> statement-breakpoint
ALTER TABLE "ai_usage_events" RENAME COLUMN "user_id" TO "initiated_by_user_id";--> statement-breakpoint
ALTER TABLE "ai_usage_events" ALTER COLUMN "initiated_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "trip_project_id" text;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "executor_system" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_executor_system_check" CHECK (length(btrim("ai_usage_events"."executor_system")) > 0);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_trip_project_id_trip_projects_id_fk" FOREIGN KEY ("trip_project_id") REFERENCES "public"."trip_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
DROP INDEX "ai_usage_events_user_id_created_at_idx";--> statement-breakpoint
CREATE INDEX "ai_usage_events_initiated_by_user_id_created_at_idx" ON "ai_usage_events" USING btree ("initiated_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_executor_system_created_at_idx" ON "ai_usage_events" USING btree ("executor_system","created_at");
