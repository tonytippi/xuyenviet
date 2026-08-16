CREATE TABLE "planning_context_sessions" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conversation_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "revision" integer NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "planning_context_sessions_pkey" PRIMARY KEY("user_id", "conversation_id"),
  CONSTRAINT "planning_context_sessions_conversation_owner_fk" FOREIGN KEY ("conversation_id", "user_id") REFERENCES "conversations"("id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "planning_context_sessions_revision_check" CHECK ("revision" >= 1 AND ("payload" ->> 'revision')::integer = "revision"),
  CONSTRAINT "planning_context_sessions_payload_check" CHECK (jsonb_typeof("payload") = 'object' AND octet_length("payload"::text) <= 8192)
);

CREATE INDEX "planning_context_sessions_conversation_idx" ON "planning_context_sessions" USING btree ("conversation_id");
