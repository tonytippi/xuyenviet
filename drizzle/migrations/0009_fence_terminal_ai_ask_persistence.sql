ALTER TABLE "conversations" ADD COLUMN "lifecycle_version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lifecycle_version_check" CHECK ("lifecycle_version" >= 1);
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD COLUMN "conversation_lifecycle_version" integer;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD COLUMN "trip_project_aggregate_version" integer;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_status_check";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_status_check" CHECK ("status" in ('pending', 'completed', 'failed', 'aborted', 'discarded'));
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_terminal_shape_check";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_terminal_shape_check" CHECK (("status" = 'pending' AND "terminal_at" IS NULL AND "terminal_result" IS NULL) OR ("status" IN ('completed', 'failed', 'aborted') AND "terminal_result" IS NOT NULL AND "terminal_at" IS NOT NULL) OR ("status" = 'discarded' AND "terminal_result" IS NOT NULL AND "terminal_at" IS NOT NULL AND "assistant_message_id" IS NULL));
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_fence_shape_check" CHECK (("conversation_id" IS NULL OR "conversation_lifecycle_version" >= 1) AND ("trip_project_id" IS NULL OR "trip_project_aggregate_version" >= 1));
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_conversation_owner_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_trip_project_owner_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_user_message_owner_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_assistant_message_owner_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_conversation_owner_fk" FOREIGN KEY ("conversation_id", "user_id") REFERENCES "public"."conversations"("id", "user_id") ON DELETE SET NULL ("conversation_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_trip_project_owner_fk" FOREIGN KEY ("trip_project_id", "user_id") REFERENCES "public"."trip_projects"("id", "user_id") ON DELETE SET NULL ("trip_project_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_user_message_conversation_owner_fk" FOREIGN KEY ("user_message_id", "conversation_id", "user_id") REFERENCES "public"."messages"("id", "conversation_id", "user_id") ON DELETE SET NULL ("user_message_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_assistant_message_conversation_owner_fk" FOREIGN KEY ("assistant_message_id", "conversation_id", "user_id") REFERENCES "public"."messages"("id", "conversation_id", "user_id") ON DELETE SET NULL ("assistant_message_id") ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_ask_commands_owner_fence_finalization_idx" ON "ai_ask_commands" ("user_id", "trip_project_id", "conversation_id", "status");
