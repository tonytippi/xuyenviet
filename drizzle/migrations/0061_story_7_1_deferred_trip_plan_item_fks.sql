-- Custom SQL migration file, put your code below! --
ALTER TABLE "trip_plan_items" ALTER CONSTRAINT "trip_plan_items_parent_item_id_trip_plan_items_id_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "trip_plan_items" ALTER CONSTRAINT "trip_plan_items_backup_target_item_id_trip_plan_items_id_fk" DEFERRABLE INITIALLY DEFERRED;
