-- This is a clean-break migration, not durable-data support. Stop before PostgreSQL's
-- implicit CHECK validation failure so operators can explicitly reset and reseed a
-- confirmed disposable target rather than partially applying the actor boundary.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "id" IN ('system-ai-orchestration', 'system-knowledge-pipeline', 'system-trip-planning', 'system-facebook-capture', 'system-youtube-capture')
  ) THEN
    RAISE EXCEPTION 'Migration 0072 requires an explicit reset and reseed: historic system executor users were found'
      USING DETAIL = 'This clean-break migration does not support durable-data upgrades containing reserved system user IDs.',
            HINT = 'For a confirmed disposable database, reset it, run migrations, then run db:seed. Do not continue this migration against durable data.';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_no_system_executor_id_check" CHECK ("id" not in ('system-ai-orchestration', 'system-knowledge-pipeline', 'system-trip-planning', 'system-facebook-capture', 'system-youtube-capture'));
