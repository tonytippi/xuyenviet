ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_user_message_owner_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_assistant_message_owner_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_user_message_conversation_owner_fk" FOREIGN KEY ("user_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_assistant_message_conversation_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;