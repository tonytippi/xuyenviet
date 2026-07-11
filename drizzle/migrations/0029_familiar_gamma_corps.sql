CREATE TABLE "answer_usefulness_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"assistant_message_role" text DEFAULT 'assistant' NOT NULL,
	"rating" text NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "answer_usefulness_feedback_rating_check" CHECK ("answer_usefulness_feedback"."rating" in ('useful', 'not_useful')),
	CONSTRAINT "answer_usefulness_feedback_assistant_role_check" CHECK ("answer_usefulness_feedback"."assistant_message_role" = 'assistant'),
	CONSTRAINT "answer_usefulness_feedback_comment_length_check" CHECK ("answer_usefulness_feedback"."comment" is null or length(btrim("answer_usefulness_feedback"."comment")) between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_id_conversation_id_user_id_role_unique" UNIQUE ("id","conversation_id","user_id","role");--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id","assistant_message_role") REFERENCES "public"."messages"("id","conversation_id","user_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_usefulness_feedback_assistant_user_idx" ON "answer_usefulness_feedback" USING btree ("assistant_message_id","user_id");--> statement-breakpoint
CREATE INDEX "answer_usefulness_feedback_conversation_created_at_idx" ON "answer_usefulness_feedback" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "answer_usefulness_feedback_user_id_created_at_idx" ON "answer_usefulness_feedback" USING btree ("user_id","created_at");
