ALTER TABLE "planning_clarification_claims" ADD COLUMN IF NOT EXISTS "user_id" text;
ALTER TABLE "planning_clarification_claims" ADD COLUMN IF NOT EXISTS "conversation_id" text;
DELETE FROM "planning_clarification_claims" WHERE "user_id" IS NULL OR "conversation_id" IS NULL;
ALTER TABLE "planning_clarification_claims" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "planning_clarification_claims" ALTER COLUMN "conversation_id" SET NOT NULL;
ALTER TABLE "planning_clarification_claims" ADD CONSTRAINT "planning_clarification_claim_session_owner_fk" FOREIGN KEY ("session_id", "user_id") REFERENCES "planning_clarification_sessions"("id", "user_id") ON DELETE CASCADE;
ALTER TABLE "planning_clarification_claims" ADD CONSTRAINT "planning_clarification_claim_command_owner_fk" FOREIGN KEY ("command_id", "user_id") REFERENCES "ai_ask_commands"("id", "user_id") ON DELETE CASCADE;
ALTER TABLE "planning_clarification_claims" ADD CONSTRAINT "planning_clarification_claim_conversation_owner_fk" FOREIGN KEY ("conversation_id", "user_id") REFERENCES "conversations"("id", "user_id") ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_planning_clarification_transition"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'planning_clarification_sessions' AND TG_OP = 'UPDATE' AND NOT (
    (OLD.state = 'active' AND NEW.state IN ('active','superseded')) OR (OLD.state = 'active' AND NEW.state = 'completed' AND NOT EXISTS (SELECT 1 FROM "planning_clarification_instances" WHERE "session_id" = OLD.id AND "state" NOT IN ('completed','abandoned'))) OR (OLD.state IN ('superseded','completed') AND NEW.state = OLD.state)
  ) THEN RAISE EXCEPTION 'invalid clarification session transition'; END IF;
  IF TG_TABLE_NAME = 'planning_clarification_instances' AND TG_OP = 'UPDATE' AND NOT (
    (OLD.state = 'collecting' AND NEW.state IN ('collecting','ready','abandoned')) OR (OLD.state = 'ready' AND NEW.state IN ('ready','collecting','claimed','abandoned')) OR (OLD.state = 'claimed' AND NEW.state IN ('claimed','completed','abandoned')) OR (OLD.state IN ('completed','abandoned') AND NEW.state = OLD.state)
  ) THEN RAISE EXCEPTION 'invalid clarification instance transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "planning_clarification_session_transition" BEFORE UPDATE ON "planning_clarification_sessions" FOR EACH ROW EXECUTE FUNCTION "enforce_planning_clarification_transition"();
CREATE TRIGGER "planning_clarification_instance_transition" BEFORE UPDATE ON "planning_clarification_instances" FOR EACH ROW EXECUTE FUNCTION "enforce_planning_clarification_transition"();

CREATE OR REPLACE FUNCTION "invalidate_planning_clarification_evidence"() RETURNS trigger AS $$
BEGIN
  UPDATE "planning_clarification_claims" AS claim SET state = 'abandoned'
  FROM "planning_clarification_values" AS value
  WHERE value.source_message_id = OLD.id AND value.session_id = claim.session_id AND value.session_id = claim.session_id AND claim.state = 'live';
  UPDATE "planning_clarification_instances" AS instance SET state = 'abandoned', revision = revision + 1, updated_at = now()
  FROM "planning_clarification_values" AS value
  WHERE value.source_message_id = OLD.id AND value.session_id = instance.session_id AND instance.state = 'claimed';
  UPDATE "planning_clarification_instances" AS instance SET state = 'collecting', revision = revision + 1, updated_at = now()
  FROM "planning_clarification_values" AS value
  WHERE value.source_message_id = OLD.id AND value.session_id = instance.session_id AND instance.state = 'ready';
  DELETE FROM "planning_clarification_field_states" AS field_state USING "planning_clarification_values" AS value WHERE value.source_message_id = OLD.id AND field_state.session_id = value.session_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "planning_clarification_evidence_message_delete" BEFORE DELETE ON "messages" FOR EACH ROW EXECUTE FUNCTION "invalidate_planning_clarification_evidence"();
