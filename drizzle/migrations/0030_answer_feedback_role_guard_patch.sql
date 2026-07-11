DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_id_conversation_id_user_id_role_unique" UNIQUE ("id","conversation_id","user_id","role");
EXCEPTION
 WHEN duplicate_object OR duplicate_table THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD COLUMN IF NOT EXISTS "assistant_message_role" text DEFAULT 'assistant' NOT NULL;
--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" DROP CONSTRAINT IF EXISTS "answer_usefulness_feedback_assistant_message_owner_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_assistant_role_check" CHECK ("answer_usefulness_feedback"."assistant_message_role" = 'assistant');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id","assistant_message_role") REFERENCES "public"."messages"("id","conversation_id","user_id","role") ON DELETE cascade ON UPDATE no action;
