CREATE TABLE "assistant_response_provenance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_message_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"source_category" text NOT NULL,
	"source_reference_id" text,
	"source_reference_type" text,
	"rank" integer NOT NULL,
	"retrieval_score" real,
	"source_type" text,
	"verification_status" text NOT NULL,
	"used_in_prompt" boolean DEFAULT true NOT NULL,
	"cited_in_answer" boolean DEFAULT false NOT NULL,
	"source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_response_provenance_category_check" CHECK ("assistant_response_provenance"."source_category" in ('trip_context', 'chat_context', 'knowledge', 'web', 'general')),
	CONSTRAINT "assistant_response_provenance_verification_check" CHECK ("assistant_response_provenance"."verification_status" in ('unverified', 'verified')),
	CONSTRAINT "assistant_response_provenance_rank_check" CHECK ("assistant_response_provenance"."rank" > 0),
	CONSTRAINT "assistant_response_provenance_score_check" CHECK ("assistant_response_provenance"."retrieval_score" is null or "assistant_response_provenance"."retrieval_score" >= 0),
	CONSTRAINT "assistant_response_provenance_snapshot_object_check" CHECK (jsonb_typeof("assistant_response_provenance"."source_snapshot") = 'object'),
	CONSTRAINT "assistant_response_provenance_reference_pair_check" CHECK (("assistant_response_provenance"."source_reference_id" is null and "assistant_response_provenance"."source_reference_type" is null) or ("assistant_response_provenance"."source_reference_id" is not null and "assistant_response_provenance"."source_reference_type" is not null))
);
--> statement-breakpoint
CREATE TABLE "assistant_retrieval_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_message_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"approved_knowledge_candidate_count" integer NOT NULL,
	"approved_knowledge_selected_count" integer NOT NULL,
	"approved_knowledge_target_count" integer NOT NULL,
	"approved_knowledge_relevance_threshold" real NOT NULL,
	"broad_planning_question" boolean NOT NULL,
	"freshness_required" boolean NOT NULL,
	"conflict_detected" boolean NOT NULL,
	"web_search_triggered" boolean NOT NULL,
	"web_search_trigger_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"general_reasoning_used" boolean NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_retrieval_decisions_candidate_count_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_candidate_count" >= "assistant_retrieval_decisions"."approved_knowledge_selected_count"),
	CONSTRAINT "assistant_retrieval_decisions_selected_count_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_selected_count" >= 0),
	CONSTRAINT "assistant_retrieval_decisions_target_count_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_target_count" > 0),
	CONSTRAINT "assistant_retrieval_decisions_relevance_threshold_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_relevance_threshold" > 0),
	CONSTRAINT "assistant_retrieval_decisions_reasons_array_check" CHECK (jsonb_typeof("assistant_retrieval_decisions"."web_search_trigger_reasons") = 'array'),
	CONSTRAINT "assistant_retrieval_decisions_warnings_array_check" CHECK (jsonb_typeof("assistant_retrieval_decisions"."warnings") = 'array')
);
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_gateway_models_purpose_active_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "web_search_results_user_message_rank_idx";--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_user_message_owner_fk" FOREIGN KEY ("user_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_user_message_owner_fk" FOREIGN KEY ("user_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_response_provenance_assistant_rank_idx" ON "assistant_response_provenance" USING btree ("assistant_message_id","rank");--> statement-breakpoint
CREATE INDEX "assistant_response_provenance_conversation_created_at_idx" ON "assistant_response_provenance" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_response_provenance_source_reference_idx" ON "assistant_response_provenance" USING btree ("source_reference_type","source_reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_retrieval_decisions_assistant_message_idx" ON "assistant_retrieval_decisions" USING btree ("assistant_message_id");--> statement-breakpoint
CREATE INDEX "assistant_retrieval_decisions_conversation_created_at_idx" ON "assistant_retrieval_decisions" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_retrieval_decisions_user_id_created_at_idx" ON "assistant_retrieval_decisions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_gateway_models_purpose_active_idx" ON "ai_gateway_models" USING btree ("purpose","active");--> statement-breakpoint
CREATE UNIQUE INDEX "web_search_results_user_message_rank_idx" ON "web_search_results" USING btree ("user_message_id","rank");
