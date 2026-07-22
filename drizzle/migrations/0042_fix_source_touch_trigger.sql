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
