CREATE TABLE "facebook_capture_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"raw_source_material_id" text NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"reviewer_user_id" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"extraction_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "facebook_capture_reviews_status_check" CHECK ("facebook_capture_reviews"."status" in ('needs_review', 'rejected', 'extracted', 'extracted_approved', 'extraction_failed')),
	CONSTRAINT "facebook_capture_reviews_rejection_reason_check" CHECK ("facebook_capture_reviews"."rejection_reason" is null or ("facebook_capture_reviews"."status" = 'rejected' and length(btrim("facebook_capture_reviews"."rejection_reason")) between 1 and 500 and position(chr(10) in "facebook_capture_reviews"."rejection_reason") = 0 and position(chr(13) in "facebook_capture_reviews"."rejection_reason") = 0)),
	CONSTRAINT "facebook_capture_reviews_extraction_error_check" CHECK ("facebook_capture_reviews"."extraction_error" is null or ("facebook_capture_reviews"."status" = 'extraction_failed' and length(btrim("facebook_capture_reviews"."extraction_error")) between 1 and 500 and position(chr(10) in "facebook_capture_reviews"."extraction_error") = 0 and position(chr(13) in "facebook_capture_reviews"."extraction_error") = 0)),
	CONSTRAINT "facebook_capture_reviews_reviewer_shape_check" CHECK ("facebook_capture_reviews"."status" = 'needs_review' or ("facebook_capture_reviews"."reviewer_user_id" is not null and "facebook_capture_reviews"."reviewed_at" is not null)),
	CONSTRAINT "facebook_capture_reviews_updated_after_created_check" CHECK ("facebook_capture_reviews"."updated_at" >= "facebook_capture_reviews"."created_at")
);
--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_raw_material_fk" FOREIGN KEY ("raw_source_material_id") REFERENCES "public"."raw_source_material"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facebook_capture_reviews" ADD CONSTRAINT "facebook_capture_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "facebook_capture_reviews_source_id_idx" ON "facebook_capture_reviews" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_raw_material_id_idx" ON "facebook_capture_reviews" USING btree ("raw_source_material_id");--> statement-breakpoint
CREATE INDEX "facebook_capture_reviews_status_updated_at_idx" ON "facebook_capture_reviews" USING btree ("status","updated_at");
