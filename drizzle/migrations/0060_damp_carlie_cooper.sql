CREATE TABLE "trip_plan_items" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"anchor_role" text,
	"type" text,
	"state" text NOT NULL,
	"label" text NOT NULL,
	"notes" text,
	"planned_at" timestamp,
	"ordinal" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_item_id" text,
	"backup_target_item_id" text,
	"transport_origin_label" text,
	"transport_destination_label" text,
	"accommodation_place_area_label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_plan_items_shape_check" CHECK (("trip_plan_items"."kind" = 'anchor' and "trip_plan_items"."anchor_role" in ('origin','destination','region','required_stop','accommodation') and "trip_plan_items"."type" is null) or ("trip_plan_items"."kind" in ('leg','activity') and "trip_plan_items"."anchor_role" is null and "trip_plan_items"."type" in ('transport','visit','food','rest','accommodation'))),
	CONSTRAINT "trip_plan_items_state_check" CHECK ("trip_plan_items"."state" in ('idea','planned','confirmed','backup')),
	CONSTRAINT "trip_plan_items_version_check" CHECK ("trip_plan_items"."version" >= 1),
	CONSTRAINT "trip_plan_items_ordinal_check" CHECK ("trip_plan_items"."ordinal" >= 0),
	CONSTRAINT "trip_plan_items_backup_check" CHECK (("trip_plan_items"."state" = 'backup' and "trip_plan_items"."backup_target_item_id" is not null) or ("trip_plan_items"."state" <> 'backup' and "trip_plan_items"."backup_target_item_id" is null)),
	CONSTRAINT "trip_plan_items_label_check" CHECK (length(btrim("trip_plan_items"."label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."label") = 0 and position(chr(13) in "trip_plan_items"."label") = 0),
	CONSTRAINT "trip_plan_items_notes_check" CHECK ("trip_plan_items"."notes" is null or (length(btrim("trip_plan_items"."notes")) between 1 and 1000 and position(chr(10) in "trip_plan_items"."notes") = 0 and position(chr(13) in "trip_plan_items"."notes") = 0)),
	CONSTRAINT "trip_plan_items_location_check" CHECK (("trip_plan_items"."type" = 'transport' or ("trip_plan_items"."transport_origin_label" is null and "trip_plan_items"."transport_destination_label" is null)) and ("trip_plan_items"."type" = 'accommodation' or "trip_plan_items"."accommodation_place_area_label" is null) and ("trip_plan_items"."transport_origin_label" is null or (length(btrim("trip_plan_items"."transport_origin_label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."transport_origin_label") = 0 and position(chr(13) in "trip_plan_items"."transport_origin_label") = 0)) and ("trip_plan_items"."transport_destination_label" is null or (length(btrim("trip_plan_items"."transport_destination_label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."transport_destination_label") = 0 and position(chr(13) in "trip_plan_items"."transport_destination_label") = 0)) and ("trip_plan_items"."accommodation_place_area_label" is null or (length(btrim("trip_plan_items"."accommodation_place_area_label")) between 1 and 160 and position(chr(10) in "trip_plan_items"."accommodation_place_area_label") = 0 and position(chr(13) in "trip_plan_items"."accommodation_place_area_label") = 0)))
);
--> statement-breakpoint
CREATE TABLE "trip_project_constraints" (
	"trip_project_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"adult_count" integer,
	"child_count" integer,
	"children" jsonb,
	"vehicle_type" text,
	"ev_charging_need" text,
	"driving_tolerance_hours" integer,
	"budget_currency" text,
	"budget_min_vnd" integer,
	"budget_max_vnd" integer,
	"preference_tags" jsonb,
	"avoid_items" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_project_constraints_version_check" CHECK ("trip_project_constraints"."version" >= 1),
	CONSTRAINT "trip_project_constraints_counts_check" CHECK (("trip_project_constraints"."adult_count" is not null or "trip_project_constraints"."child_count" is not null) and coalesce("trip_project_constraints"."adult_count", 0) + coalesce("trip_project_constraints"."child_count", 0) between 1 and 20 and ("trip_project_constraints"."adult_count" is null or "trip_project_constraints"."adult_count" between 0 and 20) and ("trip_project_constraints"."child_count" is null or "trip_project_constraints"."child_count" between 0 and 20)),
	CONSTRAINT "trip_project_constraints_children_array_check" CHECK ("trip_project_constraints"."children" is null or (jsonb_typeof("trip_project_constraints"."children") = 'array' and jsonb_array_length("trip_project_constraints"."children") <= 10)),
	CONSTRAINT "trip_project_constraints_vehicle_check" CHECK ("trip_project_constraints"."vehicle_type" is null or "trip_project_constraints"."vehicle_type" in ('car', 'motorcycle', 'ev')),
	CONSTRAINT "trip_project_constraints_ev_check" CHECK ("trip_project_constraints"."ev_charging_need" is null or ("trip_project_constraints"."vehicle_type" = 'ev' and "trip_project_constraints"."ev_charging_need" in ('none', 'preferred', 'required'))),
	CONSTRAINT "trip_project_constraints_driving_check" CHECK ("trip_project_constraints"."driving_tolerance_hours" is null or "trip_project_constraints"."driving_tolerance_hours" between 1 and 12),
	CONSTRAINT "trip_project_constraints_budget_check" CHECK (("trip_project_constraints"."budget_currency" is null and "trip_project_constraints"."budget_min_vnd" is null and "trip_project_constraints"."budget_max_vnd" is null) or ("trip_project_constraints"."budget_currency" = 'VND' and "trip_project_constraints"."budget_min_vnd" between 0 and 1000000000 and "trip_project_constraints"."budget_max_vnd" between 0 and 1000000000 and "trip_project_constraints"."budget_min_vnd" <= "trip_project_constraints"."budget_max_vnd")),
	CONSTRAINT "trip_project_constraints_preferences_array_check" CHECK ("trip_project_constraints"."preference_tags" is null or (jsonb_typeof("trip_project_constraints"."preference_tags") = 'array' and jsonb_array_length("trip_project_constraints"."preference_tags") <= 20)),
	CONSTRAINT "trip_project_constraints_avoid_items_array_check" CHECK ("trip_project_constraints"."avoid_items" is null or (jsonb_typeof("trip_project_constraints"."avoid_items") = 'array' and jsonb_array_length("trip_project_constraints"."avoid_items") <= 20))
);
--> statement-breakpoint
ALTER TABLE "trip_projects" ADD COLUMN "aggregate_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ADD CONSTRAINT "trip_plan_items_parent_item_id_trip_plan_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."trip_plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ADD CONSTRAINT "trip_plan_items_backup_target_item_id_trip_plan_items_id_fk" FOREIGN KEY ("backup_target_item_id") REFERENCES "public"."trip_plan_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ADD CONSTRAINT "trip_plan_items_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_project_constraints" ADD CONSTRAINT "trip_project_constraints_owner_fk" FOREIGN KEY ("trip_project_id","user_id") REFERENCES "public"."trip_projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_plan_items_owner_project_order_idx" ON "trip_plan_items" USING btree ("user_id","trip_project_id","parent_item_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_plan_items_root_ordinal_idx" ON "trip_plan_items" USING btree ("trip_project_id","ordinal") WHERE "trip_plan_items"."parent_item_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_plan_items_child_ordinal_idx" ON "trip_plan_items" USING btree ("trip_project_id","parent_item_id","ordinal") WHERE "trip_plan_items"."parent_item_id" is not null;--> statement-breakpoint
CREATE INDEX "trip_project_constraints_owner_project_idx" ON "trip_project_constraints" USING btree ("user_id","trip_project_id");--> statement-breakpoint
ALTER TABLE "trip_projects" ADD CONSTRAINT "trip_projects_aggregate_version_check" CHECK ("trip_projects"."aggregate_version" >= 1);