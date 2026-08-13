CREATE OR REPLACE FUNCTION "enforce_planning_clarification_transition"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'planning_clarification_sessions' AND TG_OP = 'UPDATE' AND NOT (
    (OLD.state = 'active' AND NEW.state IN ('active','superseded')) OR
    (OLD.state = 'active' AND NEW.state = 'completed' AND NOT EXISTS (SELECT 1 FROM "planning_clarification_instances" WHERE "session_id" = OLD.id AND "state" NOT IN ('completed','abandoned'))) OR
    (OLD.state IN ('superseded','completed') AND NEW.state = OLD.state)
  ) THEN RAISE EXCEPTION 'invalid clarification session transition'; END IF;
  IF TG_TABLE_NAME = 'planning_clarification_instances' AND TG_OP = 'UPDATE' AND NOT (
    (OLD.state = 'collecting' AND NEW.state IN ('collecting','ready','abandoned')) OR (OLD.state = 'ready' AND NEW.state IN ('ready','collecting','claimed','abandoned')) OR (OLD.state = 'claimed' AND NEW.state IN ('claimed','completed','abandoned')) OR (OLD.state IN ('completed','abandoned') AND NEW.state = OLD.state)
  ) THEN RAISE EXCEPTION 'invalid clarification instance transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "invalidate_planning_clarification_evidence"() RETURNS trigger AS $$
DECLARE
  affected_instance_ids text[];
  affected_session_ids text[];
  affected_field_state_ids text[];
BEGIN
  SELECT array_agg(DISTINCT field_state.id), array_agg(DISTINCT field_state.instance_id), array_agg(DISTINCT field_state.session_id)
    INTO affected_field_state_ids, affected_instance_ids, affected_session_ids
    FROM "planning_clarification_field_states" AS field_state
    JOIN "planning_clarification_instances" AS instance ON instance.id = field_state.instance_id
    JOIN "planning_clarification_sessions" AS session ON session.id = field_state.session_id
    JOIN "planning_clarification_values" AS value ON value.session_id = field_state.session_id AND value.key = field_state.key
   WHERE value.source_message_id = OLD.id
     AND field_state.candidates @> jsonb_build_array(jsonb_build_object('value', value.value, 'scopeId', value.scope_id))
     AND (EXISTS (
       WITH RECURSIVE ancestors(id) AS (
         SELECT instance.scope_id UNION ALL
         SELECT node->>'parentId' FROM jsonb_array_elements(session.scope_graph) node JOIN ancestors ON node->>'id' = ancestors.id WHERE node->>'parentId' IS NOT NULL
       ) SELECT 1 FROM ancestors WHERE id = value.scope_id
     ) OR EXISTS (SELECT 1 FROM jsonb_array_elements(session.scope_graph) node WHERE node->>'id' = instance.scope_id AND node->'overlapWith' ? value.scope_id));
  IF affected_instance_ids IS NULL THEN RETURN OLD; END IF;

  UPDATE "planning_clarification_claims" SET state = 'abandoned' WHERE instance_id = ANY(affected_instance_ids) AND state = 'live';
  UPDATE "planning_clarification_instances" SET state = 'abandoned', revision = revision + 1, updated_at = now() WHERE id = ANY(affected_instance_ids) AND state = 'claimed';

  WITH affected AS (
    SELECT field_state.id, field_state.session_id, field_state.key, instance.scope_id, session.scope_graph
      FROM "planning_clarification_field_states" field_state
      JOIN "planning_clarification_instances" instance ON instance.id = field_state.instance_id
      JOIN "planning_clarification_sessions" session ON session.id = field_state.session_id
     WHERE field_state.id = ANY(affected_field_state_ids)
  ), remaining AS (
    SELECT affected.id,
           coalesce(jsonb_agg(DISTINCT jsonb_build_object('value', value.value, 'scopeId', value.scope_id)) FILTER (WHERE value.id IS NOT NULL), '[]'::jsonb) candidates,
           count(DISTINCT (value.value, value.scope_id)) FILTER (WHERE value.id IS NOT NULL) candidate_count
      FROM affected LEFT JOIN "planning_clarification_values" value ON value.session_id = affected.session_id AND value.key = affected.key AND value.source_message_id <> OLD.id
       AND (EXISTS (WITH RECURSIVE ancestors(id) AS (SELECT affected.scope_id UNION ALL SELECT node->>'parentId' FROM jsonb_array_elements(affected.scope_graph) node JOIN ancestors ON node->>'id' = ancestors.id WHERE node->>'parentId' IS NOT NULL) SELECT 1 FROM ancestors WHERE id = value.scope_id) OR EXISTS (SELECT 1 FROM jsonb_array_elements(affected.scope_graph) node WHERE node->>'id' = affected.scope_id AND node->'overlapWith' ? value.scope_id))
     GROUP BY affected.id
  ) UPDATE "planning_clarification_field_states" field_state SET candidates = remaining.candidates, state = CASE WHEN remaining.candidate_count = 0 THEN 'missing' WHEN remaining.candidate_count = 1 THEN 'resolved' ELSE 'ambiguous' END, updated_at = now() FROM remaining WHERE field_state.id = remaining.id;

  UPDATE "planning_clarification_instances" instance SET state = CASE WHEN NOT EXISTS (
    SELECT 1 FROM "planning_clarification_field_states" field_state WHERE field_state.instance_id = instance.id AND field_state.state IN ('missing','ambiguous') AND
      ((instance.kind = 'itinerary' AND field_state.key IN ('direction','party','vehicle')) OR (instance.kind = 'route_comparison' AND field_state.key IN ('direction','vehicle','destination')) OR (instance.kind IN ('food','activity') AND field_state.key IN ('party','destination')) OR (instance.kind = 'accommodation' AND field_state.key IN ('party','destination')))
  ) THEN 'ready' ELSE 'collecting' END, revision = instance.revision + 1, updated_at = now() WHERE instance.id = ANY(affected_instance_ids) AND instance.state = 'ready';

  UPDATE "planning_clarification_sessions" session SET state = 'completed', revision = revision + 1, updated_at = now() WHERE session.id = ANY(affected_session_ids) AND session.state = 'active' AND NOT EXISTS (SELECT 1 FROM "planning_clarification_instances" instance WHERE instance.session_id = session.id AND instance.state NOT IN ('completed','abandoned'));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
