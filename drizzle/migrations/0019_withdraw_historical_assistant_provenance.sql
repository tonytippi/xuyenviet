-- This migration is a release gate: old provenance writers must be quiesced before it runs.
BEGIN;
SELECT pg_advisory_xact_lock(918040112);
LOCK TABLE "assistant_response_provenance" IN ACCESS EXCLUSIVE MODE;
ALTER TABLE "assistant_response_provenance" ADD COLUMN "availability" text NOT NULL DEFAULT 'available';
ALTER TABLE "assistant_response_provenance" ADD COLUMN "withdrawn_at" timestamp;
ALTER TABLE "assistant_response_provenance" ADD COLUMN "withdrawal_reason" text;
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_availability_check" CHECK ("availability" in ('available', 'withdrawn'));
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_withdrawal_shape_check" CHECK (("availability" = 'available' and "withdrawn_at" is null and "withdrawal_reason" is null) or ("availability" = 'withdrawn' and "withdrawn_at" is not null and "withdrawal_reason" in ('withdrawn', 'inaccessible', 'removed')));
CREATE INDEX "assistant_response_provenance_created_id_idx" ON "assistant_response_provenance" ("created_at", "id");
CREATE TABLE "assistant_provenance_withdrawal_backfill_state" (
  "contract_key" text PRIMARY KEY,
  "cutover_at" timestamp NOT NULL,
  "cursor_created_at" timestamp,
  "cursor_id" text,
  "completed_at" timestamp,
  "failed_at" timestamp,
  "failure_code" text,
  CONSTRAINT "assistant_provenance_withdrawal_backfill_state_key_check" CHECK ("contract_key" = 'v1'),
  CONSTRAINT "assistant_provenance_withdrawal_backfill_state_cursor_check" CHECK (("cursor_created_at" is null and "cursor_id" is null) or ("cursor_created_at" is not null and "cursor_id" is not null)),
  CONSTRAINT "assistant_provenance_withdrawal_backfill_state_failure_check" CHECK ("failure_code" is null or "failure_code" in ('unclassifiable_anchor', 'owner_relation_unresolved'))
);
INSERT INTO "assistant_provenance_withdrawal_backfill_state" ("contract_key", "cutover_at") VALUES ('v1', transaction_timestamp());
COMMIT;
