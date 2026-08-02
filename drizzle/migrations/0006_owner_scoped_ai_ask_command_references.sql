ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_trip_project_id_trip_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_user_message_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" DROP CONSTRAINT "ai_ask_commands_assistant_message_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_trip_project_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_user_message_owner_fk" FOREIGN KEY ("user_message_id","user_id") REFERENCES "public"."messages"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","user_id") REFERENCES "public"."messages"("id","user_id") ON DELETE cascade ON UPDATE no action;
