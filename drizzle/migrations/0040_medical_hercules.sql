CREATE TABLE "knowledge_card_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"source_id" text NOT NULL,
	"capture_version_id" text NOT NULL,
	"quote_text" text NOT NULL,
	"span_start" integer NOT NULL,
	"span_end" integer NOT NULL,
	"observed_at" timestamp NOT NULL,
	"captured_at" timestamp NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"support_level" text DEFAULT 'supporting' NOT NULL,
	"display_policy" text DEFAULT 'fact_only' NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"independence_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_card_evidence_quote_check" CHECK (length(btrim("knowledge_card_evidence"."quote_text")) between 1 and 2000),
	CONSTRAINT "knowledge_card_evidence_span_check" CHECK ("knowledge_card_evidence"."span_start" >= 0 and "knowledge_card_evidence"."span_end" > "knowledge_card_evidence"."span_start" and "knowledge_card_evidence"."span_end" - "knowledge_card_evidence"."span_start" = char_length("knowledge_card_evidence"."quote_text")),
	CONSTRAINT "knowledge_card_evidence_conditions_array_check" CHECK (jsonb_typeof("knowledge_card_evidence"."conditions") = 'array'),
	CONSTRAINT "knowledge_card_evidence_support_check" CHECK ("knowledge_card_evidence"."support_level" in ('primary', 'supporting', 'conflicting')),
	CONSTRAINT "knowledge_card_evidence_display_policy_check" CHECK ("knowledge_card_evidence"."display_policy" in ('fact_only', 'traveler_visible', 'operator_only')),
	CONSTRAINT "knowledge_card_evidence_state_check" CHECK ("knowledge_card_evidence"."state" in ('active', 'removed')),
	CONSTRAINT "knowledge_card_evidence_independence_key_check" CHECK (length(btrim("knowledge_card_evidence"."independence_key")) between 1 and 160)
);
--> statement-breakpoint
CREATE TABLE "knowledge_evidence_backfill_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"card_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_evidence_backfill_reports_reason_check" CHECK (length(btrim("knowledge_evidence_backfill_reports"."reason")) between 1 and 160),
	CONSTRAINT "knowledge_evidence_backfill_reports_count_check" CHECK ("knowledge_evidence_backfill_reports"."card_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_capture_version_source_fk" FOREIGN KEY ("capture_version_id","source_id") REFERENCES "public"."source_capture_versions"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_card_source_fk" FOREIGN KEY ("knowledge_card_id","source_id") REFERENCES "public"."knowledge_card_sources"("knowledge_card_id","source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_card_evidence_active_card_idx" ON "knowledge_card_evidence" USING btree ("knowledge_card_id","support_level") WHERE "knowledge_card_evidence"."state" = 'active';--> statement-breakpoint
CREATE INDEX "knowledge_card_evidence_source_version_idx" ON "knowledge_card_evidence" USING btree ("source_id","capture_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_evidence_card_independence_idx" ON "knowledge_card_evidence" USING btree ("knowledge_card_id","independence_key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_evidence_backfill_reports_reason_idx" ON "knowledge_evidence_backfill_reports" USING btree ("reason");
--> statement-breakpoint
-- Legacy links do not encode a validated quote/span. Do not fabricate evidence from card text.
INSERT INTO "knowledge_evidence_backfill_reports" ("id", "reason", "card_count")
SELECT md5('knowledge-evidence-backfill:legacy_support_ambiguous'), 'legacy_support_ambiguous', count(*)
FROM "knowledge_cards" card
WHERE card."publication_state" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "knowledge_card_evidence" evidence WHERE evidence."knowledge_card_id" = card."id" AND evidence."state" = 'active');
--> statement-breakpoint
INSERT INTO "knowledge_evidence_backfill_reports" ("id", "reason", "card_count")
SELECT md5('knowledge-evidence-backfill:legacy_non_retrieval_state'), 'legacy_non_retrieval_state', count(*)
FROM "knowledge_cards"
WHERE "publication_state" <> 'active' OR "status" <> 'approved' OR "needs_review" = true;
--> statement-breakpoint
UPDATE "knowledge_card_search_documents" document
SET "status" = 'disabled', "updated_at" = now(), "disabled_at" = now()
WHERE document."status" = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM "knowledge_card_evidence" evidence
    JOIN "source_capture_versions" capture ON capture."id" = evidence."capture_version_id" AND capture."source_id" = evidence."source_id"
    WHERE evidence."knowledge_card_id" = document."knowledge_card_id"
      AND evidence."state" = 'active'
      AND evidence."support_level" IN ('primary', 'supporting')
      AND capture."payload_deleted_at" IS NULL
      AND substring(capture."raw_text" from evidence."span_start" + 1 for evidence."span_end" - evidence."span_start") = evidence."quote_text"
  );
