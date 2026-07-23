ALTER TABLE "ai_usage_events" ADD COLUMN "provider_request_id" text;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_provider_request_id_check" CHECK ("ai_usage_events"."provider_request_id" is null or length(btrim("ai_usage_events"."provider_request_id")) between 1 and 200);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" DROP CONSTRAINT "ai_usage_events_cost_status_check";
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_cost_status_check" CHECK ("ai_usage_events"."cost_status" in ('estimated', 'missing_pricing', 'missing_usage', 'missing_cost'));
