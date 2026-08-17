ALTER TABLE "ai_gateway_models" DROP CONSTRAINT "ai_gateway_models_purpose_check";
ALTER TABLE "ai_gateway_models" ADD CONSTRAINT "ai_gateway_models_purpose_check" CHECK ("purpose" in ('ai_ask_initial_answer', 'extraction', 'embeddings', 'evaluation', 'youtube_discovery_triage', 'youtube_discovery_province_suggestion'));
