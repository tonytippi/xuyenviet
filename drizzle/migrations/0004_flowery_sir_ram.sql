CREATE TABLE "ai_ask_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scope_kind" text NOT NULL,
	"scope_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"identity_version" integer DEFAULT 1 NOT NULL,
	"request_digest" text NOT NULL,
	"normalized_question" text NOT NULL,
	"attachment_metadata" jsonb,
	"selected_scope_digest" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"conversation_id" text,
	"trip_project_id" text,
	"user_message_id" text,
	"assistant_message_id" text,
	"terminal_result" jsonb,
	"expires_at" timestamp NOT NULL,
	"terminal_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_ask_commands_scope_kind_check" CHECK ("ai_ask_commands"."scope_kind" in ('conversation', 'trip_project', 'new_conversation')),
	CONSTRAINT "ai_ask_commands_key_check" CHECK ("ai_ask_commands"."idempotency_key" ~ '^[A-Za-z0-9_-]{16,128}$'),
	CONSTRAINT "ai_ask_commands_digest_check" CHECK ("ai_ask_commands"."request_digest" ~ '^[a-f0-9]{64}$' and "ai_ask_commands"."selected_scope_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "ai_ask_commands_status_check" CHECK ("ai_ask_commands"."status" in ('pending', 'completed', 'failed', 'aborted')),
	CONSTRAINT "ai_ask_commands_question_check" CHECK (char_length("ai_ask_commands"."normalized_question") between 1 and 2000),
	CONSTRAINT "ai_ask_commands_terminal_shape_check" CHECK (("ai_ask_commands"."status" = 'pending' and "ai_ask_commands"."terminal_result" is null and "ai_ask_commands"."terminal_at" is null) or ("ai_ask_commands"."status" <> 'pending' and "ai_ask_commands"."terminal_result" is not null and "ai_ask_commands"."terminal_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_trip_project_id_trip_projects_id_fk" FOREIGN KEY ("trip_project_id") REFERENCES "public"."trip_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_ask_commands" ADD CONSTRAINT "ai_ask_commands_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_ask_commands_owner_scope_key_idx" ON "ai_ask_commands" USING btree ("user_id","scope_kind","scope_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_ask_commands_owner_conversation_idx" ON "ai_ask_commands" USING btree ("user_id","conversation_id");--> statement-breakpoint
CREATE INDEX "ai_ask_commands_expiry_idx" ON "ai_ask_commands" USING btree ("expires_at");
