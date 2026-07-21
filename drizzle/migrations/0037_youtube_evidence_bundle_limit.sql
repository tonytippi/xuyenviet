ALTER TABLE "raw_source_material" DROP CONSTRAINT "raw_source_material_text_length_check";
--> statement-breakpoint
ALTER TABLE "raw_source_material" ADD CONSTRAINT "raw_source_material_text_length_check" CHECK ("raw_source_material"."raw_text" is null or (length(btrim("raw_source_material"."raw_text")) > 0 and char_length("raw_source_material"."raw_text") <= 120000));
