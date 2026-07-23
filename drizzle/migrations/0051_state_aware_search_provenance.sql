ALTER TABLE "assistant_retrieval_decisions" ADD COLUMN "selected_knowledge_card_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD COLUMN "knowledge_policy_snapshot" jsonb;
--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_selected_card_ids_array_check" CHECK (jsonb_typeof("assistant_retrieval_decisions"."selected_knowledge_card_ids") = 'array');
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD COLUMN "cost_status" text DEFAULT 'missing_pricing' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_cost_status_check" CHECK ("ai_usage_events"."cost_status" in ('estimated', 'missing_pricing', 'missing_usage'));
--> statement-breakpoint
ALTER TABLE "web_search_results" DROP CONSTRAINT "web_search_results_trigger_reason_check";
--> statement-breakpoint
ALTER TABLE "web_search_results" ADD CONSTRAINT "web_search_results_trigger_reason_check" CHECK ("web_search_results"."trigger_reason" in ('no_active_knowledge', 'insufficient_active_knowledge', 'freshness_sensitive_request', 'active_knowledge_may_be_stale', 'source_conflict', 'excluded_conflict_candidate', 'excluded_verification_required_candidate', 'active_knowledge_unavailable', 'no_approved_knowledge', 'insufficient_approved_knowledge', 'approved_knowledge_may_be_stale', 'approved_knowledge_unavailable'));
