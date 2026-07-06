CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"operation" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before_summary" text,
	"after_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_operation_check" CHECK ("audit_events"."operation" in ('access_check', 'create', 'update', 'delete', 'archive', 'approve'))
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");