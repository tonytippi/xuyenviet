ALTER TABLE "knowledge_ingestion_jobs" DROP CONSTRAINT "knowledge_ingestion_jobs_discovery_cursor_check";--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" DROP CONSTRAINT "knowledge_ingestion_jobs_discovery_window_size_check";--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" DROP COLUMN "discovery_cursor";--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" DROP COLUMN "discovery_window_size";--> statement-breakpoint
ALTER TABLE "knowledge_ingestion_jobs" DROP COLUMN "discovery_complete";
