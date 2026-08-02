CREATE TABLE "domain_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "originating_command_id" text NOT NULL REFERENCES "ai_ask_commands"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "event_version" integer DEFAULT 1 NOT NULL,
  "aggregate_type" text DEFAULT 'ai_ask_command' NOT NULL,
  "aggregate_id" text NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "trip_project_id" text REFERENCES "trip_projects"("id") ON DELETE cascade,
  "user_message_id" text REFERENCES "messages"("id") ON DELETE cascade,
  "assistant_message_id" text REFERENCES "messages"("id") ON DELETE cascade,
  "conversation_lifecycle_version" integer NOT NULL,
  "trip_project_aggregate_version" integer,
  "dedupe_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "available_at" timestamp DEFAULT now() NOT NULL,
  "claimed_by" text,
  "claimed_at" timestamp,
  "lease_expires_at" timestamp,
  "fencing_token" text,
  "last_error_code" text,
  "failure_code" text,
  "completed_at" timestamp,
  "failed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "domain_outbox_event_type_check" CHECK ("event_type" in ('ai_ask.context_extraction.v1', 'ai_ask.answer_annotation.v1', 'ai_ask.trip_proposal_draft.v1')),
  CONSTRAINT "domain_outbox_event_version_check" CHECK ("event_version" = 1 and "aggregate_type" = 'ai_ask_command' and "aggregate_id" = "originating_command_id"),
  CONSTRAINT "domain_outbox_attempts_check" CHECK ("attempt_count" between 0 and "max_attempts" and "max_attempts" between 1 and 10),
  CONSTRAINT "domain_outbox_payload_check" CHECK (jsonb_typeof("payload") = 'object' and octet_length("payload"::text) <= 4096),
  CONSTRAINT "domain_outbox_safe_code_check" CHECK (("last_error_code" is null or "last_error_code" ~ '^[a-z0-9_:-]{1,120}$') and ("failure_code" is null or "failure_code" ~ '^[a-z0-9_:-]{1,120}$')),
  CONSTRAINT "domain_outbox_processing_claim_check" CHECK (("status" = 'processing') = ("claimed_by" is not null and "claimed_at" is not null and "lease_expires_at" > "claimed_at" and "fencing_token" ~ '^[a-f0-9]{64}$')),
  CONSTRAINT "domain_outbox_terminal_claim_check" CHECK ("status" not in ('completed', 'failed') or ("claimed_by" is null and "claimed_at" is null and "lease_expires_at" is null and "fencing_token" is null)),
  CONSTRAINT "domain_outbox_terminal_timestamp_check" CHECK (("status" = 'completed' and "completed_at" is not null) or ("status" = 'failed' and "failed_at" is not null) or ("status" in ('pending', 'processing') and "completed_at" is null and "failed_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "domain_outbox_dedupe_key_idx" ON "domain_outbox" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "domain_outbox_due_queue_idx" ON "domain_outbox" USING btree ("status", "available_at", "created_at", "id");
--> statement-breakpoint
CREATE INDEX "domain_outbox_expired_lease_idx" ON "domain_outbox" USING btree ("status", "lease_expires_at") WHERE "lease_expires_at" is not null;
--> statement-breakpoint
CREATE TABLE "domain_outbox_effects" (
  "id" text PRIMARY KEY NOT NULL,
  "outbox_event_id" text NOT NULL REFERENCES "domain_outbox"("id") ON DELETE cascade,
  "effect_type" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "domain_outbox_effects_type_check" CHECK ("effect_type" in ('context_extraction', 'answer_annotation', 'trip_proposal_draft', 'fenced_out'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "domain_outbox_effects_event_idx" ON "domain_outbox_effects" USING btree ("outbox_event_id");
