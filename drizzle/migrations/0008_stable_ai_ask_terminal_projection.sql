ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_terminal_shape_check";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_terminal_shape_check" CHECK (("ai_ask_commands"."status" = 'pending' AND "ai_ask_commands"."terminal_at" IS NULL AND ("ai_ask_commands"."terminal_result" IS NULL OR "ai_ask_commands"."assistant_message_id" IS NOT NULL)) OR ("ai_ask_commands"."status" <> 'pending' AND "ai_ask_commands"."terminal_result" IS NOT NULL AND "ai_ask_commands"."terminal_at" IS NOT NULL));
