-- Reserve the non-human audit identity used only by unattended Facebook capture.
-- It must never be repurposed as a login account or bound to an operator.
DO $$
DECLARE
  reserved_id constant text := 'system-facebook-capture';
  reserved_email constant text := 'system-facebook-capture@xuyenviet.invalid';
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
    VALUES (reserved_id, 'System Facebook Capture', reserved_email);
  ELSIF matching_count <> 1 OR exact_identity_count <> 1 THEN
    RAISE EXCEPTION 'Reserved system Facebook capture identity collides with an existing user';
  END IF;
END $$;
