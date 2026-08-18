CREATE OR REPLACE FUNCTION "enforce_canonical_knowledge_province_reference"() RETURNS trigger AS $$
BEGIN
  IF NEW."normalized_current_province_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "knowledge_province_references"
    WHERE "id" = NEW."normalized_current_province_id"
      AND "current_unit_id" = "id"
  ) THEN
    RAISE EXCEPTION 'normalized_current_province_id must reference a current unit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "knowledge_ingestion_candidates_canonical_province_trigger"
BEFORE INSERT OR UPDATE OF "normalized_current_province_id" ON "knowledge_ingestion_candidates"
FOR EACH ROW EXECUTE FUNCTION "enforce_canonical_knowledge_province_reference"();

CREATE TRIGGER "knowledge_cards_canonical_province_trigger"
BEFORE INSERT OR UPDATE OF "normalized_current_province_id" ON "knowledge_cards"
FOR EACH ROW EXECUTE FUNCTION "enforce_canonical_knowledge_province_reference"();
