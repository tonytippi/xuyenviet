CREATE OR REPLACE FUNCTION "reject_planning_clarification_session_identity_mutation"() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.trip_project_id IS DISTINCT FROM OLD.trip_project_id
    OR NEW.command_id IS DISTINCT FROM OLD.command_id
    OR NEW.conversation_lifecycle_version IS DISTINCT FROM OLD.conversation_lifecycle_version
    OR NEW.trip_project_aggregate_version IS DISTINCT FROM OLD.trip_project_aggregate_version
    OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
    OR NEW.proposal_version IS DISTINCT FROM OLD.proposal_version
    OR NEW.graph_digest IS DISTINCT FROM OLD.graph_digest
    OR NEW.plan_attempt_id IS DISTINCT FROM OLD.plan_attempt_id
    OR NEW.profile_version IS DISTINCT FROM OLD.profile_version
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.comparator_version IS DISTINCT FROM OLD.comparator_version
    OR NEW.scope_graph IS DISTINCT FROM OLD.scope_graph
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'planning clarification session identity is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "planning_clarification_session_identity_immutable" ON "planning_clarification_sessions";
CREATE TRIGGER "planning_clarification_session_identity_immutable" BEFORE UPDATE ON "planning_clarification_sessions" FOR EACH ROW EXECUTE FUNCTION "reject_planning_clarification_session_identity_mutation"();
