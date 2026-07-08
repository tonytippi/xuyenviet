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
ALTER TABLE "knowledge_seed_batch_items" ADD CONSTRAINT "knowledge_seed_batch_items_batch_id_knowledge_seed_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."knowledge_seed_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_seed_batch_items" ADD CONSTRAINT "knowledge_seed_batch_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_seed_batches" ADD CONSTRAINT "knowledge_seed_batches_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_seed_batch_items_batch_id_idx" ON "knowledge_seed_batch_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batch_items_source_id_idx" ON "knowledge_seed_batch_items" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batch_items_status_idx" ON "knowledge_seed_batch_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_seed_batch_items_batch_line_idx" ON "knowledge_seed_batch_items" USING btree ("batch_id","line_number");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batches_created_at_idx" ON "knowledge_seed_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_seed_batches_submitted_by_user_id_idx" ON "knowledge_seed_batches" USING btree ("submitted_by_user_id");
