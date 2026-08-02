UPDATE "domain_outbox"
SET "failure_code" = 'unknown_failure'
WHERE "status" = 'failed' AND "failure_code" IS NULL;
--> statement-breakpoint
ALTER TABLE "domain_outbox"
ADD CONSTRAINT "domain_outbox_failed_failure_code_check"
CHECK ("status" <> 'failed' OR "failure_code" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "domain_outbox"
ADD CONSTRAINT "domain_outbox_status_check"
CHECK ("domain_outbox"."status" IN ('pending', 'processing', 'completed', 'failed'));
--> statement-breakpoint
ALTER TABLE "domain_outbox"
ADD CONSTRAINT "domain_outbox_non_processing_claim_check"
CHECK ("domain_outbox"."status" = 'processing' OR ("domain_outbox"."claimed_by" IS NULL AND "domain_outbox"."claimed_at" IS NULL AND "domain_outbox"."lease_expires_at" IS NULL AND "domain_outbox"."fencing_token" IS NULL));
--> statement-breakpoint
ALTER TABLE "domain_outbox"
DROP CONSTRAINT "domain_outbox_terminal_claim_check";
