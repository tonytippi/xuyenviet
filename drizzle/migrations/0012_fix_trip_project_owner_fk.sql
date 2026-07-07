ALTER TABLE "conversations" DROP CONSTRAINT "conversations_trip_project_owner_fk";--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trip_project_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE SET NULL ("trip_project_id") ON UPDATE no action;
