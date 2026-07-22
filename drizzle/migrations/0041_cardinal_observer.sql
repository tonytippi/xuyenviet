CREATE OR REPLACE FUNCTION "touch_knowledge_card_for_evidence"() RETURNS trigger AS $$
BEGIN
  UPDATE "knowledge_cards"
  SET "updated_at" = now()
  WHERE "id" = COALESCE(NEW."knowledge_card_id", OLD."knowledge_card_id");
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "touch_knowledge_cards_for_capture"() RETURNS trigger AS $$
BEGIN
  UPDATE "knowledge_cards" card
  SET "updated_at" = now()
  FROM "knowledge_card_sources" link
  WHERE link."knowledge_card_id" = card."id"
    AND link."source_id" = COALESCE(NEW."source_id", OLD."source_id");
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "touch_knowledge_cards_for_source"() RETURNS trigger AS $$
BEGIN
  UPDATE "knowledge_cards" card
  SET "updated_at" = now()
  FROM "knowledge_card_sources" link
  WHERE link."knowledge_card_id" = card."id"
    AND link."source_id" = COALESCE(NEW."id", OLD."id");
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "knowledge_card_evidence_touch_card"
AFTER INSERT OR UPDATE OR DELETE ON "knowledge_card_evidence"
FOR EACH ROW EXECUTE FUNCTION "touch_knowledge_card_for_evidence"();
--> statement-breakpoint
CREATE TRIGGER "source_capture_versions_touch_cards"
AFTER UPDATE ON "source_capture_versions"
FOR EACH ROW EXECUTE FUNCTION "touch_knowledge_cards_for_capture"();
--> statement-breakpoint
CREATE TRIGGER "sources_touch_cards"
AFTER UPDATE ON "sources"
FOR EACH ROW EXECUTE FUNCTION "touch_knowledge_cards_for_source"();
