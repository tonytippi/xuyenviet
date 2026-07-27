CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
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
	CONSTRAINT "ai_gateway_models_default_active_check" CHECK ("ai_gateway_models"."default_for_purpose" = false or "ai_gateway_models"."active" = true),
	CONSTRAINT "ai_gateway_models_priced_currency_check" CHECK (("ai_gateway_models"."input_token_price_micros" is null and "ai_gateway_models"."output_token_price_micros" is null and "ai_gateway_models"."cache_read_token_price_micros" is null and "ai_gateway_models"."cache_write_token_price_micros" is null) or "ai_gateway_models"."pricing_currency" is not null),
	CONSTRAINT "ai_gateway_models_input_price_non_negative_check" CHECK ("ai_gateway_models"."input_token_price_micros" is null or "ai_gateway_models"."input_token_price_micros" >= 0),
	CONSTRAINT "ai_gateway_models_output_price_non_negative_check" CHECK ("ai_gateway_models"."output_token_price_micros" is null or "ai_gateway_models"."output_token_price_micros" >= 0),
	CONSTRAINT "ai_gateway_models_cache_read_price_non_negative_check" CHECK ("ai_gateway_models"."cache_read_token_price_micros" is null or "ai_gateway_models"."cache_read_token_price_micros" >= 0),
	CONSTRAINT "ai_gateway_models_cache_write_price_non_negative_check" CHECK ("ai_gateway_models"."cache_write_token_price_micros" is null or "ai_gateway_models"."cache_write_token_price_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"initiated_by_user_id" text,
	"trip_project_id" text,
	"executor_system" text NOT NULL,
	"conversation_id" text,
	"user_message_id" text,
	"assistant_message_id" text,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"ai_gateway_model_id" text,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"cached_prompt_tokens" integer,
	"cache_write_prompt_tokens" integer,
	"estimated_input_cost_micros" integer,
	"estimated_output_cost_micros" integer,
	"estimated_cache_read_cost_micros" integer,
	"estimated_cache_write_cost_micros" integer,
	"estimated_total_cost_micros" integer,
	"pricing_currency" text,
	"input_token_price_micros" integer,
	"output_token_price_micros" integer,
	"cache_read_token_price_micros" integer,
	"cache_write_token_price_micros" integer,
	"pricing_unit_tokens" integer,
	"pricing_version" text,
	"pricing_effective_at" timestamp,
	"cost_status" text DEFAULT 'missing_pricing' NOT NULL,
	"error_code" text,
	"provider_request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_events_status_check" CHECK ("ai_usage_events"."status" in ('success', 'failure')),
	CONSTRAINT "ai_usage_events_latency_non_negative_check" CHECK ("ai_usage_events"."latency_ms" is null or "ai_usage_events"."latency_ms" >= 0),
	CONSTRAINT "ai_usage_events_prompt_tokens_non_negative_check" CHECK ("ai_usage_events"."prompt_tokens" is null or "ai_usage_events"."prompt_tokens" >= 0),
	CONSTRAINT "ai_usage_events_completion_tokens_non_negative_check" CHECK ("ai_usage_events"."completion_tokens" is null or "ai_usage_events"."completion_tokens" >= 0),
	CONSTRAINT "ai_usage_events_total_tokens_non_negative_check" CHECK ("ai_usage_events"."total_tokens" is null or "ai_usage_events"."total_tokens" >= 0),
	CONSTRAINT "ai_usage_events_cached_prompt_tokens_non_negative_check" CHECK ("ai_usage_events"."cached_prompt_tokens" is null or "ai_usage_events"."cached_prompt_tokens" >= 0),
	CONSTRAINT "ai_usage_events_cache_write_prompt_tokens_non_negative_check" CHECK ("ai_usage_events"."cache_write_prompt_tokens" is null or "ai_usage_events"."cache_write_prompt_tokens" >= 0),
	CONSTRAINT "ai_usage_events_estimated_input_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_input_cost_micros" is null or "ai_usage_events"."estimated_input_cost_micros" >= 0),
	CONSTRAINT "ai_usage_events_estimated_output_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_output_cost_micros" is null or "ai_usage_events"."estimated_output_cost_micros" >= 0),
	CONSTRAINT "ai_usage_events_estimated_cache_read_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_cache_read_cost_micros" is null or "ai_usage_events"."estimated_cache_read_cost_micros" >= 0),
	CONSTRAINT "ai_usage_events_estimated_cache_write_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_cache_write_cost_micros" is null or "ai_usage_events"."estimated_cache_write_cost_micros" >= 0),
	CONSTRAINT "ai_usage_events_estimated_total_cost_non_negative_check" CHECK ("ai_usage_events"."estimated_total_cost_micros" is null or "ai_usage_events"."estimated_total_cost_micros" >= 0),
	CONSTRAINT "ai_usage_events_pricing_unit_positive_check" CHECK ("ai_usage_events"."pricing_unit_tokens" is null or "ai_usage_events"."pricing_unit_tokens" > 0),
	CONSTRAINT "ai_usage_events_input_price_non_negative_check" CHECK ("ai_usage_events"."input_token_price_micros" is null or "ai_usage_events"."input_token_price_micros" >= 0),
	CONSTRAINT "ai_usage_events_output_price_non_negative_check" CHECK ("ai_usage_events"."output_token_price_micros" is null or "ai_usage_events"."output_token_price_micros" >= 0),
	CONSTRAINT "ai_usage_events_cache_read_price_non_negative_check" CHECK ("ai_usage_events"."cache_read_token_price_micros" is null or "ai_usage_events"."cache_read_token_price_micros" >= 0),
	CONSTRAINT "ai_usage_events_cache_write_price_non_negative_check" CHECK ("ai_usage_events"."cache_write_token_price_micros" is null or "ai_usage_events"."cache_write_token_price_micros" >= 0),
	CONSTRAINT "ai_usage_events_cost_status_check" CHECK ("ai_usage_events"."cost_status" in ('estimated', 'missing_pricing', 'missing_usage', 'missing_cost')),
	CONSTRAINT "ai_usage_events_provider_request_id_check" CHECK ("ai_usage_events"."provider_request_id" is null or length(btrim("ai_usage_events"."provider_request_id")) between 1 and 200),
	CONSTRAINT "ai_usage_events_executor_system_check" CHECK (length(btrim("ai_usage_events"."executor_system")) > 0)
);
--> statement-breakpoint
CREATE TABLE "answer_usefulness_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"assistant_message_id" text NOT NULL,
	"assistant_message_role" text DEFAULT 'assistant' NOT NULL,
	"rating" text NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "answer_usefulness_feedback_rating_check" CHECK ("answer_usefulness_feedback"."rating" in ('useful', 'not_useful')),
	CONSTRAINT "answer_usefulness_feedback_assistant_role_check" CHECK ("answer_usefulness_feedback"."assistant_message_role" = 'assistant'),
	CONSTRAINT "answer_usefulness_feedback_comment_length_check" CHECK ("answer_usefulness_feedback"."comment" is null or length(btrim("answer_usefulness_feedback"."comment")) between 1 and 500)
);
--> statement-breakpoint
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
	"selected_knowledge_card_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"knowledge_policy_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_retrieval_decisions_candidate_count_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_candidate_count" >= "assistant_retrieval_decisions"."approved_knowledge_selected_count"),
	CONSTRAINT "assistant_retrieval_decisions_selected_count_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_selected_count" >= 0),
	CONSTRAINT "assistant_retrieval_decisions_target_count_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_target_count" > 0),
	CONSTRAINT "assistant_retrieval_decisions_relevance_threshold_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_relevance_threshold" > 0),
	CONSTRAINT "assistant_retrieval_decisions_reasons_array_check" CHECK (jsonb_typeof("assistant_retrieval_decisions"."web_search_trigger_reasons") = 'array'),
	CONSTRAINT "assistant_retrieval_decisions_warnings_array_check" CHECK (jsonb_typeof("assistant_retrieval_decisions"."warnings") = 'array'),
	CONSTRAINT "assistant_retrieval_decisions_selected_card_ids_array_check" CHECK (jsonb_typeof("assistant_retrieval_decisions"."selected_knowledge_card_ids") = 'array')
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_email" text,
	"operation" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before_summary" text,
	"after_summary" text,
	"actor_class" text DEFAULT 'user' NOT NULL,
	"actor_system" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_operation_check" CHECK ("audit_events"."operation" in ('access_check', 'create', 'update', 'delete', 'archive', 'approve', 'apply', 'dismiss', 'expire')),
	CONSTRAINT "audit_events_actor_class_check" CHECK ("audit_events"."actor_class" in ('user', 'system')),
	CONSTRAINT "audit_events_actor_shape_check" CHECK (("audit_events"."actor_class" = 'user' and "audit_events"."actor_user_id" is not null and "audit_events"."actor_email" is not null and length(btrim("audit_events"."actor_email")) > 0 and "audit_events"."actor_system" is null) or ("audit_events"."actor_class" = 'system' and "audit_events"."actor_user_id" is null and "audit_events"."actor_email" is null and "audit_events"."actor_system" is not null and length(btrim("audit_events"."actor_system")) > 0))
);
--> statement-breakpoint
CREATE TABLE "chat_context" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"trip_project_id" text,
	"source_message_id" text NOT NULL,
	"field" text NOT NULL,
	"scope" text NOT NULL,
	"value" text NOT NULL,
	"confidence" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_context_field_check" CHECK ("chat_context"."field" in ('origin', 'destination', 'start_date', 'end_date', 'duration', 'adults', 'children', 'children_ages', 'budget', 'hotel_style', 'driving_tolerance', 'vehicle_needs', 'food_preferences', 'activity_preferences', 'itinerary_constraints', 'avoid_places', 'prior_trips', 'notes')),
	CONSTRAINT "chat_context_scope_check" CHECK ("chat_context"."scope" in ('conversation', 'trip_project')),
	CONSTRAINT "chat_context_status_check" CHECK ("chat_context"."status" in ('active', 'deleted')),
	CONSTRAINT "chat_context_value_not_empty_check" CHECK (length(btrim("chat_context"."value")) > 0),
	CONSTRAINT "chat_context_confidence_check" CHECK ("chat_context"."confidence" is null or ("chat_context"."confidence" >= 0 and "chat_context"."confidence" <= 100)),
	CONSTRAINT "chat_context_scope_trip_project_check" CHECK (("chat_context"."scope" = 'conversation' and "chat_context"."trip_project_id" is null) or ("chat_context"."scope" = 'trip_project' and "chat_context"."trip_project_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trip_project_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facebook_capture_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"raw_source_material_id" text NOT NULL,
	"capture_version_id" text,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"reviewer_user_id" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"extraction_error" text,
	"force_live_capture" boolean DEFAULT false NOT NULL,
	"force_live_capture_generation" integer DEFAULT 0 NOT NULL,
	"executor_system" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "facebook_capture_reviews_status_check" CHECK ("facebook_capture_reviews"."status" in ('needs_review', 'rejected', 'extracted', 'extracted_approved', 'extraction_failed')),
	CONSTRAINT "facebook_capture_reviews_rejection_reason_check" CHECK ("facebook_capture_reviews"."rejection_reason" is null or ("facebook_capture_reviews"."status" = 'rejected' and length(btrim("facebook_capture_reviews"."rejection_reason")) between 1 and 500 and position(chr(10) in "facebook_capture_reviews"."rejection_reason") = 0 and position(chr(13) in "facebook_capture_reviews"."rejection_reason") = 0)),
	CONSTRAINT "facebook_capture_reviews_extraction_error_check" CHECK ("facebook_capture_reviews"."extraction_error" is null or ("facebook_capture_reviews"."status" = 'extraction_failed' and length(btrim("facebook_capture_reviews"."extraction_error")) between 1 and 500 and position(chr(10) in "facebook_capture_reviews"."extraction_error") = 0 and position(chr(13) in "facebook_capture_reviews"."extraction_error") = 0)),
	CONSTRAINT "facebook_capture_reviews_reviewer_shape_check" CHECK ("facebook_capture_reviews"."status" = 'needs_review' or ("facebook_capture_reviews"."reviewer_user_id" is not null and "facebook_capture_reviews"."executor_system" is null and "facebook_capture_reviews"."reviewed_at" is not null) or ("facebook_capture_reviews"."reviewer_user_id" is null and "facebook_capture_reviews"."executor_system" is not null and length(btrim("facebook_capture_reviews"."executor_system")) between 1 and 160 and "facebook_capture_reviews"."reviewed_at" is not null)),
	CONSTRAINT "facebook_capture_reviews_executor_system_check" CHECK ("facebook_capture_reviews"."executor_system" is null or length(btrim("facebook_capture_reviews"."executor_system")) between 1 and 160),
	CONSTRAINT "facebook_capture_reviews_updated_after_created_check" CHECK ("facebook_capture_reviews"."updated_at" >= "facebook_capture_reviews"."created_at")
);
--> statement-breakpoint
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
CREATE TABLE "knowledge_card_search_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"accepted_fence" text DEFAULT 'legacy' NOT NULL,
	"executor_system" text NOT NULL,
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
	CONSTRAINT "knowledge_card_search_documents_content_version_check" CHECK ("knowledge_card_search_documents"."content_version" >= 1),
	CONSTRAINT "knowledge_card_search_documents_accepted_fence_check" CHECK (length(btrim("knowledge_card_search_documents"."accepted_fence")) between 1 and 128),
	CONSTRAINT "knowledge_card_search_documents_executor_system_check" CHECK (length(btrim("knowledge_card_search_documents"."executor_system")) between 1 and 160),
	CONSTRAINT "knowledge_card_search_documents_disabled_at_check" CHECK (("knowledge_card_search_documents"."status" = 'active' and "knowledge_card_search_documents"."disabled_at" is null) or ("knowledge_card_search_documents"."status" <> 'active' and "knowledge_card_search_documents"."disabled_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_card_sources" (
	"knowledge_card_id" text NOT NULL,
	"source_id" text NOT NULL,
	"support_level" text DEFAULT 'primary' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_card_sources_knowledge_card_id_source_id_pk" PRIMARY KEY("knowledge_card_id","source_id"),
	CONSTRAINT "knowledge_card_sources_support_level_check" CHECK ("knowledge_card_sources"."support_level" in ('primary', 'supporting', 'conflicting'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_card_state_migration_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"card_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_card_state_migration_reports_reason_check" CHECK (length(btrim("knowledge_card_state_migration_reports"."reason")) between 1 and 160),
	CONSTRAINT "knowledge_card_state_migration_reports_count_check" CHECK ("knowledge_card_state_migration_reports"."card_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"publication_state" text DEFAULT 'suppressed' NOT NULL,
	"knowledge_state" text DEFAULT 'uncertain' NOT NULL,
	"review_state" text DEFAULT 'ai_recommended' NOT NULL,
	"verification_state" text DEFAULT 'not_required' NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"evidence_set_revision" integer DEFAULT 1 NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_judge_summary" text DEFAULT 'Current judgment has not been completed.' NOT NULL,
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
	"created_by_user_id" text,
	"executor_system" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_cards_status_check" CHECK ("knowledge_cards"."status" in ('draft', 'approved', 'archived', 'rejected', 'duplicate', 'no_action')),
	CONSTRAINT "knowledge_cards_publication_state_check" CHECK ("knowledge_cards"."publication_state" in ('active', 'suppressed', 'archived')),
	CONSTRAINT "knowledge_cards_knowledge_state_check" CHECK ("knowledge_cards"."knowledge_state" in ('community_observation', 'community_pattern', 'conditional', 'uncertain', 'conflicted', 'confirmed', 'superseded')),
	CONSTRAINT "knowledge_cards_review_state_check" CHECK ("knowledge_cards"."review_state" in ('none', 'ai_recommended', 'in_review', 'reviewed')),
	CONSTRAINT "knowledge_cards_verification_state_check" CHECK ("knowledge_cards"."verification_state" in ('not_required', 'required', 'corroborated', 'failed')),
	CONSTRAINT "knowledge_cards_content_version_check" CHECK ("knowledge_cards"."content_version" >= 1),
	CONSTRAINT "knowledge_cards_evidence_set_revision_check" CHECK ("knowledge_cards"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_cards_conditions_array_check" CHECK (jsonb_typeof("knowledge_cards"."conditions") = 'array'),
	CONSTRAINT "knowledge_cards_judge_summary_check" CHECK (length(btrim("knowledge_cards"."current_judge_summary")) between 1 and 1000),
	CONSTRAINT "knowledge_cards_type_check" CHECK ("knowledge_cards"."type" in ('place', 'food', 'hotel_area', 'activity', 'service', 'route_note', 'warning', 'cost_note', 'parking', 'ev_charging', 'kid_friendly_tip', 'discount_promotion', 'general_travel_tip')),
	CONSTRAINT "knowledge_cards_confidence_check" CHECK ("knowledge_cards"."confidence" in ('unverified', 'community', 'curated', 'partner', 'official')),
	CONSTRAINT "knowledge_cards_title_length_check" CHECK (length(btrim("knowledge_cards"."title")) between 1 and 160),
	CONSTRAINT "knowledge_cards_summary_length_check" CHECK (length(btrim("knowledge_cards"."summary")) between 1 and 1200),
	CONSTRAINT "knowledge_cards_location_length_check" CHECK ("knowledge_cards"."location_name" is null or length(btrim("knowledge_cards"."location_name")) between 1 and 160),
	CONSTRAINT "knowledge_cards_route_segment_length_check" CHECK ("knowledge_cards"."route_segment" is null or length(btrim("knowledge_cards"."route_segment")) between 1 and 160),
	CONSTRAINT "knowledge_cards_details_object_check" CHECK (jsonb_typeof("knowledge_cards"."practical_details") = 'object'),
	CONSTRAINT "knowledge_cards_tags_array_check" CHECK (jsonb_typeof("knowledge_cards"."tags") = 'array'),
	CONSTRAINT "knowledge_cards_executor_shape_check" CHECK ("knowledge_cards"."created_by_user_id" is not null or ("knowledge_cards"."executor_system" is not null and length(btrim("knowledge_cards"."executor_system")) between 1 and 160)),
	CONSTRAINT "knowledge_cards_draft_review_check" CHECK ("knowledge_cards"."status" <> 'draft' or "knowledge_cards"."needs_review" = true)
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
CREATE TABLE "knowledge_extraction_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"facebook_capture_review_id" text,
	"capture_version_id" text,
	"mode" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"locked_by" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"last_error_code" text,
	"last_error_message" text,
	"result_draft_ids" jsonb,
	"result_draft_count" integer,
	"created_by_user_id" text NOT NULL,
	"created_by_email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_extraction_jobs_mode_check" CHECK ("knowledge_extraction_jobs"."mode" in ('extract_only', 'extract_and_approve_all')),
	CONSTRAINT "knowledge_extraction_jobs_status_check" CHECK ("knowledge_extraction_jobs"."status" in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "knowledge_extraction_jobs_attempt_count_check" CHECK ("knowledge_extraction_jobs"."attempt_count" >= 0 and "knowledge_extraction_jobs"."attempt_count" <= "knowledge_extraction_jobs"."max_attempts"),
	CONSTRAINT "knowledge_extraction_jobs_max_attempts_check" CHECK ("knowledge_extraction_jobs"."max_attempts" between 1 and 10),
	CONSTRAINT "knowledge_extraction_jobs_lock_shape_check" CHECK (("knowledge_extraction_jobs"."status" <> 'running') or ("knowledge_extraction_jobs"."locked_at" is not null and "knowledge_extraction_jobs"."locked_by" is not null and "knowledge_extraction_jobs"."started_at" is not null)),
	CONSTRAINT "knowledge_extraction_jobs_finished_shape_check" CHECK ("knowledge_extraction_jobs"."status" not in ('succeeded', 'failed', 'cancelled') or "knowledge_extraction_jobs"."finished_at" is not null),
	CONSTRAINT "knowledge_extraction_jobs_error_message_check" CHECK ("knowledge_extraction_jobs"."last_error_message" is null or (length(btrim("knowledge_extraction_jobs"."last_error_message")) between 1 and 500 and position(chr(10) in "knowledge_extraction_jobs"."last_error_message") = 0 and position(chr(13) in "knowledge_extraction_jobs"."last_error_message") = 0)),
	CONSTRAINT "knowledge_extraction_jobs_result_draft_ids_check" CHECK ("knowledge_extraction_jobs"."result_draft_ids" is null or jsonb_typeof("knowledge_extraction_jobs"."result_draft_ids") = 'array'),
	CONSTRAINT "knowledge_extraction_jobs_result_draft_count_check" CHECK ("knowledge_extraction_jobs"."result_draft_count" is null or "knowledge_extraction_jobs"."result_draft_count" >= 0),
	CONSTRAINT "knowledge_extraction_jobs_created_by_email_check" CHECK (length(btrim("knowledge_extraction_jobs"."created_by_email")) > 0 and char_length("knowledge_extraction_jobs"."created_by_email") <= 320)
);
--> statement-breakpoint
CREATE TABLE "knowledge_index_backfill_state" (
	"id" text PRIMARY KEY NOT NULL,
	"cursor" text,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_index_dirty_markers" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"reason" text NOT NULL,
	"executor_system" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp,
	"lease_expires_at" timestamp,
	"fencing_token" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"completion_reason" text,
	"failure_code" text,
	"failure_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_index_dirty_markers_versions_check" CHECK ("knowledge_index_dirty_markers"."content_version" >= 1 and "knowledge_index_dirty_markers"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_index_dirty_markers_reason_check" CHECK (length(btrim("knowledge_index_dirty_markers"."reason")) between 1 and 120),
	CONSTRAINT "knowledge_index_dirty_markers_executor_system_check" CHECK ("knowledge_index_dirty_markers"."executor_system" is null or length(btrim("knowledge_index_dirty_markers"."executor_system")) between 1 and 160),
	CONSTRAINT "knowledge_index_dirty_markers_status_check" CHECK ("knowledge_index_dirty_markers"."status" in ('pending', 'claimed', 'completed', 'failed', 'superseded')),
	CONSTRAINT "knowledge_index_dirty_markers_attempts_check" CHECK ("knowledge_index_dirty_markers"."attempt_count" >= 0 and "knowledge_index_dirty_markers"."max_attempts" between 1 and 10 and "knowledge_index_dirty_markers"."attempt_count" <= "knowledge_index_dirty_markers"."max_attempts"),
	CONSTRAINT "knowledge_index_dirty_markers_fence_check" CHECK ("knowledge_index_dirty_markers"."fencing_token" is null or "knowledge_index_dirty_markers"."fencing_token" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "knowledge_index_dirty_markers_claim_shape_check" CHECK (("knowledge_index_dirty_markers"."claimed_by" is null and "knowledge_index_dirty_markers"."claimed_at" is null and "knowledge_index_dirty_markers"."lease_expires_at" is null and "knowledge_index_dirty_markers"."fencing_token" is null) or ("knowledge_index_dirty_markers"."claimed_by" is not null and length(btrim("knowledge_index_dirty_markers"."claimed_by")) between 1 and 160 and "knowledge_index_dirty_markers"."claimed_at" is not null and "knowledge_index_dirty_markers"."lease_expires_at" is not null and "knowledge_index_dirty_markers"."fencing_token" is not null and "knowledge_index_dirty_markers"."fencing_token" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "knowledge_index_dirty_markers_failure_code_check" CHECK ("knowledge_index_dirty_markers"."failure_code" is null or length(btrim("knowledge_index_dirty_markers"."failure_code")) between 1 and 80),
	CONSTRAINT "knowledge_index_dirty_markers_failure_reason_check" CHECK ("knowledge_index_dirty_markers"."failure_reason" is null or length(btrim("knowledge_index_dirty_markers"."failure_reason")) between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "knowledge_ingestion_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"ingestion_job_id" text NOT NULL,
	"source_id" text NOT NULL,
	"capture_version_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"location_name" text,
	"route_segment" text,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"freshness_sensitive" boolean DEFAULT false NOT NULL,
	"span_start" integer NOT NULL,
	"span_end" integer NOT NULL,
	"extraction_model_id" text,
	"extraction_prompt_version" text NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"stage_version" integer DEFAULT 1 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp,
	"lease_expires_at" timestamp,
	"fencing_token" text,
	"outcome_reason_code" text,
	"judgment_summary" text,
	"scores" jsonb,
	"knowledge_card_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_ingestion_candidates_stage_check" CHECK ("knowledge_ingestion_candidates"."stage" in ('queued', 'judging', 'relating', 'published', 'suppressed', 'review_recommended', 'verify_first', 'failed')),
	CONSTRAINT "knowledge_ingestion_candidates_span_check" CHECK ("knowledge_ingestion_candidates"."span_start" >= 0 and "knowledge_ingestion_candidates"."span_end" > "knowledge_ingestion_candidates"."span_start"),
	CONSTRAINT "knowledge_ingestion_candidates_safe_text_check" CHECK (length(btrim("knowledge_ingestion_candidates"."title")) between 1 and 160 and length(btrim("knowledge_ingestion_candidates"."summary")) between 1 and 1200 and length(btrim("knowledge_ingestion_candidates"."extraction_prompt_version")) between 1 and 160),
	CONSTRAINT "knowledge_ingestion_candidates_conditions_check" CHECK (jsonb_typeof("knowledge_ingestion_candidates"."conditions") = 'array'),
	CONSTRAINT "knowledge_ingestion_candidates_attempt_check" CHECK ("knowledge_ingestion_candidates"."attempt_count" >= 0 and "knowledge_ingestion_candidates"."attempt_count" <= "knowledge_ingestion_candidates"."max_attempts" and "knowledge_ingestion_candidates"."max_attempts" between 1 and 10),
	CONSTRAINT "knowledge_ingestion_candidates_claim_shape_check" CHECK (("knowledge_ingestion_candidates"."claimed_by" is null and "knowledge_ingestion_candidates"."claimed_at" is null and "knowledge_ingestion_candidates"."lease_expires_at" is null and "knowledge_ingestion_candidates"."fencing_token" is null) or ("knowledge_ingestion_candidates"."claimed_by" is not null and "knowledge_ingestion_candidates"."claimed_at" is not null and "knowledge_ingestion_candidates"."lease_expires_at" > "knowledge_ingestion_candidates"."claimed_at" and "knowledge_ingestion_candidates"."fencing_token" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "knowledge_ingestion_candidates_outcome_reason_code_check" CHECK ("knowledge_ingestion_candidates"."outcome_reason_code" is null or "knowledge_ingestion_candidates"."outcome_reason_code" in ('candidate_terminalized', 'invalid_discovery_candidate', 'stale_or_deleted_capture', 'judge_model_unavailable', 'judge_model_not_independent', 'judge_provider_failed', 'relation_provider_failed', 'relation_ambiguous', 'relation_invalid', 'stale_relation_target', 'attach_condition_mismatch', 'conflict_condition_mismatch', 'retry_exhausted'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_ingestion_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"capture_version_id" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"submitted_by_email" text NOT NULL,
	"stage" text DEFAULT 'queued' NOT NULL,
	"protocol_version" integer DEFAULT 1 NOT NULL,
	"discovery_cursor" integer DEFAULT 0 NOT NULL,
	"discovery_window_size" integer DEFAULT 8000 NOT NULL,
	"discovery_complete" boolean DEFAULT false NOT NULL,
	"discovered_candidate_count" integer DEFAULT 0 NOT NULL,
	"terminal_candidate_count" integer DEFAULT 0 NOT NULL,
	"published_candidate_count" integer DEFAULT 0 NOT NULL,
	"suppressed_candidate_count" integer DEFAULT 0 NOT NULL,
	"review_recommended_candidate_count" integer DEFAULT 0 NOT NULL,
	"verify_first_candidate_count" integer DEFAULT 0 NOT NULL,
	"failed_candidate_count" integer DEFAULT 0 NOT NULL,
	"invalid_candidate_count" integer DEFAULT 0 NOT NULL,
	"stage_version" integer DEFAULT 1 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_run_at" timestamp DEFAULT now() NOT NULL,
	"last_error_code" text,
	"requeue_reason_code" text,
	"checkpoint" jsonb,
	"claimed_by" text,
	"claimed_at" timestamp,
	"lease_expires_at" timestamp,
	"fencing_token" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_ingestion_jobs_stage_check" CHECK ("knowledge_ingestion_jobs"."stage" in ('queued', 'triaging', 'extracting', 'judging', 'relating', 'published', 'suppressed', 'review_recommended', 'verify_first', 'failed')),
	CONSTRAINT "knowledge_ingestion_jobs_protocol_version_check" CHECK ("knowledge_ingestion_jobs"."protocol_version" in (1, 2)),
	CONSTRAINT "knowledge_ingestion_jobs_discovery_cursor_check" CHECK ("knowledge_ingestion_jobs"."discovery_cursor" >= 0),
	CONSTRAINT "knowledge_ingestion_jobs_discovery_window_size_check" CHECK ("knowledge_ingestion_jobs"."discovery_window_size" between 500 and 8000),
	CONSTRAINT "knowledge_ingestion_jobs_candidate_counts_check" CHECK ("knowledge_ingestion_jobs"."discovered_candidate_count" >= 0 and "knowledge_ingestion_jobs"."terminal_candidate_count" >= 0 and "knowledge_ingestion_jobs"."terminal_candidate_count" <= "knowledge_ingestion_jobs"."discovered_candidate_count" and "knowledge_ingestion_jobs"."published_candidate_count" >= 0 and "knowledge_ingestion_jobs"."suppressed_candidate_count" >= 0 and "knowledge_ingestion_jobs"."review_recommended_candidate_count" >= 0 and "knowledge_ingestion_jobs"."verify_first_candidate_count" >= 0 and "knowledge_ingestion_jobs"."failed_candidate_count" >= 0 and "knowledge_ingestion_jobs"."invalid_candidate_count" >= 0 and "knowledge_ingestion_jobs"."published_candidate_count" + "knowledge_ingestion_jobs"."suppressed_candidate_count" + "knowledge_ingestion_jobs"."review_recommended_candidate_count" + "knowledge_ingestion_jobs"."verify_first_candidate_count" + "knowledge_ingestion_jobs"."failed_candidate_count" = "knowledge_ingestion_jobs"."terminal_candidate_count"),
	CONSTRAINT "knowledge_ingestion_jobs_stage_version_check" CHECK ("knowledge_ingestion_jobs"."stage_version" >= 1),
	CONSTRAINT "knowledge_ingestion_jobs_attempt_count_check" CHECK ("knowledge_ingestion_jobs"."attempt_count" >= 0 and "knowledge_ingestion_jobs"."attempt_count" <= "knowledge_ingestion_jobs"."max_attempts"),
	CONSTRAINT "knowledge_ingestion_jobs_max_attempts_check" CHECK ("knowledge_ingestion_jobs"."max_attempts" between 1 and 10),
	CONSTRAINT "knowledge_ingestion_jobs_submitter_email_check" CHECK (length(btrim("knowledge_ingestion_jobs"."submitted_by_email")) between 1 and 320),
	CONSTRAINT "knowledge_ingestion_jobs_error_code_check" CHECK ("knowledge_ingestion_jobs"."last_error_code" is null or "knowledge_ingestion_jobs"."last_error_code" ~ '^[a-z0-9_:-]{1,120}$'),
	CONSTRAINT "knowledge_ingestion_jobs_requeue_reason_code_check" CHECK ("knowledge_ingestion_jobs"."requeue_reason_code" is null or "knowledge_ingestion_jobs"."requeue_reason_code" ~ '^[a-z0-9_:-]{1,120}$'),
	CONSTRAINT "knowledge_ingestion_jobs_checkpoint_shape_check" CHECK ("knowledge_ingestion_jobs"."checkpoint" is null or (jsonb_typeof("knowledge_ingestion_jobs"."checkpoint") = 'object' and octet_length("knowledge_ingestion_jobs"."checkpoint"::text) <= 8192)),
	CONSTRAINT "knowledge_ingestion_jobs_claim_shape_check" CHECK (("knowledge_ingestion_jobs"."claimed_by" is null and "knowledge_ingestion_jobs"."claimed_at" is null and "knowledge_ingestion_jobs"."lease_expires_at" is null and "knowledge_ingestion_jobs"."fencing_token" is null) or ("knowledge_ingestion_jobs"."claimed_by" is not null and length(btrim("knowledge_ingestion_jobs"."claimed_by")) between 1 and 160 and "knowledge_ingestion_jobs"."claimed_at" is not null and "knowledge_ingestion_jobs"."lease_expires_at" > "knowledge_ingestion_jobs"."claimed_at" and "knowledge_ingestion_jobs"."fencing_token" ~ '^[a-f0-9]{64}$')),
	CONSTRAINT "knowledge_ingestion_jobs_terminal_claim_check" CHECK ("knowledge_ingestion_jobs"."stage" not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed') or ("knowledge_ingestion_jobs"."claimed_by" is null and "knowledge_ingestion_jobs"."claimed_at" is null and "knowledge_ingestion_jobs"."lease_expires_at" is null and "knowledge_ingestion_jobs"."fencing_token" is null)),
	CONSTRAINT "knowledge_ingestion_jobs_terminal_checkpoint_check" CHECK ("knowledge_ingestion_jobs"."stage" not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed') or "knowledge_ingestion_jobs"."checkpoint" is null)
);
--> statement-breakpoint
CREATE TABLE "knowledge_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reason" text NOT NULL,
	"priority" integer NOT NULL,
	"policy_id" text,
	"policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_for_sampling" boolean DEFAULT false NOT NULL,
	"executor_system" text,
	"resolution" text,
	"sampling_disposition_reason" text,
	"sampling_rationale" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_recommendations_versions_check" CHECK ("knowledge_recommendations"."content_version" >= 1 and "knowledge_recommendations"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_recommendations_status_check" CHECK ("knowledge_recommendations"."status" in ('open', 'in_review', 'resolved', 'superseded')),
	CONSTRAINT "knowledge_recommendations_reason_check" CHECK ("knowledge_recommendations"."reason" in ('risk', 'weak_evidence', 'freshness', 'conflict', 'duplicate_risk', 'missing_context', 'verification', 'relation', 'sampling')),
	CONSTRAINT "knowledge_recommendations_priority_check" CHECK ("knowledge_recommendations"."priority" between 1 and 100),
	CONSTRAINT "knowledge_recommendations_policy_snapshot_check" CHECK (jsonb_typeof("knowledge_recommendations"."policy_snapshot") = 'object' and octet_length("knowledge_recommendations"."policy_snapshot"::text) <= 1024),
	CONSTRAINT "knowledge_recommendations_required_sampling_check" CHECK ("knowledge_recommendations"."required_for_sampling" = false or "knowledge_recommendations"."reason" = 'sampling'),
	CONSTRAINT "knowledge_recommendations_executor_system_check" CHECK ("knowledge_recommendations"."executor_system" is null or length(btrim("knowledge_recommendations"."executor_system")) between 1 and 160),
	CONSTRAINT "knowledge_recommendations_resolution_check" CHECK ("knowledge_recommendations"."resolution" is null or "knowledge_recommendations"."resolution" in ('accepted', 'edited', 'suppressed', 'restored', 'verified', 'relation_resolved', 'sampling_passed', 'sampling_failed')),
	CONSTRAINT "knowledge_recommendations_sampling_reason_check" CHECK ("knowledge_recommendations"."sampling_disposition_reason" is null or "knowledge_recommendations"."sampling_disposition_reason" in ('confirmed', 'minor_issue', 'insufficient_evidence', 'stale_or_changed', 'material_error', 'safety_risk')),
	CONSTRAINT "knowledge_recommendations_sampling_rationale_check" CHECK ("knowledge_recommendations"."sampling_rationale" is null or length(btrim("knowledge_recommendations"."sampling_rationale")) between 1 and 500),
	CONSTRAINT "knowledge_recommendations_sampling_disposition_shape_check" CHECK (("knowledge_recommendations"."resolution" in ('sampling_passed', 'sampling_failed') and "knowledge_recommendations"."sampling_disposition_reason" is not null) or ("knowledge_recommendations"."resolution" is null or "knowledge_recommendations"."resolution" not in ('sampling_passed', 'sampling_failed')) and "knowledge_recommendations"."sampling_disposition_reason" is null and "knowledge_recommendations"."sampling_rationale" is null),
	CONSTRAINT "knowledge_recommendations_resolved_shape_check" CHECK (("knowledge_recommendations"."status" in ('open', 'in_review') and "knowledge_recommendations"."resolution" is null and "knowledge_recommendations"."resolved_by_user_id" is null and "knowledge_recommendations"."resolved_at" is null) or ("knowledge_recommendations"."status" in ('resolved', 'superseded') and "knowledge_recommendations"."resolution" is not null and "knowledge_recommendations"."resolved_by_user_id" is not null and "knowledge_recommendations"."executor_system" is null and "knowledge_recommendations"."resolved_at" is not null) or ("knowledge_recommendations"."status" = 'superseded' and "knowledge_recommendations"."resolution" is not null and "knowledge_recommendations"."resolved_by_user_id" is null and "knowledge_recommendations"."executor_system" is not null and length(btrim("knowledge_recommendations"."executor_system")) between 1 and 160 and "knowledge_recommendations"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_sampling_candidate_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"terminal_ingestion_job_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"corridor_bucket" text NOT NULL,
	"outside_corridor" boolean NOT NULL,
	"selected_for_sampling" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sampling_candidate_ledger_versions_check" CHECK ("knowledge_sampling_candidate_ledger"."content_version" >= 1 and "knowledge_sampling_candidate_ledger"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_sampling_candidate_ledger_corridor_shape_check" CHECK (("knowledge_sampling_candidate_ledger"."corridor_bucket" <> '' and "knowledge_sampling_candidate_ledger"."outside_corridor" = false) or ("knowledge_sampling_candidate_ledger"."corridor_bucket" = '' and "knowledge_sampling_candidate_ledger"."outside_corridor" = true))
);
--> statement-breakpoint
CREATE TABLE "knowledge_sampling_cohort_members" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"corridor_bucket" text,
	"outside_corridor" boolean,
	"selected_for_sampling" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sampling_cohort_members_versions_check" CHECK ("knowledge_sampling_cohort_members"."content_version" >= 1 and "knowledge_sampling_cohort_members"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_sampling_cohort_members_corridor_shape_check" CHECK (("knowledge_sampling_cohort_members"."corridor_bucket" is null and "knowledge_sampling_cohort_members"."outside_corridor" is null) or ("knowledge_sampling_cohort_members"."corridor_bucket" is not null and "knowledge_sampling_cohort_members"."outside_corridor" = false) or ("knowledge_sampling_cohort_members"."corridor_bucket" is null and "knowledge_sampling_cohort_members"."outside_corridor" = true))
);
--> statement-breakpoint
CREATE TABLE "knowledge_sampling_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"window_starts_at" timestamp NOT NULL,
	"window_ends_at" timestamp NOT NULL,
	"sampling_percent" integer DEFAULT 15 NOT NULL,
	"cohort_key" text NOT NULL,
	"escalated_at" timestamp,
	"suppressed_at" timestamp,
	"enrollment_candidate_count" integer,
	"enrollment_selected_count" integer,
	"enrollment_digest" text,
	"enrollment_sealed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_sampling_policies_window_check" CHECK ("knowledge_sampling_policies"."window_ends_at" > "knowledge_sampling_policies"."window_starts_at"),
	CONSTRAINT "knowledge_sampling_policies_percent_check" CHECK ("knowledge_sampling_policies"."sampling_percent" between 1 and 100),
	CONSTRAINT "knowledge_sampling_policies_cohort_key_check" CHECK (length(btrim("knowledge_sampling_policies"."cohort_key")) between 1 and 160),
	CONSTRAINT "knowledge_sampling_policies_enrollment_counts_check" CHECK (("knowledge_sampling_policies"."enrollment_candidate_count" is null and "knowledge_sampling_policies"."enrollment_selected_count" is null and "knowledge_sampling_policies"."enrollment_digest" is null and "knowledge_sampling_policies"."enrollment_sealed_at" is null) or ("knowledge_sampling_policies"."enrollment_candidate_count" >= 0 and "knowledge_sampling_policies"."enrollment_selected_count" >= 0 and "knowledge_sampling_policies"."enrollment_selected_count" <= "knowledge_sampling_policies"."enrollment_candidate_count" and "knowledge_sampling_policies"."enrollment_digest" ~ '^[a-f0-9]{64}$' and "knowledge_sampling_policies"."enrollment_sealed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_seed_batch_items" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"line_number" integer NOT NULL,
	"submitted_url" text NOT NULL,
	"canonical_url" text,
	"source_id" text,
	"status" text NOT NULL,
	"error_summary" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_seed_batch_items_status_check" CHECK ("knowledge_seed_batch_items"."status" in ('pending', 'reading', 'extracted', 'needs_review', 'approved', 'failed', 'duplicate', 'rejected')),
	CONSTRAINT "knowledge_seed_batch_items_line_number_check" CHECK ("knowledge_seed_batch_items"."line_number" > 0),
	CONSTRAINT "knowledge_seed_batch_items_submitted_url_check" CHECK (length(btrim("knowledge_seed_batch_items"."submitted_url")) between 1 and 2048),
	CONSTRAINT "knowledge_seed_batch_items_canonical_url_check" CHECK ("knowledge_seed_batch_items"."canonical_url" is null or length(btrim("knowledge_seed_batch_items"."canonical_url")) between 1 and 2048),
	CONSTRAINT "knowledge_seed_batch_items_error_summary_check" CHECK ("knowledge_seed_batch_items"."error_summary" is null or (length(btrim("knowledge_seed_batch_items"."error_summary")) between 1 and 500 and position(chr(10) in "knowledge_seed_batch_items"."error_summary") = 0 and position(chr(13) in "knowledge_seed_batch_items"."error_summary") = 0)),
	CONSTRAINT "knowledge_seed_batch_items_failure_shape_check" CHECK ("knowledge_seed_batch_items"."status" <> 'failed' or "knowledge_seed_batch_items"."error_summary" is not null),
	CONSTRAINT "knowledge_seed_batch_items_source_shape_check" CHECK ("knowledge_seed_batch_items"."status" in ('failed', 'duplicate') or "knowledge_seed_batch_items"."source_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "knowledge_seed_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text,
	"submitted_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_seed_batches_label_check" CHECK ("knowledge_seed_batches"."label" is null or (length(btrim("knowledge_seed_batches"."label")) between 1 and 160 and position(chr(10) in "knowledge_seed_batches"."label") = 0 and position(chr(13) in "knowledge_seed_batches"."label") = 0))
);
--> statement-breakpoint
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
	"created_by_user_id" text,
	"executor_system" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_source_suggestions_action_check" CHECK ("knowledge_source_suggestions"."action" in ('create', 'update', 'conflict', 'duplicate', 'no_action')),
	CONSTRAINT "knowledge_source_suggestions_review_card_check" CHECK ("knowledge_source_suggestions"."action" not in ('create', 'update', 'conflict') or "knowledge_source_suggestions"."suggested_card_id" is not null),
	CONSTRAINT "knowledge_source_suggestions_target_check" CHECK ("knowledge_source_suggestions"."action" not in ('update', 'conflict', 'duplicate') or "knowledge_source_suggestions"."target_card_id" is not null),
	CONSTRAINT "knowledge_source_suggestions_relationship_check" CHECK (("knowledge_source_suggestions"."action" in ('create', 'no_action') and "knowledge_source_suggestions"."target_card_id" is null or "knowledge_source_suggestions"."action" not in ('create', 'no_action')) and ("knowledge_source_suggestions"."action" in ('duplicate', 'no_action') and "knowledge_source_suggestions"."suggested_card_id" is null or "knowledge_source_suggestions"."action" not in ('duplicate', 'no_action')) and ("knowledge_source_suggestions"."suggested_card_id" is null or "knowledge_source_suggestions"."target_card_id" is null or "knowledge_source_suggestions"."suggested_card_id" <> "knowledge_source_suggestions"."target_card_id")),
	CONSTRAINT "knowledge_source_suggestions_required_summary_check" CHECK ("knowledge_source_suggestions"."action" <> 'update' or ("knowledge_source_suggestions"."before_summary" is not null and "knowledge_source_suggestions"."after_summary" is not null)),
	CONSTRAINT "knowledge_source_suggestions_conflict_summary_check" CHECK ("knowledge_source_suggestions"."action" <> 'conflict' or "knowledge_source_suggestions"."conflict_summary" is not null),
	CONSTRAINT "knowledge_source_suggestions_executor_shape_check" CHECK ("knowledge_source_suggestions"."created_by_user_id" is not null or ("knowledge_source_suggestions"."executor_system" is not null and length(btrim("knowledge_source_suggestions"."executor_system")) between 1 and 160)),
	CONSTRAINT "knowledge_source_suggestions_summary_length_check" CHECK (("knowledge_source_suggestions"."before_summary" is null or length(btrim("knowledge_source_suggestions"."before_summary")) between 1 and 1200) and ("knowledge_source_suggestions"."after_summary" is null or length(btrim("knowledge_source_suggestions"."after_summary")) between 1 and 1200) and ("knowledge_source_suggestions"."conflict_summary" is null or length(btrim("knowledge_source_suggestions"."conflict_summary")) between 1 and 1200) and ("knowledge_source_suggestions"."rationale" is null or length(btrim("knowledge_source_suggestions"."rationale")) between 1 and 1200))
);
--> statement-breakpoint
CREATE TABLE "knowledge_verify_first_sampling_obligations" (
	"id" text PRIMARY KEY NOT NULL,
	"terminal_ingestion_job_id" text NOT NULL,
	"policy_id" text NOT NULL,
	"knowledge_card_id" text NOT NULL,
	"content_version" integer NOT NULL,
	"evidence_set_revision" integer NOT NULL,
	"corridor_bucket" text NOT NULL,
	"outside_corridor" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_verify_first_sampling_obligations_versions_check" CHECK ("knowledge_verify_first_sampling_obligations"."content_version" >= 1 and "knowledge_verify_first_sampling_obligations"."evidence_set_revision" >= 1),
	CONSTRAINT "knowledge_verify_first_sampling_obligations_corridor_shape_check" CHECK (("knowledge_verify_first_sampling_obligations"."corridor_bucket" <> '' and "knowledge_verify_first_sampling_obligations"."outside_corridor" = false) or ("knowledge_verify_first_sampling_obligations"."corridor_bucket" = '' and "knowledge_verify_first_sampling_obligations"."outside_corridor" = true))
);
--> statement-breakpoint
CREATE TABLE "message_image_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"original_file_name" text,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_image_attachments_mime_type_check" CHECK ("message_image_attachments"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "message_image_attachments_byte_size_check" CHECK ("message_image_attachments"."byte_size" > 0 and "message_image_attachments"."byte_size" <= 5242880)
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"answer_annotations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "messages_role_check" CHECK ("messages"."role" in ('user', 'assistant')),
	CONSTRAINT "messages_content_not_empty_check" CHECK (length(btrim("messages"."content")) > 0),
	CONSTRAINT "messages_user_content_length_check" CHECK ("messages"."role" <> 'user' or char_length("messages"."content") <= 2000),
	CONSTRAINT "messages_answer_annotations_array_check" CHECK (jsonb_typeof("messages"."answer_annotations") = 'array')
);
--> statement-breakpoint
CREATE TABLE "public_mvp_evaluation_prompt_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"rubric_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_mvp_evaluation_prompt_sets_version_check" CHECK (length(btrim("public_mvp_evaluation_prompt_sets"."version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_prompt_sets_rubric_version_check" CHECK (length(btrim("public_mvp_evaluation_prompt_sets"."rubric_version")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "public_mvp_evaluation_result_policy_snapshots" (
	"result_id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"scenario_version" text NOT NULL,
	"selected_knowledge" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_candidate_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"excluded_reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_candidate_excluded" boolean DEFAULT false NOT NULL,
	"source_or_evidence_outcome" text NOT NULL,
	"web_fallback" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"finalization_outcome" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_scenario_id_check" CHECK ("public_mvp_evaluation_result_policy_snapshots"."scenario_id" in ('community_observation', 'independent_community_pattern', 'conditional_high_risk_claim', 'conflict_exclusion', 'source_withdrawal', 'web_fallback_unavailable')),
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_scenario_version_check" CHECK (length(btrim("public_mvp_evaluation_result_policy_snapshots"."scenario_version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_selected_knowledge_array_check" CHECK (jsonb_typeof("public_mvp_evaluation_result_policy_snapshots"."selected_knowledge") = 'array' and jsonb_array_length("public_mvp_evaluation_result_policy_snapshots"."selected_knowledge") <= 5),
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_counts_object_check" CHECK (jsonb_typeof("public_mvp_evaluation_result_policy_snapshots"."excluded_candidate_counts") = 'object' and octet_length("public_mvp_evaluation_result_policy_snapshots"."excluded_candidate_counts"::text) <= 1024),
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_reasons_array_check" CHECK (jsonb_typeof("public_mvp_evaluation_result_policy_snapshots"."excluded_reason_codes") = 'array' and jsonb_array_length("public_mvp_evaluation_result_policy_snapshots"."excluded_reason_codes") <= 10),
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_web_fallback_object_check" CHECK (jsonb_typeof("public_mvp_evaluation_result_policy_snapshots"."web_fallback") = 'object' and octet_length("public_mvp_evaluation_result_policy_snapshots"."web_fallback"::text) <= 2048),
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_source_outcome_check" CHECK (length(btrim("public_mvp_evaluation_result_policy_snapshots"."source_or_evidence_outcome")) between 1 and 120),
	CONSTRAINT "public_mvp_evaluation_policy_snapshots_finalization_outcome_check" CHECK (length(btrim("public_mvp_evaluation_result_policy_snapshots"."finalization_outcome")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "public_mvp_evaluation_result_scores" (
	"result_id" text NOT NULL,
	"dimension" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_mvp_evaluation_result_scores_result_id_dimension_pk" PRIMARY KEY("result_id","dimension"),
	CONSTRAINT "public_mvp_evaluation_result_scores_dimension_check" CHECK ("public_mvp_evaluation_result_scores"."dimension" in ('user_context_use', 'practical_specificity', 'source_grounding', 'uncertainty_handling', 'family_awareness', 'vietnamese_clarity')),
	CONSTRAINT "public_mvp_evaluation_result_scores_bounds_check" CHECK ("public_mvp_evaluation_result_scores"."score" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "public_mvp_evaluation_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"prompt_set_id" text NOT NULL,
	"prompt_set_version" text NOT NULL,
	"prompt_type" text NOT NULL,
	"prompt_version" text NOT NULL,
	"scenario_id" text NOT NULL,
	"scenario_version" text NOT NULL,
	"model_version" text NOT NULL,
	"status" text NOT NULL,
	"answer_text" text,
	"safe_error_code" text,
	"unsupported_claim_flag" boolean DEFAULT false NOT NULL,
	"missing_uncertainty_flag" boolean DEFAULT false NOT NULL,
	"no_better_than_generic_flag" boolean DEFAULT false NOT NULL,
	"unsupported_community_wording_flag" boolean DEFAULT false NOT NULL,
	"required_caveat_omitted_flag" boolean DEFAULT false NOT NULL,
	"conflicted_knowledge_excluded_flag" boolean DEFAULT true NOT NULL,
	"stale_withdrawn_source_exposure_flag" boolean DEFAULT false NOT NULL,
	"raw_evidence_leakage_flag" boolean DEFAULT false NOT NULL,
	"fallback_verification_guidance_met_flag" boolean DEFAULT true NOT NULL,
	"assistant_message_id" text,
	"retrieval_decision_id" text,
	"provenance_id" text,
	"usage_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_mvp_evaluation_results_prompt_type_check" CHECK ("public_mvp_evaluation_results"."prompt_type" in ('magic_moment_family_trip', 'sparse_data', 'freshness_sensitive', 'service_activity', 'route_logistics')),
	CONSTRAINT "public_mvp_evaluation_results_status_check" CHECK ("public_mvp_evaluation_results"."status" in ('scored', 'failed', 'unscored')),
	CONSTRAINT "public_mvp_evaluation_results_prompt_set_version_check" CHECK (length(btrim("public_mvp_evaluation_results"."prompt_set_version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_results_prompt_version_check" CHECK (length(btrim("public_mvp_evaluation_results"."prompt_version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_results_scenario_id_check" CHECK ("public_mvp_evaluation_results"."scenario_id" in ('community_observation', 'independent_community_pattern', 'conditional_high_risk_claim', 'conflict_exclusion', 'source_withdrawal', 'web_fallback_unavailable')),
	CONSTRAINT "public_mvp_evaluation_results_scenario_version_check" CHECK (length(btrim("public_mvp_evaluation_results"."scenario_version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_results_model_version_check" CHECK (length(btrim("public_mvp_evaluation_results"."model_version")) between 1 and 160),
	CONSTRAINT "public_mvp_evaluation_results_answer_length_check" CHECK ("public_mvp_evaluation_results"."answer_text" is null or length(btrim("public_mvp_evaluation_results"."answer_text")) between 1 and 12000),
	CONSTRAINT "public_mvp_evaluation_results_safe_error_check" CHECK ("public_mvp_evaluation_results"."safe_error_code" is null or "public_mvp_evaluation_results"."safe_error_code" in ('evaluator_failed', 'invalid_score_payload')),
	CONSTRAINT "public_mvp_evaluation_results_status_shape_check" CHECK (("public_mvp_evaluation_results"."status" = 'scored' and "public_mvp_evaluation_results"."answer_text" is not null and "public_mvp_evaluation_results"."safe_error_code" is null) or ("public_mvp_evaluation_results"."status" <> 'scored' and "public_mvp_evaluation_results"."safe_error_code" is not null))
);
--> statement-breakpoint
CREATE TABLE "public_mvp_evaluation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_set_id" text NOT NULL,
	"prompt_set_version" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"ai_gateway_model_id" text,
	"model_version" text NOT NULL,
	"status" text NOT NULL,
	"run_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "public_mvp_evaluation_runs_status_check" CHECK ("public_mvp_evaluation_runs"."status" in ('running', 'completed', 'partial_failed', 'failed')),
	CONSTRAINT "public_mvp_evaluation_runs_prompt_set_version_check" CHECK (length(btrim("public_mvp_evaluation_runs"."prompt_set_version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_runs_model_version_check" CHECK (length(btrim("public_mvp_evaluation_runs"."model_version")) between 1 and 160),
	CONSTRAINT "public_mvp_evaluation_runs_metadata_object_check" CHECK (jsonb_typeof("public_mvp_evaluation_runs"."run_metadata") = 'object')
);
--> statement-breakpoint
CREATE TABLE "raw_source_material" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"raw_text" text,
	"file_name" text,
	"mime_type" text,
	"byte_size" integer,
	"storage_key" text,
	"raw_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raw_source_material_text_length_check" CHECK ("raw_source_material"."raw_text" is null or (length(btrim("raw_source_material"."raw_text")) > 0 and char_length("raw_source_material"."raw_text") <= 120000)),
	CONSTRAINT "raw_source_material_file_name_check" CHECK ("raw_source_material"."file_name" is null or length(btrim("raw_source_material"."file_name")) > 0),
	CONSTRAINT "raw_source_material_mime_type_check" CHECK ("raw_source_material"."mime_type" is null or "raw_source_material"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "raw_source_material_byte_size_check" CHECK ("raw_source_material"."byte_size" is null or ("raw_source_material"."byte_size" > 0 and "raw_source_material"."byte_size" <= 5242880)),
	CONSTRAINT "raw_source_material_file_metadata_complete_check" CHECK (("raw_source_material"."file_name" is null and "raw_source_material"."mime_type" is null and "raw_source_material"."byte_size" is null) or ("raw_source_material"."file_name" is not null and "raw_source_material"."mime_type" is not null and "raw_source_material"."byte_size" is not null))
);
--> statement-breakpoint
CREATE TABLE "referral_attributions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"referral_code_id" text NOT NULL,
	"referrer_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_attributions_no_self_referral_check" CHECK ("referral_attributions"."referrer_user_id" is null or "referral_attributions"."referrer_user_id" <> "referral_attributions"."user_id")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"referrer_user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_code_format_check" CHECK ("referral_codes"."code" ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_capture_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"version_sequence" integer NOT NULL,
	"capture_kind" text NOT NULL,
	"raw_text" text,
	"file_name" text,
	"mime_type" text,
	"byte_size" integer,
	"storage_key" text,
	"raw_metadata" jsonb,
	"content_hash" text NOT NULL,
	"executor_system" text,
	"captured_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"payload_deleted_at" timestamp,
	CONSTRAINT "source_capture_versions_sequence_check" CHECK ("source_capture_versions"."version_sequence" >= 1),
	CONSTRAINT "source_capture_versions_hash_check" CHECK ("source_capture_versions"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "source_capture_versions_kind_check" CHECK ("source_capture_versions"."capture_kind" in ('url', 'facebook', 'youtube', 'copied_post', 'pasted_text', 'screenshot')),
	CONSTRAINT "source_capture_versions_executor_system_check" CHECK ("source_capture_versions"."executor_system" is null or length(btrim("source_capture_versions"."executor_system")) between 1 and 160),
	CONSTRAINT "source_capture_versions_text_length_check" CHECK ("source_capture_versions"."raw_text" is null or (length(btrim("source_capture_versions"."raw_text")) > 0 and char_length("source_capture_versions"."raw_text") <= 120000)),
	CONSTRAINT "source_capture_versions_tombstone_shape_check" CHECK ("source_capture_versions"."payload_deleted_at" is null or ("source_capture_versions"."raw_text" is null and "source_capture_versions"."file_name" is null and "source_capture_versions"."mime_type" is null and "source_capture_versions"."byte_size" is null and "source_capture_versions"."storage_key" is null and "source_capture_versions"."raw_metadata" is null))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"url" text,
	"canonical_url" text,
	"label" text NOT NULL,
	"publisher" text,
	"collected_date" text,
	"source_type" text NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"partner" boolean DEFAULT false NOT NULL,
	"eligibility" text DEFAULT 'eligible' NOT NULL,
	"removal_reason" text,
	"removed_by_user_id" text,
	"removal_completed_at" timestamp,
	"submitted_by_user_id" text NOT NULL,
	"current_capture_version_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sources_kind_check" CHECK ("sources"."kind" in ('url', 'facebook', 'youtube', 'copied_post', 'pasted_text', 'screenshot')),
	CONSTRAINT "sources_source_type_check" CHECK ("sources"."source_type" in ('curated', 'community')),
	CONSTRAINT "sources_verification_status_check" CHECK ("sources"."verification_status" in ('unverified', 'verified')),
	CONSTRAINT "sources_eligibility_check" CHECK ("sources"."eligibility" in ('eligible', 'withdrawn')),
	CONSTRAINT "sources_removal_reason_check" CHECK ("sources"."removal_reason" is null or "sources"."removal_reason" in ('withdrawn', 'inaccessible', 'removed')),
	CONSTRAINT "sources_removal_shape_check" CHECK (("sources"."eligibility" = 'eligible' and "sources"."removal_reason" is null and "sources"."removed_by_user_id" is null and "sources"."removal_completed_at" is null) or ("sources"."eligibility" = 'withdrawn' and "sources"."removal_reason" is not null and "sources"."removed_by_user_id" is not null and "sources"."removal_completed_at" is not null)),
	CONSTRAINT "sources_label_safe_metadata_check" CHECK (length(btrim("sources"."label")) between 1 and 200 and position(chr(10) in "sources"."label") = 0 and position(chr(13) in "sources"."label") = 0),
	CONSTRAINT "sources_publisher_safe_metadata_check" CHECK ("sources"."publisher" is null or (length(btrim("sources"."publisher")) between 1 and 160 and position(chr(10) in "sources"."publisher") = 0 and position(chr(13) in "sources"."publisher") = 0)),
	CONSTRAINT "sources_collected_date_valid_check" CHECK ("sources"."collected_date" is null or ("sources"."collected_date" ~ '^\d{4}-\d{2}-\d{2}$' and to_char(to_date("sources"."collected_date", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "sources"."collected_date")),
	CONSTRAINT "sources_url_kind_check" CHECK ("sources"."kind" not in ('url', 'facebook', 'youtube') or "sources"."url" is not null),
	CONSTRAINT "sources_no_url_for_textual_kind_check" CHECK ("sources"."kind" not in ('copied_post', 'pasted_text', 'screenshot') or "sources"."url" is null),
	CONSTRAINT "sources_community_defaults_check" CHECK ("sources"."source_type" <> 'community' or ("sources"."verification_status" = 'unverified' and "sources"."official" = false and "sources"."partner" = false)),
	CONSTRAINT "sources_youtube_defaults_check" CHECK ("sources"."kind" <> 'youtube' or ("sources"."source_type" = 'community' and "sources"."verification_status" = 'unverified' and "sources"."official" = false and "sources"."partner" = false))
);
--> statement-breakpoint
CREATE TABLE "trip_change_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"creator_class" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rationale" text NOT NULL,
	"operations" jsonb NOT NULL,
	"expected_aggregate_version" integer NOT NULL,
	"expected_item_versions" jsonb,
	"ordering_preconditions" jsonb,
	"alternatives" jsonb,
	"expires_at" timestamp,
	"terminal_timestamp" timestamp,
	"source_assistant_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_change_proposals_creator_class_check" CHECK ("trip_change_proposals"."creator_class" in ('ai_orchestration', 'owner_command')),
	CONSTRAINT "trip_change_proposals_status_check" CHECK ("trip_change_proposals"."status" in ('pending', 'applied', 'dismissed', 'expired')),
	CONSTRAINT "trip_change_proposals_expected_aggregate_version_check" CHECK ("trip_change_proposals"."expected_aggregate_version" >= 1),
	CONSTRAINT "trip_change_proposals_rationale_check" CHECK (length(btrim("trip_change_proposals"."rationale")) between 1 and 500 and position(chr(10) in "trip_change_proposals"."rationale") = 0 and position(chr(13) in "trip_change_proposals"."rationale") = 0),
	CONSTRAINT "trip_change_proposals_operations_array_check" CHECK (jsonb_typeof("trip_change_proposals"."operations") = 'array' and jsonb_array_length("trip_change_proposals"."operations") between 1 and 20),
	CONSTRAINT "trip_change_proposals_expected_item_versions_check" CHECK ("trip_change_proposals"."expected_item_versions" is null or jsonb_typeof("trip_change_proposals"."expected_item_versions") = 'object'),
	CONSTRAINT "trip_change_proposals_alternatives_check" CHECK ("trip_change_proposals"."alternatives" is null or (jsonb_typeof("trip_change_proposals"."alternatives") = 'array' and jsonb_array_length("trip_change_proposals"."alternatives") <= 5)),
	CONSTRAINT "trip_change_proposals_status_terminal_shape_check" CHECK (("trip_change_proposals"."status" = 'pending' and "trip_change_proposals"."terminal_timestamp" is null) or ("trip_change_proposals"."status" in ('applied', 'dismissed', 'expired') and "trip_change_proposals"."terminal_timestamp" is not null))
);
--> statement-breakpoint
CREATE TABLE "trip_plan_change_history" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"proposal_id" text,
	"actor_user_id" text,
	"actor_class" text DEFAULT 'user' NOT NULL,
	"actor_system" text,
	"operation_class" text NOT NULL,
	"affected_item_references" jsonb NOT NULL,
	"safe_before_after_summary" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_plan_change_history_actor_class_check" CHECK ("trip_plan_change_history"."actor_class" in ('user', 'system')),
	CONSTRAINT "trip_plan_change_history_actor_shape_check" CHECK (("trip_plan_change_history"."actor_class" = 'user' and "trip_plan_change_history"."actor_user_id" is not null and "trip_plan_change_history"."actor_system" is null) or ("trip_plan_change_history"."actor_class" = 'system' and "trip_plan_change_history"."actor_user_id" is null and "trip_plan_change_history"."actor_system" is not null and length(btrim("trip_plan_change_history"."actor_system")) > 0)),
	CONSTRAINT "trip_plan_change_history_operation_class_check" CHECK ("trip_plan_change_history"."operation_class" in ('apply', 'dismiss', 'expire')),
	CONSTRAINT "trip_plan_change_history_affected_references_check" CHECK (jsonb_typeof("trip_plan_change_history"."affected_item_references") = 'array'),
	CONSTRAINT "trip_plan_change_history_safe_summary_check" CHECK (jsonb_typeof("trip_plan_change_history"."safe_before_after_summary") = 'object' and octet_length("trip_plan_change_history"."safe_before_after_summary"::text) <= 8192)
);
--> statement-breakpoint
CREATE TABLE "trip_plan_items" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"anchor_role" text,
	"type" text,
	"state" text NOT NULL,
	"label" text NOT NULL,
	"notes" text,
	"planned_at" timestamp,
	"ordinal" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_item_id" text,
	"backup_target_item_id" text,
	"transport_origin_label" text,
	"transport_destination_label" text,
	"accommodation_place_area_label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_plan_items_shape_check" CHECK (("trip_plan_items"."kind" = 'anchor' and "trip_plan_items"."anchor_role" in ('origin','destination','region','required_stop','accommodation') and "trip_plan_items"."type" is null) or ("trip_plan_items"."kind" in ('leg','activity') and "trip_plan_items"."anchor_role" is null and "trip_plan_items"."type" in ('transport','visit','food','rest','accommodation'))),
	CONSTRAINT "trip_plan_items_state_check" CHECK ("trip_plan_items"."state" in ('idea','planned','confirmed','backup')),
	CONSTRAINT "trip_plan_items_version_check" CHECK ("trip_plan_items"."version" >= 1),
	CONSTRAINT "trip_plan_items_ordinal_check" CHECK ("trip_plan_items"."ordinal" >= 0),
	CONSTRAINT "trip_plan_items_backup_check" CHECK (("trip_plan_items"."state" = 'backup' and "trip_plan_items"."backup_target_item_id" is not null) or ("trip_plan_items"."state" <> 'backup' and "trip_plan_items"."backup_target_item_id" is null)),
	CONSTRAINT "trip_plan_items_label_check" CHECK (length(btrim("trip_plan_items"."label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."label") = 0 and position(chr(13) in "trip_plan_items"."label") = 0),
	CONSTRAINT "trip_plan_items_notes_check" CHECK ("trip_plan_items"."notes" is null or (length(btrim("trip_plan_items"."notes")) between 1 and 1000 and position(chr(10) in "trip_plan_items"."notes") = 0 and position(chr(13) in "trip_plan_items"."notes") = 0)),
	CONSTRAINT "trip_plan_items_location_check" CHECK (("trip_plan_items"."type" = 'transport' or ("trip_plan_items"."transport_origin_label" is null and "trip_plan_items"."transport_destination_label" is null)) and ("trip_plan_items"."type" = 'accommodation' or "trip_plan_items"."accommodation_place_area_label" is null) and ("trip_plan_items"."transport_origin_label" is null or (length(btrim("trip_plan_items"."transport_origin_label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."transport_origin_label") = 0 and position(chr(13) in "trip_plan_items"."transport_origin_label") = 0)) and ("trip_plan_items"."transport_destination_label" is null or (length(btrim("trip_plan_items"."transport_destination_label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."transport_destination_label") = 0 and position(chr(13) in "trip_plan_items"."transport_destination_label") = 0)) and ("trip_plan_items"."accommodation_place_area_label" is null or (length(btrim("trip_plan_items"."accommodation_place_area_label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."accommodation_place_area_label") = 0 and position(chr(13) in "trip_plan_items"."accommodation_place_area_label") = 0)))
);
--> statement-breakpoint
CREATE TABLE "trip_project_constraints" (
	"trip_project_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"adult_count" integer,
	"child_count" integer,
	"children" jsonb,
	"vehicle_type" text,
	"ev_charging_need" text,
	"driving_tolerance_hours" integer,
	"budget_currency" text,
	"budget_min_vnd" integer,
	"budget_max_vnd" integer,
	"preference_tags" jsonb,
	"avoid_items" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_project_constraints_version_check" CHECK ("trip_project_constraints"."version" >= 1),
	CONSTRAINT "trip_project_constraints_counts_check" CHECK (("trip_project_constraints"."adult_count" is not null or "trip_project_constraints"."child_count" is not null) and coalesce("trip_project_constraints"."adult_count", 0) + coalesce("trip_project_constraints"."child_count", 0) between 1 and 20 and ("trip_project_constraints"."adult_count" is null or "trip_project_constraints"."adult_count" between 0 and 20) and ("trip_project_constraints"."child_count" is null or "trip_project_constraints"."child_count" between 0 and 20)),
	CONSTRAINT "trip_project_constraints_children_array_check" CHECK ("trip_project_constraints"."children" is null or (jsonb_typeof("trip_project_constraints"."children") = 'array' and jsonb_array_length("trip_project_constraints"."children") <= 10)),
	CONSTRAINT "trip_project_constraints_vehicle_check" CHECK ("trip_project_constraints"."vehicle_type" is null or "trip_project_constraints"."vehicle_type" in ('car', 'motorcycle', 'ev')),
	CONSTRAINT "trip_project_constraints_ev_check" CHECK ("trip_project_constraints"."ev_charging_need" is null or ("trip_project_constraints"."vehicle_type" = 'ev' and "trip_project_constraints"."ev_charging_need" in ('none', 'preferred', 'required'))),
	CONSTRAINT "trip_project_constraints_driving_check" CHECK ("trip_project_constraints"."driving_tolerance_hours" is null or "trip_project_constraints"."driving_tolerance_hours" between 1 and 12),
	CONSTRAINT "trip_project_constraints_budget_check" CHECK (("trip_project_constraints"."budget_currency" is null and "trip_project_constraints"."budget_min_vnd" is null and "trip_project_constraints"."budget_max_vnd" is null) or ("trip_project_constraints"."budget_currency" = 'VND' and "trip_project_constraints"."budget_min_vnd" between 0 and 1000000000 and "trip_project_constraints"."budget_max_vnd" between 0 and 1000000000 and "trip_project_constraints"."budget_min_vnd" <= "trip_project_constraints"."budget_max_vnd")),
	CONSTRAINT "trip_project_constraints_preferences_array_check" CHECK ("trip_project_constraints"."preference_tags" is null or (jsonb_typeof("trip_project_constraints"."preference_tags") = 'array' and jsonb_array_length("trip_project_constraints"."preference_tags") <= 20)),
	CONSTRAINT "trip_project_constraints_avoid_items_array_check" CHECK ("trip_project_constraints"."avoid_items" is null or (jsonb_typeof("trip_project_constraints"."avoid_items") = 'array' and jsonb_array_length("trip_project_constraints"."avoid_items") <= 20))
);
--> statement-breakpoint
CREATE TABLE "trip_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"origin" text,
	"destination" text,
	"start_date" text,
	"end_date" text,
	"travelers" text,
	"notes" text,
	"primary_conversation_id" text,
	"aggregate_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_projects_title_not_empty_check" CHECK (length(btrim("trip_projects"."title")) > 0),
	CONSTRAINT "trip_projects_aggregate_version_check" CHECK ("trip_projects"."aggregate_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_check" CHECK ("user_roles"."role" in ('traveler', 'operator', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_no_system_executor_id_check" CHECK ("users"."id" not in ('system-ai-orchestration', 'system-knowledge-pipeline', 'system-trip-planning', 'system-facebook-capture', 'system-youtube-capture'))
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "web_search_results" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"user_message_id" text NOT NULL,
	"query" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"snippet" text NOT NULL,
	"content" text,
	"provider" text NOT NULL,
	"provider_score" real,
	"checked_at" timestamp NOT NULL,
	"source_type" text NOT NULL,
	"confidence" text NOT NULL,
	"trigger_reason" text NOT NULL,
	"rank" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "web_search_results_query_length_check" CHECK (length(btrim("web_search_results"."query")) between 1 and 500),
	CONSTRAINT "web_search_results_title_length_check" CHECK (length(btrim("web_search_results"."title")) between 1 and 300),
	CONSTRAINT "web_search_results_url_length_check" CHECK (length(btrim("web_search_results"."url")) between 1 and 2048),
	CONSTRAINT "web_search_results_snippet_length_check" CHECK (length(btrim("web_search_results"."snippet")) between 1 and 1200),
	CONSTRAINT "web_search_results_content_length_check" CHECK ("web_search_results"."content" is null or length(btrim("web_search_results"."content")) between 1 and 2000),
	CONSTRAINT "web_search_results_provider_check" CHECK (length(btrim("web_search_results"."provider")) between 1 and 80),
	CONSTRAINT "web_search_results_score_check" CHECK ("web_search_results"."provider_score" is null or ("web_search_results"."provider_score" >= 0 and "web_search_results"."provider_score" <= 1)),
	CONSTRAINT "web_search_results_source_type_check" CHECK ("web_search_results"."source_type" in ('official', 'provider', 'community', 'general')),
	CONSTRAINT "web_search_results_confidence_check" CHECK ("web_search_results"."confidence" = 'unverified'),
	CONSTRAINT "web_search_results_trigger_reason_check" CHECK ("web_search_results"."trigger_reason" in ('no_active_knowledge', 'insufficient_active_knowledge', 'freshness_sensitive_request', 'active_knowledge_may_be_stale', 'source_conflict', 'excluded_conflict_candidate', 'excluded_verification_required_candidate', 'selected_knowledge_requires_verification', 'active_knowledge_unavailable', 'no_approved_knowledge', 'insufficient_approved_knowledge', 'approved_knowledge_may_be_stale', 'approved_knowledge_unavailable')),
	CONSTRAINT "web_search_results_rank_check" CHECK ("web_search_results"."rank" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_user_id_idx" ON "conversations" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_id_trip_project_user_id_idx" ON "conversations" USING btree ("id","trip_project_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_ingestion_jobs_capture_version_id_idx" ON "knowledge_ingestion_jobs" USING btree ("capture_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_ingestion_jobs_id_source_capture_idx" ON "knowledge_ingestion_jobs" USING btree ("id","source_id","capture_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_id_user_id_idx" ON "messages" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_id_conversation_id_user_id_idx" ON "messages" USING btree ("id","conversation_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_id_conversation_id_user_id_role_unique" ON "messages" USING btree ("id","conversation_id","user_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "source_capture_versions_id_source_id_idx" ON "source_capture_versions" USING btree ("id","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_projects_id_user_id_idx" ON "trip_projects" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_trip_project_id_trip_projects_id_fk" FOREIGN KEY ("trip_project_id") REFERENCES "public"."trip_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_message_id_messages_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_ai_gateway_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("ai_gateway_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_usefulness_feedback" ADD CONSTRAINT "answer_usefulness_feedback_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id","assistant_message_role") REFERENCES "public"."messages"("id","conversation_id","user_id","role") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_user_message_owner_fk" FOREIGN KEY ("user_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_response_provenance" ADD CONSTRAINT "assistant_response_provenance_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_user_message_owner_fk" FOREIGN KEY ("user_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_assistant_message_owner_fk" FOREIGN KEY ("assistant_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_source_message_owner_fk" FOREIGN KEY ("source_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_trip_project_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_context" ADD CONSTRAINT "chat_context_conversation_trip_project_owner_fk" FOREIGN KEY ("conversation_id","trip_project_id","user_id") REFERENCES "public"."conversations"("id","trip_project_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trip_project_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_raw_material_fk" FOREIGN KEY ("raw_source_material_id") REFERENCES "public"."raw_source_material"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_capture_version_source_fk" FOREIGN KEY ("capture_version_id","source_id") REFERENCES "public"."source_capture_versions"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_capture_version_source_fk" FOREIGN KEY ("capture_version_id","source_id") REFERENCES "public"."source_capture_versions"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_evidence" ADD CONSTRAINT "knowledge_card_evidence_card_source_fk" FOREIGN KEY ("knowledge_card_id","source_id") REFERENCES "public"."knowledge_card_sources"("knowledge_card_id","source_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD CONSTRAINT "knowledge_card_search_documents_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_sources" ADD CONSTRAINT "knowledge_card_sources_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_card_sources" ADD CONSTRAINT "knowledge_card_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_ai_gateway_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("ai_gateway_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_facebook_capture_review_id_facebook_capture_reviews_id_fk" FOREIGN KEY ("facebook_capture_review_id") REFERENCES "public"."facebook_capture_reviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_extraction_jobs" ADD CONSTRAINT "knowledge_extraction_jobs_capture_version_source_fk" FOREIGN KEY ("capture_version_id","source_id") REFERENCES "public"."source_capture_versions"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_index_dirty_markers" ADD CONSTRAINT "knowledge_index_dirty_markers_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_ingestion_job_id_knowledge_ingestion_jobs_id_fk" FOREIGN KEY ("ingestion_job_id") REFERENCES "public"."knowledge_ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_extraction_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("extraction_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_parent_capture_fk" FOREIGN KEY ("ingestion_job_id","source_id","capture_version_id") REFERENCES "public"."knowledge_ingestion_jobs"("id","source_id","capture_version_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" ADD CONSTRAINT "knowledge_ingestion_jobs_capture_version_source_fk" FOREIGN KEY ("capture_version_id","source_id") REFERENCES "public"."source_capture_versions"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_policy_id_knowledge_sampling_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."knowledge_sampling_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_recommendations" ADD CONSTRAINT "knowledge_recommendations_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_candidate_ledger" ADD CONSTRAINT "knowledge_sampling_candidate_ledger_terminal_ingestion_job_id_knowledge_ingestion_jobs_id_fk" FOREIGN KEY ("terminal_ingestion_job_id") REFERENCES "public"."knowledge_ingestion_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_candidate_ledger" ADD CONSTRAINT "knowledge_sampling_candidate_ledger_policy_id_knowledge_sampling_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."knowledge_sampling_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_candidate_ledger" ADD CONSTRAINT "knowledge_sampling_candidate_ledger_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD CONSTRAINT "knowledge_sampling_cohort_members_policy_id_knowledge_sampling_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."knowledge_sampling_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sampling_cohort_members" ADD CONSTRAINT "knowledge_sampling_cohort_members_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_seed_batch_items" ADD CONSTRAINT "knowledge_seed_batch_items_batch_id_knowledge_seed_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."knowledge_seed_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_seed_batch_items" ADD CONSTRAINT "knowledge_seed_batch_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_seed_batches" ADD CONSTRAINT "knowledge_seed_batches_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_suggested_card_id_knowledge_cards_id_fk" FOREIGN KEY ("suggested_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_target_card_id_knowledge_cards_id_fk" FOREIGN KEY ("target_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_ai_gateway_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("ai_gateway_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_source_suggestions" ADD CONSTRAINT "knowledge_source_suggestions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_verify_first_sampling_obligations" ADD CONSTRAINT "knowledge_verify_first_sampling_obligations_terminal_ingestion_job_id_knowledge_ingestion_jobs_id_fk" FOREIGN KEY ("terminal_ingestion_job_id") REFERENCES "public"."knowledge_ingestion_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_verify_first_sampling_obligations" ADD CONSTRAINT "knowledge_verify_first_sampling_obligations_policy_id_knowledge_sampling_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."knowledge_sampling_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_verify_first_sampling_obligations" ADD CONSTRAINT "knowledge_verify_first_sampling_obligations_knowledge_card_id_knowledge_cards_id_fk" FOREIGN KEY ("knowledge_card_id") REFERENCES "public"."knowledge_cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_message_owner_fk" FOREIGN KEY ("message_id","user_id") REFERENCES "public"."messages"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_image_attachments" ADD CONSTRAINT "message_image_attachments_message_conversation_owner_fk" FOREIGN KEY ("message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_result_policy_snapshots" ADD CONSTRAINT "public_mvp_evaluation_result_policy_snapshots_result_id_public_mvp_evaluation_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."public_mvp_evaluation_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_result_scores" ADD CONSTRAINT "public_mvp_evaluation_result_scores_result_id_public_mvp_evaluation_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."public_mvp_evaluation_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD CONSTRAINT "public_mvp_evaluation_results_run_id_public_mvp_evaluation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."public_mvp_evaluation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD CONSTRAINT "public_mvp_evaluation_results_prompt_set_id_public_mvp_evaluation_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."public_mvp_evaluation_prompt_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD CONSTRAINT "public_mvp_evaluation_results_assistant_message_id_messages_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD CONSTRAINT "public_mvp_evaluation_results_retrieval_decision_id_assistant_retrieval_decisions_id_fk" FOREIGN KEY ("retrieval_decision_id") REFERENCES "public"."assistant_retrieval_decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD CONSTRAINT "public_mvp_evaluation_results_provenance_id_assistant_response_provenance_id_fk" FOREIGN KEY ("provenance_id") REFERENCES "public"."assistant_response_provenance"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_results" ADD CONSTRAINT "public_mvp_evaluation_results_usage_event_id_ai_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."ai_usage_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_runs" ADD CONSTRAINT "public_mvp_evaluation_runs_prompt_set_id_public_mvp_evaluation_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."public_mvp_evaluation_prompt_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_runs" ADD CONSTRAINT "public_mvp_evaluation_runs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_mvp_evaluation_runs" ADD CONSTRAINT "public_mvp_evaluation_runs_ai_gateway_model_id_ai_gateway_models_id_fk" FOREIGN KEY ("ai_gateway_model_id") REFERENCES "public"."ai_gateway_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_source_material" ADD CONSTRAINT "raw_source_material_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referral_code_id_referral_codes_id_fk" FOREIGN KEY ("referral_code_id") REFERENCES "public"."referral_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_capture_versions" ADD CONSTRAINT "source_capture_versions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_change_proposals" ADD CONSTRAINT "trip_change_proposals_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_change_history" ADD CONSTRAINT "trip_plan_change_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_change_history" ADD CONSTRAINT "trip_plan_change_history_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ADD CONSTRAINT "trip_plan_items_parent_item_id_trip_plan_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."trip_plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ADD CONSTRAINT "trip_plan_items_backup_target_item_id_trip_plan_items_id_fk" FOREIGN KEY ("backup_target_item_id") REFERENCES "public"."trip_plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ADD CONSTRAINT "trip_plan_items_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_project_constraints" ADD CONSTRAINT "trip_project_constraints_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_projects" ADD CONSTRAINT "trip_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_search_results" ADD CONSTRAINT "web_search_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_search_results" ADD CONSTRAINT "web_search_results_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_search_results" ADD CONSTRAINT "web_search_results_user_message_owner_fk" FOREIGN KEY ("user_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_gateway_models_gateway_model_purpose_idx" ON "ai_gateway_models" USING btree ("gateway_model_name","purpose");--> statement-breakpoint
CREATE INDEX "ai_gateway_models_purpose_active_idx" ON "ai_gateway_models" USING btree ("purpose","active");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_gateway_models_one_default_per_purpose_idx" ON "ai_gateway_models" USING btree ("purpose") WHERE "ai_gateway_models"."default_for_purpose" = true;--> statement-breakpoint
CREATE INDEX "ai_gateway_models_default_idx" ON "ai_gateway_models" USING btree ("purpose","default_for_purpose");--> statement-breakpoint
CREATE INDEX "ai_usage_events_initiated_by_user_id_created_at_idx" ON "ai_usage_events" USING btree ("initiated_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_executor_system_created_at_idx" ON "ai_usage_events" USING btree ("executor_system","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_events_conversation_id_idx" ON "ai_usage_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_ai_gateway_model_id_idx" ON "ai_usage_events" USING btree ("ai_gateway_model_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_status_idx" ON "ai_usage_events" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "answer_usefulness_feedback_assistant_user_idx" ON "answer_usefulness_feedback" USING btree ("assistant_message_id","user_id");--> statement-breakpoint
CREATE INDEX "answer_usefulness_feedback_conversation_created_at_idx" ON "answer_usefulness_feedback" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "answer_usefulness_feedback_user_id_created_at_idx" ON "answer_usefulness_feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_response_provenance_assistant_rank_idx" ON "assistant_response_provenance" USING btree ("assistant_message_id","rank");--> statement-breakpoint
CREATE INDEX "assistant_response_provenance_conversation_created_at_idx" ON "assistant_response_provenance" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_response_provenance_source_reference_idx" ON "assistant_response_provenance" USING btree ("source_reference_type","source_reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_retrieval_decisions_assistant_message_idx" ON "assistant_retrieval_decisions" USING btree ("assistant_message_id");--> statement-breakpoint
CREATE INDEX "assistant_retrieval_decisions_conversation_created_at_idx" ON "assistant_retrieval_decisions" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_retrieval_decisions_user_id_created_at_idx" ON "assistant_retrieval_decisions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_context_user_conversation_idx" ON "chat_context" USING btree ("user_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_context_user_trip_project_idx" ON "chat_context" USING btree ("user_id","trip_project_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_context_source_message_id_idx" ON "chat_context" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "chat_context_field_idx" ON "chat_context" USING btree ("field");--> statement-breakpoint
CREATE INDEX "conversations_trip_project_id_idx" ON "conversations" USING btree ("trip_project_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_trip_project_updated_at_idx" ON "conversations" USING btree ("user_id","trip_project_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_user_id_updated_at_idx" ON "conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_user_id_created_at_idx" ON "conversations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "facebook_capture_reviews_source_id_idx" ON "facebook_capture_reviews" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_raw_material_id_idx" ON "facebook_capture_reviews" USING btree ("raw_source_material_id");--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_capture_version_id_idx" ON "facebook_capture_reviews" USING btree ("capture_version_id");--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_status_updated_at_idx" ON "facebook_capture_reviews" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_executor_system_updated_at_idx" ON "facebook_capture_reviews" USING btree ("executor_system","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_card_evidence_active_card_idx" ON "knowledge_card_evidence" USING btree ("knowledge_card_id","support_level") WHERE "knowledge_card_evidence"."state" = 'active';--> statement-breakpoint
CREATE INDEX "knowledge_card_evidence_source_version_idx" ON "knowledge_card_evidence" USING btree ("source_id","capture_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_evidence_card_independence_idx" ON "knowledge_card_evidence" USING btree ("knowledge_card_id","independence_key");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_search_documents_card_idx" ON "knowledge_card_search_documents" USING btree ("knowledge_card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_search_documents_active_card_idx" ON "knowledge_card_search_documents" USING btree ("knowledge_card_id") WHERE "knowledge_card_search_documents"."status" = 'active';--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_status_updated_idx" ON "knowledge_card_search_documents" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_card_version_idx" ON "knowledge_card_search_documents" USING btree ("knowledge_card_id","content_version");--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_confidence_idx" ON "knowledge_card_search_documents" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "knowledge_card_search_documents_executor_system_updated_at_idx" ON "knowledge_card_search_documents" USING btree ("executor_system","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_card_sources_source_id_idx" ON "knowledge_card_sources" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_card_state_migration_reports_reason_idx" ON "knowledge_card_state_migration_reports" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "knowledge_cards_status_created_at_idx" ON "knowledge_cards" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_cards_publication_state_idx" ON "knowledge_cards" USING btree ("publication_state","updated_at");--> statement-breakpoint
CREATE INDEX "knowledge_cards_type_status_idx" ON "knowledge_cards" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "knowledge_cards_confidence_idx" ON "knowledge_cards" USING btree ("confidence");--> statement-breakpoint
CREATE INDEX "knowledge_cards_created_by_user_id_idx" ON "knowledge_cards" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "knowledge_cards_executor_system_updated_at_idx" ON "knowledge_cards" USING btree ("executor_system","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_evidence_backfill_reports_reason_idx" ON "knowledge_evidence_backfill_reports" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_queue_idx" ON "knowledge_extraction_jobs" USING btree ("status","next_run_at","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_source_status_idx" ON "knowledge_extraction_jobs" USING btree ("source_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_review_status_idx" ON "knowledge_extraction_jobs" USING btree ("facebook_capture_review_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_capture_version_id_idx" ON "knowledge_extraction_jobs" USING btree ("capture_version_id");--> statement-breakpoint
CREATE INDEX "knowledge_extraction_jobs_stale_running_idx" ON "knowledge_extraction_jobs" USING btree ("status","locked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_index_dirty_markers_card_version_idx" ON "knowledge_index_dirty_markers" USING btree ("knowledge_card_id","content_version");--> statement-breakpoint
CREATE INDEX "knowledge_index_dirty_markers_created_at_idx" ON "knowledge_index_dirty_markers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_index_dirty_markers_executor_system_created_at_idx" ON "knowledge_index_dirty_markers" USING btree ("executor_system","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_index_dirty_markers_due_work_idx" ON "knowledge_index_dirty_markers" USING btree ("next_run_at","created_at") WHERE "knowledge_index_dirty_markers"."status" in ('pending', 'claimed');--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_ingestion_candidates_job_fingerprint_idx" ON "knowledge_ingestion_candidates" USING btree ("ingestion_job_id","fingerprint");--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_candidates_claim_queue_idx" ON "knowledge_ingestion_candidates" USING btree ("stage","next_run_at","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_candidates_parent_stage_idx" ON "knowledge_ingestion_candidates" USING btree ("ingestion_job_id","stage");--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_candidates_capture_span_idx" ON "knowledge_ingestion_candidates" USING btree ("capture_version_id","span_start");--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_jobs_claim_queue_idx" ON "knowledge_ingestion_jobs" USING btree ("stage","next_run_at","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_jobs_lease_expiry_idx" ON "knowledge_ingestion_jobs" USING btree ("lease_expires_at") WHERE "knowledge_ingestion_jobs"."lease_expires_at" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_ingestion_jobs_source_id_idx" ON "knowledge_ingestion_jobs" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_recommendations_open_version_reason_idx" ON "knowledge_recommendations" USING btree ("knowledge_card_id","content_version","evidence_set_revision","reason") WHERE "knowledge_recommendations"."status" in ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_open_queue_idx" ON "knowledge_recommendations" USING btree ("status","priority","created_at") WHERE "knowledge_recommendations"."status" in ('open', 'in_review');--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_card_version_idx" ON "knowledge_recommendations" USING btree ("knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_executor_system_created_at_idx" ON "knowledge_recommendations" USING btree ("executor_system","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_recommendations_policy_sampling_diagnostics_idx" ON "knowledge_recommendations" USING btree ("policy_id","reason","knowledge_card_id","content_version","evidence_set_revision","resolved_at" DESC NULLS LAST,"updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_candidate_ledger_terminal_fence_idx" ON "knowledge_sampling_candidate_ledger" USING btree ("terminal_ingestion_job_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_candidate_ledger_policy_fence_idx" ON "knowledge_sampling_candidate_ledger" USING btree ("policy_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE INDEX "knowledge_sampling_candidate_ledger_policy_idx" ON "knowledge_sampling_candidate_ledger" USING btree ("policy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_cohort_members_policy_version_idx" ON "knowledge_sampling_cohort_members" USING btree ("policy_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE INDEX "knowledge_sampling_cohort_members_policy_idx" ON "knowledge_sampling_cohort_members" USING btree ("policy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sampling_policies_cohort_key_idx" ON "knowledge_sampling_policies" USING btree ("cohort_key");--> statement-breakpoint
CREATE INDEX "knowledge_sampling_policies_window_idx" ON "knowledge_sampling_policies" USING btree ("window_starts_at","window_ends_at");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batch_items_batch_id_idx" ON "knowledge_seed_batch_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batch_items_source_id_idx" ON "knowledge_seed_batch_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batch_items_status_idx" ON "knowledge_seed_batch_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_seed_batch_items_batch_line_idx" ON "knowledge_seed_batch_items" USING btree ("batch_id","line_number");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batches_created_at_idx" ON "knowledge_seed_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batches_submitted_by_user_id_idx" ON "knowledge_seed_batches" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_source_id_idx" ON "knowledge_source_suggestions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_suggested_card_id_idx" ON "knowledge_source_suggestions" USING btree ("suggested_card_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_target_card_id_idx" ON "knowledge_source_suggestions" USING btree ("target_card_id");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_action_created_at_idx" ON "knowledge_source_suggestions" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "knowledge_source_suggestions_executor_system_created_at_idx" ON "knowledge_source_suggestions" USING btree ("executor_system","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_verify_first_sampling_obligations_terminal_fence_idx" ON "knowledge_verify_first_sampling_obligations" USING btree ("terminal_ingestion_job_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_verify_first_sampling_obligations_policy_fence_idx" ON "knowledge_verify_first_sampling_obligations" USING btree ("policy_id","knowledge_card_id","content_version","evidence_set_revision");--> statement-breakpoint
CREATE INDEX "knowledge_verify_first_sampling_obligations_policy_idx" ON "knowledge_verify_first_sampling_obligations" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "message_image_attachments_conversation_id_idx" ON "message_image_attachments" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "message_image_attachments_message_id_idx" ON "message_image_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_image_attachments_user_id_idx" ON "message_image_attachments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_user_id_created_at_idx" ON "messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_mvp_evaluation_prompt_sets_version_idx" ON "public_mvp_evaluation_prompt_sets" USING btree ("version");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_policy_snapshots_scenario_idx" ON "public_mvp_evaluation_result_policy_snapshots" USING btree ("scenario_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_mvp_evaluation_results_run_prompt_scenario_idx" ON "public_mvp_evaluation_results" USING btree ("run_id","prompt_type","scenario_id");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_results_prompt_type_idx" ON "public_mvp_evaluation_results" USING btree ("prompt_type","created_at");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_results_status_idx" ON "public_mvp_evaluation_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_runs_actor_created_idx" ON "public_mvp_evaluation_runs" USING btree ("actor_user_id","started_at");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_runs_prompt_set_idx" ON "public_mvp_evaluation_runs" USING btree ("prompt_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_source_material_source_id_idx" ON "raw_source_material" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_attributions_user_id_idx" ON "referral_attributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "referral_attributions_referral_code_id_idx" ON "referral_attributions" USING btree ("referral_code_id");--> statement-breakpoint
CREATE INDEX "referral_attributions_referrer_user_id_idx" ON "referral_attributions" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE INDEX "referral_attributions_created_at_idx" ON "referral_attributions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_code_idx" ON "referral_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "referral_codes_active_idx" ON "referral_codes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "referral_codes_referrer_user_id_idx" ON "referral_codes" USING btree ("referrer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_capture_versions_source_sequence_idx" ON "source_capture_versions" USING btree ("source_id","version_sequence");--> statement-breakpoint
CREATE INDEX "source_capture_versions_executor_system_captured_at_idx" ON "source_capture_versions" USING btree ("executor_system","captured_at");--> statement-breakpoint
CREATE INDEX "source_capture_versions_source_captured_at_idx" ON "source_capture_versions" USING btree ("source_id","captured_at");--> statement-breakpoint
CREATE INDEX "source_capture_versions_retention_idx" ON "source_capture_versions" USING btree ("capture_kind","captured_at") WHERE "source_capture_versions"."payload_deleted_at" is null;--> statement-breakpoint
CREATE INDEX "sources_kind_created_at_idx" ON "sources" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "sources_canonical_url_idx" ON "sources" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "sources_submitted_by_user_id_idx" ON "sources" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "sources_current_capture_version_id_idx" ON "sources" USING btree ("current_capture_version_id");--> statement-breakpoint
CREATE INDEX "sources_eligibility_idx" ON "sources" USING btree ("eligibility","removal_completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_id_current_capture_version_id_idx" ON "sources" USING btree ("id","current_capture_version_id");--> statement-breakpoint
CREATE INDEX "trip_change_proposals_owner_status_created_idx" ON "trip_change_proposals" USING btree ("user_id","trip_project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "trip_plan_change_history_owner_created_idx" ON "trip_plan_change_history" USING btree ("user_id","trip_project_id","created_at");--> statement-breakpoint
CREATE INDEX "trip_plan_items_owner_project_order_idx" ON "trip_plan_items" USING btree ("user_id","trip_project_id","parent_item_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_plan_items_root_ordinal_idx" ON "trip_plan_items" USING btree ("trip_project_id","ordinal") WHERE "trip_plan_items"."parent_item_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_plan_items_child_ordinal_idx" ON "trip_plan_items" USING btree ("trip_project_id","parent_item_id","ordinal") WHERE "trip_plan_items"."parent_item_id" is not null;--> statement-breakpoint
CREATE INDEX "trip_project_constraints_owner_project_idx" ON "trip_project_constraints" USING btree ("user_id","trip_project_id");--> statement-breakpoint
CREATE INDEX "trip_projects_user_id_updated_at_idx" ON "trip_projects" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ALTER CONSTRAINT "trip_plan_items_parent_item_id_trip_plan_items_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ALTER CONSTRAINT "trip_plan_items_backup_target_item_id_trip_plan_items_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_trip_project_owner_fk";--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_trip_project_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "trip_projects"("id","user_id") ON DELETE SET NULL ("trip_project_id") ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "trip_projects" ADD CONSTRAINT "trip_projects_primary_conversation_owner_fk" FOREIGN KEY ("primary_conversation_id","id","user_id") REFERENCES "conversations"("id","trip_project_id","user_id") ON DELETE SET NULL ("primary_conversation_id") ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "touch_knowledge_card_for_evidence"() RETURNS trigger AS $$
BEGIN
  UPDATE "knowledge_cards"
  SET "updated_at" = now()
  WHERE "id" = COALESCE(NEW."knowledge_card_id", OLD."knowledge_card_id");
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "touch_knowledge_cards_for_capture"() RETURNS trigger AS $$
BEGIN
  UPDATE "knowledge_cards" card
  SET "updated_at" = now()
  FROM "knowledge_card_sources" link
  WHERE link."knowledge_card_id" = card."id"
    AND link."source_id" = COALESCE(NEW."source_id", OLD."source_id");
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "touch_knowledge_cards_for_source"() RETURNS trigger AS $$
BEGIN
  UPDATE "knowledge_cards" card
  SET "updated_at" = now()
  FROM "knowledge_card_sources" link
  WHERE link."knowledge_card_id" = card."id"
    AND link."source_id" = COALESCE(NEW."id", OLD."id");
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "knowledge_card_evidence_touch_card" AFTER INSERT OR UPDATE OR DELETE ON "knowledge_card_evidence" FOR EACH ROW EXECUTE FUNCTION "touch_knowledge_card_for_evidence"();--> statement-breakpoint
CREATE TRIGGER "source_capture_versions_touch_cards" AFTER UPDATE ON "source_capture_versions" FOR EACH ROW EXECUTE FUNCTION "touch_knowledge_cards_for_capture"();--> statement-breakpoint
CREATE TRIGGER "sources_touch_cards" AFTER UPDATE ON "sources" FOR EACH ROW EXECUTE FUNCTION "touch_knowledge_cards_for_source"();
CREATE INDEX "user_roles_user_id_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_search_results_user_message_rank_idx" ON "web_search_results" USING btree ("user_message_id","rank");--> statement-breakpoint
CREATE INDEX "web_search_results_conversation_created_at_idx" ON "web_search_results" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "web_search_results_user_id_created_at_idx" ON "web_search_results" USING btree ("user_id","created_at");
