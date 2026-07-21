ALTER TABLE "knowledge_cards" ADD COLUMN "publication_state" text DEFAULT 'suppressed' NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "knowledge_state" text DEFAULT 'uncertain' NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "review_state" text DEFAULT 'ai_recommended' NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "verification_state" text DEFAULT 'not_required' NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "evidence_set_revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD COLUMN "current_judge_summary" text DEFAULT 'Current judgment has not been completed.' NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_publication_state_check" CHECK ("knowledge_cards"."publication_state" in ('active', 'suppressed', 'archived'));
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_knowledge_state_check" CHECK ("knowledge_cards"."knowledge_state" in ('community_observation', 'community_pattern', 'conditional', 'uncertain', 'conflicted', 'confirmed', 'superseded'));
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_review_state_check" CHECK ("knowledge_cards"."review_state" in ('none', 'ai_recommended', 'in_review', 'reviewed'));
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_verification_state_check" CHECK ("knowledge_cards"."verification_state" in ('not_required', 'required', 'corroborated', 'failed'));
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_content_version_check" CHECK ("knowledge_cards"."content_version" >= 1);
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_evidence_set_revision_check" CHECK ("knowledge_cards"."evidence_set_revision" >= 1);
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_conditions_array_check" CHECK (jsonb_typeof("knowledge_cards"."conditions") = 'array');
--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_judge_summary_check" CHECK (length(btrim("knowledge_cards"."current_judge_summary")) between 1 and 1000);
--> statement-breakpoint
UPDATE "knowledge_cards"
SET
  "publication_state" = CASE
    WHEN "status" = 'approved' AND "needs_review" = false THEN 'active'
    WHEN "status" = 'archived' THEN 'archived'
    ELSE 'suppressed'
  END,
  "knowledge_state" = 'uncertain',
  "review_state" = CASE
    WHEN "status" = 'approved' AND "needs_review" = false THEN 'reviewed'
    WHEN "status" = 'draft' OR "needs_review" = true THEN 'ai_recommended'
    ELSE 'reviewed'
  END,
  "verification_state" = 'not_required',
  "content_version" = GREATEST("content_version", 1),
  "evidence_set_revision" = GREATEST("evidence_set_revision", 1),
  "conditions" = '[]'::jsonb,
  "current_judge_summary" = 'Legacy state migration; bounded evidence is required before traveler retrieval.';
--> statement-breakpoint
CREATE TABLE "knowledge_card_state_migration_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "reason" text NOT NULL,
  "card_count" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_card_state_migration_reports_reason_check" CHECK (length(btrim("reason")) between 1 and 160),
  CONSTRAINT "knowledge_card_state_migration_reports_count_check" CHECK ("card_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_state_migration_reports_reason_idx" ON "knowledge_card_state_migration_reports" USING btree ("reason");
--> statement-breakpoint
INSERT INTO "knowledge_card_state_migration_reports" ("id", "reason", "card_count")
SELECT md5(reason), reason, count(*)::integer
FROM (
  SELECT CASE
    WHEN "status" = 'approved' AND "needs_review" = false THEN 'legacy_approved_active_evidence_required'
    WHEN "status" = 'archived' THEN 'legacy_archived'
    WHEN "status" IN ('rejected', 'duplicate', 'no_action') THEN 'legacy_terminal_suppressed'
    ELSE 'legacy_ambiguous_suppressed'
  END AS reason
  FROM "knowledge_cards"
) AS mappings
GROUP BY reason;
--> statement-breakpoint
UPDATE "knowledge_card_search_documents"
SET "status" = 'disabled', "updated_at" = now(), "disabled_at" = now()
WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX "knowledge_cards_publication_state_idx" ON "knowledge_cards" USING btree ("publication_state", "updated_at");
