ALTER TABLE "knowledge_card_search_documents" DROP CONSTRAINT "knowledge_card_search_documents_executor_system_check";--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ALTER COLUMN "executor_system" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_card_search_documents" ADD CONSTRAINT "knowledge_card_search_documents_executor_system_check" CHECK ("executor_system" is not null and length(btrim("executor_system")) between 1 and 160);
