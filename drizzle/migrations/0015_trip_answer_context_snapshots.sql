CREATE TABLE "trip_answer_context_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "conversation_id" text NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
  "assistant_message_id" text NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "context_version" integer NOT NULL,
  "aggregate_version" integer,
  "included_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "excluded_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "serialization" text NOT NULL,
  "prompt_digest" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "trip_answer_context_snapshots_version_check" CHECK ("context_version" = 1 AND ("aggregate_version" IS NULL OR "aggregate_version" >= 1)),
  CONSTRAINT "trip_answer_context_snapshots_refs_check" CHECK (jsonb_typeof("included_references") = 'array' AND jsonb_typeof("excluded_references") = 'array' AND jsonb_typeof("conflicts") = 'array'),
  CONSTRAINT "trip_answer_context_snapshots_bounds_check" CHECK (octet_length("serialization") <= 32768 AND "prompt_digest" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trip_answer_context_snapshots_assistant_message_idx" ON "trip_answer_context_snapshots" ("assistant_message_id");
--> statement-breakpoint
CREATE INDEX "trip_answer_context_snapshots_conversation_created_idx" ON "trip_answer_context_snapshots" ("conversation_id", "created_at");
--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD COLUMN "trip_answer_context_snapshot_id" text REFERENCES "trip_answer_context_snapshots"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD COLUMN "trip_answer_context_snapshot_id" text REFERENCES "trip_answer_context_snapshots"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "trip_answer_context_snapshot_id" text REFERENCES "trip_answer_context_snapshots"("id") ON DELETE SET NULL;
