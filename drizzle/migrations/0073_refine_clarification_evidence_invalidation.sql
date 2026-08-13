CREATE OR REPLACE FUNCTION "invalidate_planning_clarification_evidence"() RETURNS trigger AS $$
BEGIN
  UPDATE "planning_clarification_claims" AS claim SET state = 'abandoned'
  FROM "planning_clarification_values" AS value
  WHERE value.source_message_id = OLD.id AND value.session_id = claim.session_id AND claim.state = 'live';
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
