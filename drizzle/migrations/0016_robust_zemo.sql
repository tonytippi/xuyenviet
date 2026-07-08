CREATE TABLE "knowledge_card_sources" (
	"knowledge_card_id" text NOT NULL,
	"source_id" text NOT NULL,
	"support_level" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_card_sources_knowledge_card_id_source_id_pk" PRIMARY KEY("knowledge_card_id","source_id"),
	CONSTRAINT "knowledge_card_sources_support_level_check" CHECK ("knowledge_card_sources"."support_level" in ('primary', 'supporting', 'conflicting'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"location_name" text,
	"route_segment" text,
	"summary" text NOT NULL,
	"practical_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text DEFAULT 'unverified' NOT NULL,
	"freshness_sensitive" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT true NOT NULL,
	"ai_prompt_version" text NOT NULL,
	"ai_gateway_model_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_cards_status_check" CHECK ("knowledge_cards"."status" in ('draft', 'approved', 'archived', 'rejected', 'duplicate', 'no_action')),
	CONSTRAINT "knowledge_cards_type_check" CHECK ("knowledge_cards"."type" in ('place', 'food', 'hotel_area', 'activity', 'service', 'route_note', 'warning', 'cost_note', 'parking', 'ev_charging', 'kid_friendly_tip', 'discount_promotion', 'general_travel_tip')),
	CONSTRAINT "knowledge_cards_confidence_check" CHECK ("knowledge_cards"."confidence" in ('unverified', 'community', 'curated', 'partner', 'official')),
	CONSTRAINT "knowledge_cards_title_length_check" CHECK (length(btrim("knowledge_cards"."title")) between 1 and 160),
	CONSTRAINT "knowledge_cards_summary_length_check" CHECK (length(btrim("knowledge_cards"."summary")) between 1 and 1200),
	CONSTRAINT "knowledge_cards_location_length_check" CHECK ("knowledge_cards"."location_name" is null or length(btrim("knowledge_cards"."location_name")) between 1 and 160),
	CONSTRAINT "knowledge_cards_route_segment_length_check" CHECK ("knowledge_cards"."route_segment" is null or length(btrim("knowledge_cards"."route_segment")) between 1 and 160),
	CONSTRAINT "knowledge_cards_draft_review_check" CHECK ("knowledge_cards"."status" <> 'draft' or "knowledge_cards"."needs_review" = true)
);
--> statement-breakpoint
ALTER TABLE "knowledge_card_sources" ADD CONSTRAINT "knowledge_card_sources_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_sources" ADD CONSTRAINT "knowledge_card_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_ai_gateway_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("ai_gateway_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_card_sources_source_id_idx" ON "knowledge_card_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_cards_status_created_at_idx" ON "knowledge_cards" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_cards_type_status_idx" ON "knowledge_cards" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "knowledge_cards_confidence_idx" ON "knowledge_cards" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "knowledge_cards_created_by_user_id_idx" ON "knowledge_cards" USING btree ("created_by_user_id");