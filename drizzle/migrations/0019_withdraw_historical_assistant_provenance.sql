-- Disposable/reset-only Story 11.2 cutover. Before this migration starts, the
-- operator must stop every old terminal/evaluation provenance writer and set
-- this same-session admission flag. The exclusive lock drains the coordinated
-- v1 writers; the table lock holds legacy inserts until the new trigger rejects
-- them. A missing or altered flag aborts before cutover_at is captured or any
-- schema change can commit.
SELECT pg_advisory_xact_lock(918040112);
DO $$
BEGIN
  IF current_setting('xuyenviet.provenance_old_writers_quiesced', true) IS DISTINCT FROM 'v1' THEN
    RAISE EXCEPTION 'assistant provenance cutover requires quiesced old terminal/evaluation writers';
  END IF;
END $$;
LOCK TABLE "assistant_response_provenance" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "assistant_response_provenance" ADD COLUMN "availability" text NOT NULL DEFAULT 'available';
ALTER TABLE "assistant_response_provenance" ADD COLUMN "withdrawn_at" timestamp;
ALTER TABLE "assistant_response_provenance" ADD COLUMN "withdrawal_reason" text;
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_availability_check" CHECK ("availability" in ('available', 'withdrawn'));
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_withdrawal_shape_check" CHECK (("availability" = 'available' and "withdrawn_at" is null and "withdrawal_reason" is null) or ("availability" = 'withdrawn' and "withdrawn_at" is not null and "withdrawal_reason" in ('withdrawn', 'inaccessible', 'removed')));
CREATE INDEX "assistant_response_provenance_created_id_idx" ON "assistant_response_provenance" ("created_at", "id");
CREATE FUNCTION "require_coordinated_assistant_provenance_writer"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('xuyenviet.provenance_writer_contract', true) IS DISTINCT FROM 'v1' THEN
    RAISE EXCEPTION 'assistant provenance inserts require the coordinated v1 writer';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "assistant_response_provenance_coordinated_writer"
  BEFORE INSERT ON "assistant_response_provenance"
  FOR EACH ROW WHEN (NEW."source_category" = 'knowledge')
  EXECUTE FUNCTION "require_coordinated_assistant_provenance_writer"();
CREATE TABLE "assistant_provenance_withdrawal_backfill_state" (
  "contract_key" text PRIMARY KEY,
  "cutover_at" timestamp NOT NULL,
  "old_writers_quiesced_at" timestamp NOT NULL,
  "old_writers_admission" text NOT NULL,
  "cursor_created_at" timestamp,
  "cursor_id" text,
  "completed_at" timestamp,
  "failed_at" timestamp,
  "failure_code" text,
  CONSTRAINT "assistant_provenance_withdrawal_backfill_state_key_check" CHECK ("contract_key" = 'v1'),
  CONSTRAINT "assistant_provenance_withdrawal_backfill_state_admission_check" CHECK ("old_writers_admission" = 'old_terminal_evaluation_writers_quiesced_v1'),
  CONSTRAINT "assistant_provenance_withdrawal_backfill_state_cursor_check" CHECK (("cursor_created_at" is null and "cursor_id" is null) or ("cursor_created_at" is not null and "cursor_id" is not null)),
  CONSTRAINT "assistant_provenance_withdrawal_backfill_state_failure_check" CHECK ("failure_code" is null or "failure_code" in ('unclassifiable_anchor', 'owner_relation_unresolved'))
);
INSERT INTO "assistant_provenance_withdrawal_backfill_state" ("contract_key", "cutover_at", "old_writers_quiesced_at", "old_writers_admission")
VALUES ('v1', transaction_timestamp(), transaction_timestamp(), 'old_terminal_evaluation_writers_quiesced_v1');
