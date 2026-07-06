CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"user_message_id" text,
	"assistant_message_id" text,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_events_status_check" CHECK ("ai_usage_events"."status" in ('success', 'failure')),
	CONSTRAINT "ai_usage_events_latency_non_negative_check" CHECK ("ai_usage_events"."latency_ms" is null or "ai_usage_events"."latency_ms" >= 0),
	CONSTRAINT "ai_usage_events_prompt_tokens_non_negative_check" CHECK ("ai_usage_events"."prompt_tokens" is null or "ai_usage_events"."prompt_tokens" >= 0),
	CONSTRAINT "ai_usage_events_completion_tokens_non_negative_check" CHECK ("ai_usage_events"."completion_tokens" is null or "ai_usage_events"."completion_tokens" >= 0),
	CONSTRAINT "ai_usage_events_total_tokens_non_negative_check" CHECK ("ai_usage_events"."total_tokens" is null or "ai_usage_events"."total_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_id_created_at_idx" ON "ai_usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_conversation_id_idx" ON "ai_usage_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_status_idx" ON "ai_usage_events" USING btree ("status");
