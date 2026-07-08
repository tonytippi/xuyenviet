CREATE TABLE "knowledge_card_search_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"searchable_text" text NOT NULL,
	"text_hash" text NOT NULL,
	"source_count" integer NOT NULL,
	"confidence" text NOT NULL,
	"freshness_sensitive" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"disabled_at" timestamp,
	CONSTRAINT "knowledge_card_search_documents_status_check" CHECK ("knowledge_card_search_documents"."status" in ('active', 'disabled', 'stale')),
	CONSTRAINT "knowledge_card_search_documents_confidence_check" CHECK ("knowledge_card_search_documents"."confidence" in ('unverified', 'community', 'curated', 'partner', 'official')),
	CONSTRAINT "knowledge_card_search_documents_text_not_empty_check" CHECK (length(btrim("knowledge_card_search_documents"."searchable_text")) > 0),
	CONSTRAINT "knowledge_card_search_documents_hash_check" CHECK ("knowledge_card_search_documents"."text_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "knowledge_card_search_documents_source_count_check" CHECK ("knowledge_card_search_documents"."source_count" > 0),
	CONSTRAINT "knowledge_card_search_documents_disabled_at_check" CHECK (("knowledge_card_search_documents"."status" = 'active' and "knowledge_card_search_documents"."disabled_at" is null) or ("knowledge_card_search_documents"."status" <> 'active' and "knowledge_card_search_documents"."disabled_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD CONSTRAINT "knowledge_card_search_documents_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_search_documents_card_idx" ON "knowledge_card_search_documents" USING btree ("knowledge_card_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_search_documents_active_card_idx" ON "knowledge_card_search_documents" USING btree ("knowledge_card_id") WHERE "knowledge_card_search_documents"."status" = 'active';
--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_status_updated_idx" ON "knowledge_card_search_documents" USING btree ("status","updated_at");
--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_confidence_idx" ON "knowledge_card_search_documents" USING btree ("confidence");
