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
	CONSTRAINT "web_search_results_trigger_reason_check" CHECK ("web_search_results"."trigger_reason" in ('no_approved_knowledge', 'insufficient_approved_knowledge', 'freshness_sensitive_request', 'approved_knowledge_may_be_stale', 'source_conflict', 'approved_knowledge_unavailable')),
	CONSTRAINT "web_search_results_rank_check" CHECK ("web_search_results"."rank" > 0)
);
--> statement-breakpoint
ALTER TABLE "web_search_results" ADD CONSTRAINT "web_search_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "web_search_results" ADD CONSTRAINT "web_search_results_conversation_owner_fk" FOREIGN KEY ("conversation_id","user_id") REFERENCES "public"."conversations"("id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "web_search_results" ADD CONSTRAINT "web_search_results_user_message_owner_fk" FOREIGN KEY ("user_message_id","conversation_id","user_id") REFERENCES "public"."messages"("id","conversation_id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "web_search_results_user_message_rank_idx" ON "web_search_results" USING btree ("user_message_id","rank");
--> statement-breakpoint
CREATE INDEX "web_search_results_conversation_created_at_idx" ON "web_search_results" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX "web_search_results_user_id_created_at_idx" ON "web_search_results" USING btree ("user_id","created_at");
