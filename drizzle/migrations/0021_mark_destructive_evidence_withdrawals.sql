ALTER TABLE "knowledge_card_evidence" ADD COLUMN "withdrawal_reason" text;
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_withdrawal_reason_check" CHECK ("withdrawal_reason" is null or "withdrawal_reason" in ('withdrawn', 'inaccessible', 'removed'));
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_withdrawal_shape_check" CHECK ("state" = 'removed' or "withdrawal_reason" is null);
