ALTER TABLE "youtube_discovery_knowledge_handoffs" ADD COLUMN "outcome" text;
--> statement-breakpoint
ALTER TABLE "youtube_discovery_knowledge_handoffs" ADD CONSTRAINT "youtube_discovery_knowledge_handoffs_outcome_check" CHECK ("outcome" is null or "outcome" in ('submitted', 'duplicate'));
