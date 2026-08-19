ALTER TABLE "knowledge_province_references" DROP CONSTRAINT "knowledge_province_references_effective_date_check";
ALTER TABLE "knowledge_province_references" ADD CONSTRAINT "knowledge_province_references_effective_date_check" CHECK ("effective_date" ~ '^\d{4}-\d{2}-\d{2}$');
