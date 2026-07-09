ALTER TABLE "assistant_retrieval_decisions" ADD COLUMN IF NOT EXISTS "approved_knowledge_relevance_threshold" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_retrieval_decisions" ALTER COLUMN "approved_knowledge_relevance_threshold" DROP DEFAULT;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assistant_retrieval_decisions" ADD CONSTRAINT "assistant_retrieval_decisions_relevance_threshold_check" CHECK ("assistant_retrieval_decisions"."approved_knowledge_relevance_threshold" > 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
