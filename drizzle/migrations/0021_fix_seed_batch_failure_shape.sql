ALTER TABLE "knowledge_seed_batch_items" DROP CONSTRAINT "knowledge_seed_batch_items_failure_shape_check";--> statement-breakpoint
ALTER TABLE "knowledge_seed_batch_items" ADD CONSTRAINT "knowledge_seed_batch_items_failure_shape_check" CHECK ("knowledge_seed_batch_items"."status" <> 'failed' or "knowledge_seed_batch_items"."error_summary" is not null);
