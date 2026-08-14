CREATE OR REPLACE FUNCTION "prevent_youtube_discovery_run_snapshot_change"() RETURNS trigger AS $$
BEGIN
  IF OLD."policy_version_id" IS DISTINCT FROM NEW."policy_version_id" OR OLD."max_retry_attempts" IS DISTINCT FROM NEW."max_retry_attempts" OR OLD."retry_delay_minutes" IS DISTINCT FROM NEW."retry_delay_minutes" OR OLD."max_concurrent_runs" IS DISTINCT FROM NEW."max_concurrent_runs" OR OLD."query_text" IS DISTINCT FROM NEW."query_text" THEN
    RAISE EXCEPTION 'YouTube Discovery run snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
