CREATE OR REPLACE FUNCTION "invalidate_planning_clarification_evidence"() RETURNS trigger AS $$
DECLARE
  affected_instance_ids text[];
  affected_session_ids text[];
  affected_field_state_ids text[];
BEGIN
  SELECT array_agg(DISTINCT field_state.id), array_agg(DISTINCT field_state.instance_id), array_agg(DISTINCT field_state.session_id)
    INTO affected_field_state_ids, affected_instance_ids, affected_session_ids
    FROM "planning_clarification_field_states" AS field_state
    JOIN "planning_clarification_values" AS value
      ON value.session_id = field_state.session_id AND value.key = field_state.key
   WHERE value.source_message_id = OLD.id
     AND field_state.candidates @> jsonb_build_array(jsonb_build_object('value', value.value, 'scopeId', value.scope_id));
  IF affected_instance_ids IS NULL THEN RETURN OLD; END IF;

  UPDATE "planning_clarification_claims" AS claim
     SET state = 'abandoned'
   WHERE claim.instance_id = ANY(affected_instance_ids) AND claim.state = 'live';

  UPDATE "planning_clarification_instances" AS instance
     SET state = 'abandoned', revision = instance.revision + 1, updated_at = now()
   WHERE instance.id = ANY(affected_instance_ids) AND instance.state = 'claimed';

  WITH affected AS (
    SELECT field_state.id, field_state.session_id, field_state.key
    FROM "planning_clarification_field_states" AS field_state
    WHERE field_state.id = ANY(affected_field_state_ids)
  ), remaining AS (
    SELECT affected.id,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('value', value.value, 'scopeId', value.scope_id)) FILTER (WHERE value.id IS NOT NULL), '[]'::jsonb) AS candidates,
           count(DISTINCT (value.value, value.scope_id)) FILTER (WHERE value.id IS NOT NULL) AS candidate_count
      FROM affected
      LEFT JOIN "planning_clarification_values" AS value
        ON value.session_id = affected.session_id
       AND value.key = affected.key
       AND value.source_message_id <> OLD.id
     GROUP BY affected.id
  )
  UPDATE "planning_clarification_field_states" AS field_state
     SET candidates = remaining.candidates,
         state = CASE WHEN remaining.candidate_count = 0 THEN 'missing' WHEN remaining.candidate_count = 1 THEN 'resolved' ELSE 'ambiguous' END,
         updated_at = now()
    FROM remaining
   WHERE field_state.id = remaining.id;

  UPDATE "planning_clarification_instances" AS instance
     SET state = CASE WHEN NOT EXISTS (
           SELECT 1 FROM "planning_clarification_field_states" AS field_state
            WHERE field_state.instance_id = instance.id AND field_state.state IN ('missing', 'ambiguous')
         ) THEN 'ready' ELSE 'collecting' END,
         revision = instance.revision + 1,
         updated_at = now()
   WHERE instance.id = ANY(affected_instance_ids) AND instance.state = 'ready';

  UPDATE "planning_clarification_sessions" AS session
     SET state = 'completed', revision = session.revision + 1, updated_at = now()
   WHERE session.id = ANY(affected_session_ids)
     AND session.state = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM "planning_clarification_instances" AS instance
        WHERE instance.session_id = session.id AND instance.state IN ('collecting', 'ready', 'claimed')
     );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
