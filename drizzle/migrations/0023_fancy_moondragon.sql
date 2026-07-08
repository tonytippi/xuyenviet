ALTER TABLE "knowledge_seed_batch_items" DROP CONSTRAINT "knowledge_seed_batch_items_source_id_sources_id_fk";
--> statement-breakpoint
ALTER TABLE "knowledge_seed_batch_items" ADD CONSTRAINT "knowledge_seed_batch_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;
