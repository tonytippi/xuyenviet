CREATE TABLE "raw_source_material" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"raw_text" text,
	"file_name" text,
	"mime_type" text,
	"byte_size" integer,
	"storage_key" text,
	"raw_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "raw_source_material_text_length_check" CHECK ("raw_source_material"."raw_text" is null or (length(btrim("raw_source_material"."raw_text")) > 0 and char_length("raw_source_material"."raw_text") <= 20000)),
	CONSTRAINT "raw_source_material_file_name_check" CHECK ("raw_source_material"."file_name" is null or length(btrim("raw_source_material"."file_name")) > 0),
	CONSTRAINT "raw_source_material_mime_type_check" CHECK ("raw_source_material"."mime_type" is null or "raw_source_material"."mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "raw_source_material_byte_size_check" CHECK ("raw_source_material"."byte_size" is null or ("raw_source_material"."byte_size" > 0 and "raw_source_material"."byte_size" <= 5242880)),
	CONSTRAINT "raw_source_material_file_metadata_complete_check" CHECK (("raw_source_material"."file_name" is null and "raw_source_material"."mime_type" is null and "raw_source_material"."byte_size" is null) or ("raw_source_material"."file_name" is not null and "raw_source_material"."mime_type" is not null and "raw_source_material"."byte_size" is not null))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"url" text,
	"canonical_url" text,
	"label" text NOT NULL,
	"publisher" text,
	"collected_date" text,
	"source_type" text NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"partner" boolean DEFAULT false NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sources_kind_check" CHECK ("sources"."kind" in ('url', 'facebook', 'copied_post', 'pasted_text', 'screenshot')),
	CONSTRAINT "sources_source_type_check" CHECK ("sources"."source_type" in ('curated', 'community')),
	CONSTRAINT "sources_verification_status_check" CHECK ("sources"."verification_status" in ('unverified', 'verified')),
	CONSTRAINT "sources_label_not_empty_check" CHECK (length(btrim("sources"."label")) > 0),
	CONSTRAINT "sources_collected_date_format_check" CHECK ("sources"."collected_date" is null or "sources"."collected_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "sources_url_kind_check" CHECK ("sources"."kind" not in ('url', 'facebook') or "sources"."url" is not null),
	CONSTRAINT "sources_no_url_for_textual_kind_check" CHECK ("sources"."kind" not in ('copied_post', 'pasted_text', 'screenshot') or "sources"."url" is null),
	CONSTRAINT "sources_community_defaults_check" CHECK ("sources"."source_type" <> 'community' or ("sources"."verification_status" = 'unverified' and "sources"."official" = false and "sources"."partner" = false))
);
--> statement-breakpoint
ALTER TABLE "raw_source_material" ADD CONSTRAINT "raw_source_material_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "raw_source_material_source_id_idx" ON "raw_source_material" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_kind_created_at_idx" ON "sources" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "sources_canonical_url_idx" ON "sources" USING btree ("canonical_url");--> statement-breakpoint
CREATE INDEX "sources_submitted_by_user_id_idx" ON "sources" USING btree ("submitted_by_user_id");