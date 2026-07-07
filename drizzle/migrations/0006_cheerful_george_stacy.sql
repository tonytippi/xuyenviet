CREATE TABLE "ai_gateway_models" (
	"id" text PRIMARY KEY NOT NULL,
	"gateway_model_name" text NOT NULL,
	"display_label" text NOT NULL,
	"purpose" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"default_for_purpose" boolean DEFAULT false NOT NULL,
	"supports_text_input" boolean DEFAULT false NOT NULL,
	"supports_image_input" boolean DEFAULT false NOT NULL,
	"supports_image_output" boolean DEFAULT false NOT NULL,
	"supports_embeddings" boolean DEFAULT false NOT NULL,
	"supports_extraction" boolean DEFAULT false NOT NULL,
	"supports_evaluation" boolean DEFAULT false NOT NULL,
	"supports_streaming" boolean DEFAULT false NOT NULL,
	"supports_cache_pricing" boolean DEFAULT false NOT NULL,
	"pricing_currency" text,
	"input_token_price_micros" integer,
	"output_token_price_micros" integer,
	"cache_read_token_price_micros" integer,
	"cache_write_token_price_micros" integer,
	"pricing_unit_tokens" integer DEFAULT 1000000 NOT NULL,
	"pricing_version" text,
	"pricing_effective_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_gateway_models_purpose_check" CHECK ("ai_gateway_models"."purpose" in ('ai_ask_initial_answer', 'extraction', 'embeddings', 'evaluation')),
	CONSTRAINT "ai_gateway_models_display_label_not_empty_check" CHECK (length(btrim("ai_gateway_models"."display_label")) > 0),
	CONSTRAINT "ai_gateway_models_gateway_model_name_not_empty_check" CHECK (length(btrim("ai_gateway_models"."gateway_model_name")) > 0),
	CONSTRAINT "ai_gateway_models_pricing_unit_positive_check" CHECK ("ai_gateway_models"."pricing_unit_tokens" > 0),
	CONSTRAINT "ai_gateway_models_input_price_non_negative_check" CHECK ("ai_gateway_models"."input_token_price_micros" is null or "ai_gateway_models"."input_token_price_micros" >= 0),
	CONSTRAINT "ai_gateway_models_output_price_non_negative_check" CHECK ("ai_gateway_models"."output_token_price_micros" is null or "ai_gateway_models"."output_token_price_micros" >= 0),
	CONSTRAINT "ai_gateway_models_cache_read_price_non_negative_check" CHECK ("ai_gateway_models"."cache_read_token_price_micros" is null or "ai_gateway_models"."cache_read_token_price_micros" >= 0),
	CONSTRAINT "ai_gateway_models_cache_write_price_non_negative_check" CHECK ("ai_gateway_models"."cache_write_token_price_micros" is null or "ai_gateway_models"."cache_write_token_price_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "ai_gateway_model_id" text;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "cached_prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "estimated_input_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "estimated_output_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "estimated_cache_read_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "estimated_cache_write_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "estimated_total_cost_micros" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "pricing_currency" text;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "pricing_unit_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "pricing_version" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_gateway_models_gateway_model_purpose_idx" ON "ai_gateway_models" USING btree ("gateway_model_name","purpose");--> statement-breakpoint
CREATE INDEX "ai_gateway_models_purpose_active_idx" ON "ai_gateway_models" USING btree ("purpose","active");--> statement-breakpoint
CREATE INDEX "ai_gateway_models_default_idx" ON "ai_gateway_models" USING btree ("purpose","default_for_purpose");--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_ai_gateway_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("ai_gateway_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_events_ai_gateway_model_id_idx" ON "ai_usage_events" USING btree ("ai_gateway_model_id");--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_cached_prompt_tokens_non_negative_check" CHECK ("ai_usage_events"."cached_prompt_tokens" is null or "ai_usage_events"."cached_prompt_tokens" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_estimated_input_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_input_cost_micros" is null or "ai_usage_events"."estimated_input_cost_micros" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_estimated_output_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_output_cost_micros" is null or "ai_usage_events"."estimated_output_cost_micros" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_estimated_cache_read_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_cache_read_cost_micros" is null or "ai_usage_events"."estimated_cache_read_cost_micros" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_estimated_cache_write_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_cache_write_cost_micros" is null or "ai_usage_events"."estimated_cache_write_cost_micros" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_estimated_total_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_total_cost_micros" is null or "ai_usage_events"."estimated_total_cost_micros" >= 0);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_pricing_unit_positive_check" CHECK ("ai_usage_events"."pricing_unit_tokens" is null or "ai_usage_events"."pricing_unit_tokens" > 0);
--> statement-breakpoint
INSERT INTO "ai_gateway_models" (
	"id",
	"gateway_model_name",
	"display_label",
	"purpose",
	"active",
	"default_for_purpose",
	"supports_text_input",
	"supports_image_input",
	"supports_image_output",
	"supports_embeddings",
	"supports_extraction",
	"supports_evaluation",
	"supports_streaming",
	"supports_cache_pricing",
	"pricing_currency",
	"input_token_price_micros",
	"output_token_price_micros",
	"cache_read_token_price_micros",
	"cache_write_token_price_micros",
	"pricing_unit_tokens",
	"pricing_version",
	"pricing_effective_at",
	"created_at",
	"updated_at"
) VALUES (
	'00000000-0000-5000-8000-000000000550',
	'cx/gpt-5.5',
	'GPT-5.5 via AI Gateway',
	'ai_ask_initial_answer',
	true,
	true,
	true,
	false,
	false,
	false,
	false,
	false,
	false,
	false,
	'USD',
	0,
	0,
	null,
	null,
	1000000,
	'seed-2026-07-07',
	'2026-07-07 00:00:00',
	'2026-07-07 00:00:00',
	'2026-07-07 00:00:00'
) ON CONFLICT ("gateway_model_name", "purpose") DO UPDATE SET
	"display_label" = excluded."display_label",
	"active" = excluded."active",
	"default_for_purpose" = excluded."default_for_purpose",
	"supports_text_input" = excluded."supports_text_input",
	"supports_image_input" = excluded."supports_image_input",
	"supports_image_output" = excluded."supports_image_output",
	"supports_embeddings" = excluded."supports_embeddings",
	"supports_extraction" = excluded."supports_extraction",
	"supports_evaluation" = excluded."supports_evaluation",
	"supports_streaming" = excluded."supports_streaming",
	"supports_cache_pricing" = excluded."supports_cache_pricing",
	"pricing_currency" = excluded."pricing_currency",
	"input_token_price_micros" = excluded."input_token_price_micros",
	"output_token_price_micros" = excluded."output_token_price_micros",
	"cache_read_token_price_micros" = excluded."cache_read_token_price_micros",
	"cache_write_token_price_micros" = excluded."cache_write_token_price_micros",
	"pricing_unit_tokens" = excluded."pricing_unit_tokens",
	"pricing_version" = excluded."pricing_version",
	"pricing_effective_at" = excluded."pricing_effective_at",
	"updated_at" = excluded."updated_at";
