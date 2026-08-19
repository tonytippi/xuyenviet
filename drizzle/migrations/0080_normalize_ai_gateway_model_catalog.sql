DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ai_gateway_models
    GROUP BY purpose
    HAVING count(*) FILTER (WHERE default_for_purpose) <> 1
  ) THEN
    RAISE EXCEPTION 'Each AI purpose must have exactly one legacy default model before normalization';
  END IF;
END $$;

CREATE TABLE "ai_purposes" (
  "purpose" text PRIMARY KEY NOT NULL,
  "ai_gateway_model_id" text NOT NULL REFERENCES "ai_gateway_models"("id") ON DELETE RESTRICT,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ai_purposes_purpose_check" CHECK ("purpose" in ('ai_ask_initial_answer', 'extraction', 'embeddings', 'evaluation', 'youtube_discovery_triage', 'youtube_discovery_province_suggestion'))
);
INSERT INTO "ai_purposes" ("purpose", "ai_gateway_model_id")
SELECT "purpose", "id" FROM "ai_gateway_models" WHERE "default_for_purpose";
CREATE INDEX "ai_purposes_ai_gateway_model_id_idx" ON "ai_purposes" ("ai_gateway_model_id");

ALTER TABLE "ai_gateway_models" DROP CONSTRAINT "ai_gateway_models_purpose_check";
ALTER TABLE "ai_gateway_models" DROP CONSTRAINT "ai_gateway_models_default_active_check";
DROP INDEX "ai_gateway_models_gateway_model_purpose_idx";
DROP INDEX "ai_gateway_models_purpose_active_idx";
DROP INDEX "ai_gateway_models_one_default_per_purpose_idx";
DROP INDEX "ai_gateway_models_default_idx";
ALTER TABLE "ai_gateway_models" DROP COLUMN "purpose";
ALTER TABLE "ai_gateway_models" DROP COLUMN "default_for_purpose";
CREATE INDEX "ai_gateway_models_gateway_model_name_idx" ON "ai_gateway_models" ("gateway_model_name");
