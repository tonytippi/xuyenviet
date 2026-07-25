CREATE TABLE "trip_change_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"creator_class" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rationale" text NOT NULL,
	"operations" jsonb NOT NULL,
	"expected_aggregate_version" integer NOT NULL,
	"expected_item_versions" jsonb,
	"ordering_preconditions" jsonb,
	"alternatives" jsonb,
	"expires_at" timestamp,
	"terminal_timestamp" timestamp,
	"source_assistant_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_change_proposals_creator_class_check" CHECK ("trip_change_proposals"."creator_class" in ('ai_orchestration', 'owner_command')),
	CONSTRAINT "trip_change_proposals_status_check" CHECK ("trip_change_proposals"."status" in ('pending', 'applied', 'dismissed', 'expired')),
	CONSTRAINT "trip_change_proposals_expected_aggregate_version_check" CHECK ("trip_change_proposals"."expected_aggregate_version" >= 1),
	CONSTRAINT "trip_change_proposals_rationale_check" CHECK (length(btrim("trip_change_proposals"."rationale")) between 1 and 500 and position(chr(10) in "trip_change_proposals"."rationale") = 0 and position(chr(13) in "trip_change_proposals"."rationale") = 0),
	CONSTRAINT "trip_change_proposals_operations_array_check" CHECK (jsonb_typeof("trip_change_proposals"."operations") = 'array' and jsonb_array_length("trip_change_proposals"."operations") between 1 and 20),
	CONSTRAINT "trip_change_proposals_expected_item_versions_check" CHECK ("trip_change_proposals"."expected_item_versions" is null or jsonb_typeof("trip_change_proposals"."expected_item_versions") = 'object'),
	CONSTRAINT "trip_change_proposals_alternatives_check" CHECK ("trip_change_proposals"."alternatives" is null or (jsonb_typeof("trip_change_proposals"."alternatives") = 'array' and jsonb_array_length("trip_change_proposals"."alternatives") <= 5)),
	CONSTRAINT "trip_change_proposals_status_terminal_shape_check" CHECK (("trip_change_proposals"."status" = 'pending' and "trip_change_proposals"."terminal_timestamp" is null) or ("trip_change_proposals"."status" in ('applied', 'dismissed', 'expired') and "trip_change_proposals"."terminal_timestamp" is not null))
);
--> statement-breakpoint
CREATE TABLE "trip_plan_change_history" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"proposal_id" text,
	"actor_user_id" text,
	"actor_class" text DEFAULT 'user' NOT NULL,
	"actor_system" text,
	"operation_class" text NOT NULL,
	"affected_item_references" jsonb NOT NULL,
	"safe_before_after_summary" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_plan_change_history_actor_class_check" CHECK ("trip_plan_change_history"."actor_class" in ('user', 'system')),
	CONSTRAINT "trip_plan_change_history_operation_class_check" CHECK ("trip_plan_change_history"."operation_class" in ('apply', 'dismiss', 'expire')),
	CONSTRAINT "trip_plan_change_history_affected_references_check" CHECK (jsonb_typeof("trip_plan_change_history"."affected_item_references") = 'array'),
	CONSTRAINT "trip_plan_change_history_safe_summary_check" CHECK (jsonb_typeof("trip_plan_change_history"."safe_before_after_summary") = 'object' and octet_length("trip_plan_change_history"."safe_before_after_summary"::text) <= 8192)
);
--> statement-breakpoint
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_operation_check";--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_class" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_system" text;--> statement-breakpoint
ALTER TABLE "trip_change_proposals" ADD CONSTRAINT "trip_change_proposals_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_change_history" ADD CONSTRAINT "trip_plan_change_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_change_history" ADD CONSTRAINT "trip_plan_change_history_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_change_proposals_owner_status_created_idx" ON "trip_change_proposals" USING btree ("user_id","trip_project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "trip_plan_change_history_owner_created_idx" ON "trip_plan_change_history" USING btree ("user_id","trip_project_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_class_check" CHECK ("audit_events"."actor_class" in ('user', 'system'));--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_operation_check" CHECK ("audit_events"."operation" in ('access_check', 'create', 'update', 'delete', 'archive', 'approve', 'apply', 'dismiss', 'expire'));