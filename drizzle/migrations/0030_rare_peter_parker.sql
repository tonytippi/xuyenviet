CREATE TABLE "public_mvp_evaluation_prompt_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"rubric_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_mvp_evaluation_prompt_sets_version_check" CHECK (length(btrim("public_mvp_evaluation_prompt_sets"."version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_prompt_sets_rubric_version_check" CHECK (length(btrim("public_mvp_evaluation_prompt_sets"."rubric_version")) between 1 and 80)
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
	"model_version" text NOT NULL,
	"status" text NOT NULL,
	"answer_text" text,
	"safe_error_code" text,
	"unsupported_claim_flag" boolean DEFAULT false NOT NULL,
	"missing_uncertainty_flag" boolean DEFAULT false NOT NULL,
	"no_better_than_generic_flag" boolean DEFAULT false NOT NULL,
	"assistant_message_id" text,
	"retrieval_decision_id" text,
	"provenance_id" text,
	"usage_event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "public_mvp_evaluation_results_prompt_type_check" CHECK ("public_mvp_evaluation_results"."prompt_type" in ('magic_moment_family_trip', 'sparse_data', 'freshness_sensitive', 'service_activity', 'route_logistics')),
	CONSTRAINT "public_mvp_evaluation_results_status_check" CHECK ("public_mvp_evaluation_results"."status" in ('scored', 'failed', 'unscored')),
	CONSTRAINT "public_mvp_evaluation_results_prompt_set_version_check" CHECK (length(btrim("public_mvp_evaluation_results"."prompt_set_version")) between 1 and 80),
	CONSTRAINT "public_mvp_evaluation_results_prompt_version_check" CHECK (length(btrim("public_mvp_evaluation_results"."prompt_version")) between 1 and 80),
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
CREATE UNIQUE INDEX "public_mvp_evaluation_prompt_sets_version_idx" ON "public_mvp_evaluation_prompt_sets" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "public_mvp_evaluation_results_run_prompt_idx" ON "public_mvp_evaluation_results" USING btree ("run_id","prompt_type");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_results_prompt_type_idx" ON "public_mvp_evaluation_results" USING btree ("prompt_type","created_at");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_results_status_idx" ON "public_mvp_evaluation_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_runs_actor_created_idx" ON "public_mvp_evaluation_runs" USING btree ("actor_user_id","started_at");--> statement-breakpoint
CREATE INDEX "public_mvp_evaluation_runs_prompt_set_idx" ON "public_mvp_evaluation_runs" USING btree ("prompt_set_id");
