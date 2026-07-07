CREATE TABLE "trip_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"origin" text,
	"destination" text,
	"start_date" text,
	"end_date" text,
	"travelers" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_projects_title_not_empty_check" CHECK (length(btrim("trip_projects"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "trip_project_id" text;--> statement-breakpoint
ALTER TABLE "trip_projects" ADD CONSTRAINT "trip_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_projects_id_user_id_idx" ON "trip_projects" USING btree ("id","user_id");--> statement-breakpoint
CREATE INDEX "trip_projects_user_id_updated_at_idx" ON "trip_projects" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trip_project_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE SET NULL ("trip_project_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_trip_project_id_idx" ON "conversations" USING btree ("trip_project_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_trip_project_updated_at_idx" ON "conversations" USING btree ("user_id","trip_project_id","updated_at");
