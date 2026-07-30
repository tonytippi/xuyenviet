ALTER TABLE "assistant_provenance_withdrawal_backfill_state"
  ADD CONSTRAINT "assistant_provenance_withdrawal_backfill_state_terminal_check"
  CHECK (("completed_at" is null or ("failed_at" is null and "failure_code" is null))
    and (("failed_at" is null and "failure_code" is null) or ("failed_at" is not null and "failure_code" is not null)));
