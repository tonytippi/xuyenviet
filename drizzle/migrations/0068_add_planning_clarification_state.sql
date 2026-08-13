ALTER TABLE "conversations" ADD COLUMN "content_revision" integer NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_content_revision_check" CHECK ("content_revision" >= 0);
ALTER TABLE "messages" ADD COLUMN "ordinal" integer DEFAULT 1;
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY conversation_id ORDER BY created_at, id) AS ordinal FROM "messages"
) UPDATE "messages" SET "ordinal" = ranked.ordinal FROM ranked WHERE "messages".id = ranked.id;
UPDATE "conversations" AS conversation SET "content_revision" = COALESCE((SELECT max(message."ordinal") FROM "messages" AS message WHERE message."conversation_id" = conversation."id"), 0);
ALTER TABLE "messages" ALTER COLUMN "ordinal" SET NOT NULL;
ALTER TABLE "messages" ADD CONSTRAINT "messages_ordinal_check" CHECK ("ordinal" >= 1);
CREATE UNIQUE INDEX "messages_conversation_ordinal_idx" ON "messages" ("conversation_id", "ordinal");
CREATE UNIQUE INDEX "messages_id_conversation_id_idx" ON "messages" ("id", "conversation_id");
CREATE UNIQUE INDEX "ai_ask_commands_id_user_id_idx" ON "ai_ask_commands" ("id", "user_id");

CREATE TABLE "planning_clarification_attempts" (
  "id" text PRIMARY KEY NOT NULL, "command_id" text NOT NULL REFERENCES "ai_ask_commands"("id") ON DELETE CASCADE, "source_message_id" text NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE, "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expected_session_revision" integer NOT NULL, "prompt_version" text NOT NULL, "kind" text NOT NULL, "payload" jsonb NOT NULL, "digest" text NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_attempt_revision_check" CHECK ("expected_session_revision" >= 0), CONSTRAINT "planning_clarification_attempt_kind_check" CHECK ("kind" IN ('plan','extraction')), CONSTRAINT "planning_clarification_attempt_digest_check" CHECK ("digest" ~ '^[a-f0-9]{64}$'), CONSTRAINT "planning_clarification_attempt_payload_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "planning_clarification_attempt_message_owner_fk" FOREIGN KEY ("source_message_id", "user_id") REFERENCES "messages"("id", "user_id") ON DELETE CASCADE
  , CONSTRAINT "planning_clarification_attempt_command_owner_fk" FOREIGN KEY ("command_id", "user_id") REFERENCES "ai_ask_commands"("id", "user_id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "planning_clarification_attempt_identity_idx" ON "planning_clarification_attempts" ("command_id", "source_message_id", "expected_session_revision", "prompt_version");
CREATE FUNCTION "reject_planning_clarification_attempt_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'planning clarification attempts are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "planning_clarification_attempts_immutable" BEFORE UPDATE ON "planning_clarification_attempts" FOR EACH ROW EXECUTE FUNCTION "reject_planning_clarification_attempt_mutation"();

CREATE TABLE "planning_clarification_sessions" (
  "id" text PRIMARY KEY NOT NULL, "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "conversation_id" text NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE, "trip_project_id" text REFERENCES "trip_projects"("id") ON DELETE CASCADE, "command_id" text NOT NULL REFERENCES "ai_ask_commands"("id") ON DELETE CASCADE, "conversation_lifecycle_version" integer NOT NULL, "trip_project_aggregate_version" integer, "proposal_id" text, "proposal_version" integer,
  "state" text NOT NULL DEFAULT 'active', "revision" integer NOT NULL DEFAULT 1, "content_revision" integer NOT NULL, "graph_digest" text NOT NULL, "plan_attempt_id" text NOT NULL REFERENCES "planning_clarification_attempts"("id") ON DELETE RESTRICT,
  "profile_version" text NOT NULL, "policy_version" text NOT NULL, "comparator_version" text NOT NULL, "scope_graph" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_session_conversation_owner_fk" FOREIGN KEY ("conversation_id", "user_id") REFERENCES "conversations"("id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "planning_clarification_session_project_owner_fk" FOREIGN KEY ("trip_project_id", "user_id") REFERENCES "trip_projects"("id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "planning_clarification_session_command_owner_fk" FOREIGN KEY ("command_id", "user_id") REFERENCES "ai_ask_commands"("id", "user_id") ON DELETE CASCADE,
  CONSTRAINT "planning_clarification_session_state_check" CHECK ("state" IN ('active','superseded','completed')), CONSTRAINT "planning_clarification_session_revision_check" CHECK ("revision" >= 1 AND "content_revision" >= 0), CONSTRAINT "planning_clarification_session_fence_check" CHECK ("conversation_lifecycle_version" >= 1 AND (("trip_project_id" IS NULL AND "trip_project_aggregate_version" IS NULL) OR ("trip_project_id" IS NOT NULL AND "trip_project_aggregate_version" >= 1))), CONSTRAINT "planning_clarification_session_digest_check" CHECK ("graph_digest" ~ '^[a-f0-9]{64}$'), CONSTRAINT "planning_clarification_session_scope_graph_check" CHECK (jsonb_typeof("scope_graph") = 'array')
);
CREATE UNIQUE INDEX "planning_clarification_one_active_conversation_idx" ON "planning_clarification_sessions" ("conversation_id") WHERE "state" = 'active';
CREATE INDEX "planning_clarification_session_owner_conversation_idx" ON "planning_clarification_sessions" ("user_id", "conversation_id");
CREATE UNIQUE INDEX "planning_clarification_session_id_user_id_idx" ON "planning_clarification_sessions" ("id", "user_id");

CREATE TABLE "planning_clarification_instances" (
  "id" text PRIMARY KEY NOT NULL, "session_id" text NOT NULL REFERENCES "planning_clarification_sessions"("id") ON DELETE CASCADE, "deliverable_id" text NOT NULL, "kind" text NOT NULL, "scope_id" text NOT NULL, "state" text NOT NULL DEFAULT 'collecting', "revision" integer NOT NULL DEFAULT 1, "profile" jsonb NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_instance_state_check" CHECK ("state" IN ('collecting','ready','claimed','completed','abandoned')), CONSTRAINT "planning_clarification_instance_revision_check" CHECK ("revision" >= 1), CONSTRAINT "planning_clarification_instance_profile_check" CHECK (jsonb_typeof("profile") = 'object')
);
CREATE UNIQUE INDEX "planning_clarification_instance_session_deliverable_idx" ON "planning_clarification_instances" ("session_id", "deliverable_id");
CREATE UNIQUE INDEX "planning_clarification_instance_id_session_idx" ON "planning_clarification_instances" ("id", "session_id");

CREATE TABLE "planning_clarification_values" (
  "id" text PRIMARY KEY NOT NULL, "session_id" text NOT NULL REFERENCES "planning_clarification_sessions"("id") ON DELETE CASCADE, "key" text NOT NULL, "value" text NOT NULL, "scope_id" text NOT NULL, "schema_version" text NOT NULL, "precedence" text NOT NULL, "source_message_id" text NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE, "source_message_ordinal" integer NOT NULL, "start_offset" integer NOT NULL, "end_offset" integer NOT NULL, "evidence_digest" text NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_value_precedence_check" CHECK ("precedence" IN ('nearest_ancestor','explicit_compatible')), CONSTRAINT "planning_clarification_value_offsets_check" CHECK ("source_message_ordinal" >= 1 AND "start_offset" >= 0 AND "end_offset" > "start_offset"), CONSTRAINT "planning_clarification_value_digest_check" CHECK ("evidence_digest" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "planning_clarification_value_evidence_idx" ON "planning_clarification_values" ("session_id", "key", "scope_id", "source_message_id", "start_offset", "end_offset");
CREATE FUNCTION "validate_planning_clarification_value_owner"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "planning_clarification_sessions" AS session
    JOIN "messages" AS message ON message.id = NEW.source_message_id
    WHERE session.id = NEW.session_id AND message.conversation_id = session.conversation_id
  ) THEN RAISE EXCEPTION 'clarification evidence message must belong to session conversation'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "planning_clarification_value_owner" BEFORE INSERT OR UPDATE ON "planning_clarification_values" FOR EACH ROW EXECUTE FUNCTION "validate_planning_clarification_value_owner"();

CREATE TABLE "planning_clarification_assumptions" (
  "id" text PRIMARY KEY NOT NULL, "session_id" text NOT NULL REFERENCES "planning_clarification_sessions"("id") ON DELETE CASCADE, "instance_id" text NOT NULL REFERENCES "planning_clarification_instances"("id") ON DELETE CASCADE,
  "key" text NOT NULL, "value" text NOT NULL, "scope_id" text NOT NULL, "schema_version" text NOT NULL, "disclosed" boolean NOT NULL, "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_assumption_value_check" CHECK (length(btrim("value")) > 0)
);
CREATE UNIQUE INDEX "planning_clarification_assumption_instance_key_idx" ON "planning_clarification_assumptions" ("instance_id", "key");
ALTER TABLE "planning_clarification_assumptions" ADD CONSTRAINT "planning_clarification_assumption_instance_session_fk" FOREIGN KEY ("instance_id", "session_id") REFERENCES "planning_clarification_instances"("id", "session_id") ON DELETE CASCADE;

CREATE TABLE "planning_clarification_field_states" (
  "id" text PRIMARY KEY NOT NULL, "session_id" text NOT NULL REFERENCES "planning_clarification_sessions"("id") ON DELETE CASCADE, "instance_id" text NOT NULL REFERENCES "planning_clarification_instances"("id") ON DELETE CASCADE,
  "key" text NOT NULL, "state" text NOT NULL, "candidates" jsonb NOT NULL DEFAULT '[]'::jsonb, "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_field_state_check" CHECK ("state" IN ('missing','ambiguous','resolved','assumed','declined')),
  CONSTRAINT "planning_clarification_field_state_candidates_check" CHECK (jsonb_typeof("candidates") = 'array')
);
CREATE UNIQUE INDEX "planning_clarification_field_state_instance_key_idx" ON "planning_clarification_field_states" ("instance_id", "key");
ALTER TABLE "planning_clarification_field_states" ADD CONSTRAINT "planning_clarification_field_state_instance_session_fk" FOREIGN KEY ("instance_id", "session_id") REFERENCES "planning_clarification_instances"("id", "session_id") ON DELETE CASCADE;

CREATE TABLE "planning_clarification_claims" (
  "id" text PRIMARY KEY NOT NULL, "session_id" text NOT NULL REFERENCES "planning_clarification_sessions"("id") ON DELETE CASCADE, "instance_id" text NOT NULL REFERENCES "planning_clarification_instances"("id") ON DELETE CASCADE, "command_id" text NOT NULL REFERENCES "ai_ask_commands"("id") ON DELETE CASCADE, "session_revision" integer NOT NULL, "content_revision" integer NOT NULL, "state" text NOT NULL DEFAULT 'live', "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_claim_state_check" CHECK ("state" IN ('live','completed','abandoned')), CONSTRAINT "planning_clarification_claim_revision_check" CHECK ("session_revision" >= 1 AND "content_revision" >= 0)
);
CREATE UNIQUE INDEX "planning_clarification_live_claim_instance_idx" ON "planning_clarification_claims" ("instance_id") WHERE "state" = 'live';
CREATE UNIQUE INDEX "planning_clarification_claim_command_instance_idx" ON "planning_clarification_claims" ("command_id", "instance_id");
ALTER TABLE "planning_clarification_claims" ADD CONSTRAINT "planning_clarification_claim_instance_session_fk" FOREIGN KEY ("instance_id", "session_id") REFERENCES "planning_clarification_instances"("id", "session_id") ON DELETE CASCADE;
