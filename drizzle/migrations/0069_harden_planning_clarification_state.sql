UPDATE "conversations" AS conversation SET "content_revision" = GREATEST("content_revision", COALESCE((SELECT max(message."ordinal") FROM "messages" AS message WHERE message."conversation_id" = conversation."id"), 0));

ALTER TABLE "planning_clarification_sessions" ADD COLUMN IF NOT EXISTS "command_id" text REFERENCES "ai_ask_commands"("id") ON DELETE CASCADE;
ALTER TABLE "planning_clarification_sessions" ADD COLUMN IF NOT EXISTS "conversation_lifecycle_version" integer;
ALTER TABLE "planning_clarification_sessions" ADD COLUMN IF NOT EXISTS "trip_project_aggregate_version" integer;
ALTER TABLE "planning_clarification_sessions" ADD COLUMN IF NOT EXISTS "proposal_id" text;
ALTER TABLE "planning_clarification_sessions" ADD COLUMN IF NOT EXISTS "proposal_version" integer;

DROP TRIGGER IF EXISTS "planning_clarification_attempts_immutable" ON "planning_clarification_attempts";
CREATE TRIGGER "planning_clarification_attempts_immutable" BEFORE UPDATE ON "planning_clarification_attempts" FOR EACH ROW EXECUTE FUNCTION "reject_planning_clarification_attempt_mutation"();

CREATE TABLE IF NOT EXISTS "planning_clarification_field_states" (
  "id" text PRIMARY KEY NOT NULL, "session_id" text NOT NULL REFERENCES "planning_clarification_sessions"("id") ON DELETE CASCADE, "instance_id" text NOT NULL REFERENCES "planning_clarification_instances"("id") ON DELETE CASCADE,
  "key" text NOT NULL, "state" text NOT NULL, "candidates" jsonb NOT NULL DEFAULT '[]'::jsonb, "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planning_clarification_field_state_check" CHECK ("state" IN ('missing','ambiguous','resolved','assumed','declined')),
  CONSTRAINT "planning_clarification_field_state_candidates_check" CHECK (jsonb_typeof("candidates") = 'array')
);
CREATE UNIQUE INDEX IF NOT EXISTS "planning_clarification_field_state_instance_key_idx" ON "planning_clarification_field_states" ("instance_id", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "planning_clarification_instance_id_session_idx" ON "planning_clarification_instances" ("id", "session_id");
ALTER TABLE "planning_clarification_assumptions" DROP CONSTRAINT IF EXISTS "planning_clarification_assumption_instance_session_fk";
ALTER TABLE "planning_clarification_assumptions" ADD CONSTRAINT "planning_clarification_assumption_instance_session_fk" FOREIGN KEY ("instance_id", "session_id") REFERENCES "planning_clarification_instances"("id", "session_id") ON DELETE CASCADE;
ALTER TABLE "planning_clarification_claims" DROP CONSTRAINT IF EXISTS "planning_clarification_claim_instance_session_fk";
ALTER TABLE "planning_clarification_claims" ADD CONSTRAINT "planning_clarification_claim_instance_session_fk" FOREIGN KEY ("instance_id", "session_id") REFERENCES "planning_clarification_instances"("id", "session_id") ON DELETE CASCADE;
ALTER TABLE "planning_clarification_field_states" DROP CONSTRAINT IF EXISTS "planning_clarification_field_state_instance_session_fk";
ALTER TABLE "planning_clarification_field_states" ADD CONSTRAINT "planning_clarification_field_state_instance_session_fk" FOREIGN KEY ("instance_id", "session_id") REFERENCES "planning_clarification_instances"("id", "session_id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION "validate_planning_clarification_value_owner"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "planning_clarification_sessions" AS session JOIN "messages" AS message ON message.id = NEW.source_message_id WHERE session.id = NEW.session_id AND message.conversation_id = session.conversation_id) THEN RAISE EXCEPTION 'clarification evidence message must belong to session conversation'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "planning_clarification_value_owner" ON "planning_clarification_values";
CREATE TRIGGER "planning_clarification_value_owner" BEFORE INSERT OR UPDATE ON "planning_clarification_values" FOR EACH ROW EXECUTE FUNCTION "validate_planning_clarification_value_owner"();
