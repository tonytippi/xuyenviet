ALTER TABLE "ai_ask_commands" ADD COLUMN "trip_answer_context_snapshot_id" text REFERENCES "trip_answer_context_snapshots"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD COLUMN "trip_answer_context_snapshot_id" text REFERENCES "trip_answer_context_snapshots"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "trip_answer_context_snapshots" ADD CONSTRAINT "trip_answer_context_snapshots_conversation_owner_fk" FOREIGN KEY ("conversation_id", "user_id") REFERENCES "conversations"("id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "trip_answer_context_snapshots" ADD CONSTRAINT "trip_answer_context_snapshots_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id", "conversation_id", "user_id") REFERENCES "messages"("id", "conversation_id", "user_id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "trip_answer_context_snapshots_owner_message_idx" ON "trip_answer_context_snapshots" ("id", "user_id", "conversation_id", "assistant_message_id");
--> statement-breakpoint
CREATE INDEX "ai_ask_commands_snapshot_idx" ON "ai_ask_commands" ("trip_answer_context_snapshot_id");
--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_results_snapshot_idx" ON "public_mvp_evaluation_results" ("trip_answer_context_snapshot_id");
