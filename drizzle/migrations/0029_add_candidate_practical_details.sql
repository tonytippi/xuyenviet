ALTER TABLE "knowledge_ingestion_candidates" ADD COLUMN "practical_details" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_practical_details_check" CHECK (jsonb_typeof("knowledge_ingestion_candidates"."practical_details") = 'object');
--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_tags_check" CHECK (jsonb_typeof("knowledge_ingestion_candidates"."tags") = 'array');
