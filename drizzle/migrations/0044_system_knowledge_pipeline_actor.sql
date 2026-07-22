-- The reserved identity must never overwrite, repurpose, or silently bind to a person.
DO $$
DECLARE
  reserved_id constant text := 'system-knowledge-pipeline';
  reserved_email constant text := 'system-knowledge-pipeline@xuyenviet.invalid';
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
    VALUES (reserved_id, 'System Knowledge Pipeline', reserved_email);
  ELSIF matching_count <> 1 OR exact_identity_count <> 1 THEN
    RAISE EXCEPTION 'Reserved system knowledge pipeline identity collides with an existing user';
  END IF;
END $$;
