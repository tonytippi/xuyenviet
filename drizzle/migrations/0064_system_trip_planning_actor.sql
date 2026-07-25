-- Story 7.5: reserve the canonical system actor for Trip Planning, mirroring
-- migration 0044 (system-knowledge-pipeline) verbatim. The audit_events and
-- trip_plan_change_history rows written by expireTripChangeProposal use
-- actorUserId = 'system-trip-planning' (FK-restricted to users.id), so a
-- reserved system user row must exist before any expire row can be written.
-- This is a DATA migration, not a schema migration: it changes no tables,
-- columns, constraints, or indexes, so `drizzle-kit generate` reports no
-- schema drift. The reserved identity must never overwrite, repurpose, or
-- silently bind to a person.
DO $$
DECLARE
  reserved_id constant text := 'system-trip-planning';
  reserved_email constant text := 'system-trip-planning@xuyenviet.invalid';
  matching_count integer;
  exact_identity_count integer;
BEGIN
  SELECT
    count(*),
    count(*) filter (where id = reserved_id and email = reserved_email)
  INTO matching_count, exact_identity_count
  FROM (
    SELECT id, email
    FROM users
    WHERE id = reserved_id OR email = reserved_email
    FOR UPDATE
  ) AS matching_users;

  IF matching_count = 0 THEN
    INSERT INTO users (id, name, email)
    VALUES (reserved_id, 'System Trip Planning', reserved_email);
  ELSIF matching_count <> 1 OR exact_identity_count <> 1 THEN
    RAISE EXCEPTION 'Reserved system trip planning identity collides with an existing user';
  END IF;
END $$;
