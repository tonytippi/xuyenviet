ALTER TABLE "trip_answer_context_snapshots" ADD COLUMN "trip_project_id" text;
--> statement-breakpoint
UPDATE "trip_answer_context_snapshots" AS "snapshot"
SET "trip_project_id" = "conversation"."trip_project_id"
FROM "conversations" AS "conversation"
WHERE "conversation"."id" = "snapshot"."conversation_id"
  AND "conversation"."user_id" = "snapshot"."user_id";
--> statement-breakpoint
ALTER TABLE "trip_answer_context_snapshots" ADD CONSTRAINT "trip_answer_context_snapshots_project_owner_fk" FOREIGN KEY ("trip_project_id", "user_id") REFERENCES "trip_projects"("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE INDEX "trip_answer_context_snapshots_project_created_idx" ON "trip_answer_context_snapshots" ("trip_project_id", "created_at");
