CREATE TABLE "knowledge_source_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"suggested_card_id" text,
	"action" text NOT NULL,
	"target_card_id" text,
	"before_summary" text,
	"after_summary" text,
	"conflict_summary" text,
	"rationale" text,
	"ai_prompt_version" text NOT NULL,
	"ai_gateway_model_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_source_suggestions_action_check" CHECK ("knowledge_source_suggestions"."action" in ('create', 'update', 'conflict', 'duplicate', 'no_action')),
	CONSTRAINT "knowledge_source_suggestions_review_card_check" CHECK ("knowledge_source_suggestions"."action" not in ('create', 'update', 'conflict') or "knowledge_source_suggestions"."suggested_card_id" is not null),
	CONSTRAINT "knowledge_source_suggestions_target_check" CHECK ("knowledge_source_suggestions"."action" not in ('update', 'conflict', 'duplicate') or "knowledge_source_suggestions"."target_card_id" is not null),
	CONSTRAINT "knowledge_source_suggestions_summary_length_check" CHECK (("knowledge_source_suggestions"."before_summary" is null or length(btrim("knowledge_source_suggestions"."before_summary")) between 1 and 1200) and ("knowledge_source_suggestions"."after_summary" is null or length(btrim("knowledge_source_suggestions"."after_summary")) between 1 and 1200) and ("knowledge_source_suggestions"."conflict_summary" is null or length(btrim("knowledge_source_suggestions"."conflict_summary")) between 1 and 1200) and ("knowledge_source_suggestions"."rationale" is null or length(btrim("knowledge_source_suggestions"."rationale")) between 1 and 1200))
);
--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_suggested_card_id_knowledge_cards_id_fk" FOREIGN KEY ("suggested_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_target_card_id_knowledge_cards_id_fk" FOREIGN KEY ("target_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_ai_gateway_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("ai_gateway_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_source_id_idx" ON "knowledge_source_suggestions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_suggested_card_id_idx" ON "knowledge_source_suggestions" USING btree ("suggested_card_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_target_card_id_idx" ON "knowledge_source_suggestions" USING btree ("target_card_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_action_created_at_idx" ON "knowledge_source_suggestions" USING btree ("action","created_at");
