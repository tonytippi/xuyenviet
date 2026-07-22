export const aiUsagePurposes = {
  aiAskInitialAnswer: "ai_ask_initial_answer",
  extraction: "extraction",
  evaluation: "evaluation",
  webSearchFallback: "web_search_fallback",
} as const;

export const aiUsagePromptVersions = {
  aiAskInitialAnswer: "ai_ask_initial_v9_annotations",
  chatContextExtraction: "chat_context_extraction_v3",
  sourceKnowledgeDraftExtraction: "source_knowledge_draft_extraction_v1",
  sourceKnowledgeSuggestion: "source_knowledge_suggestion_v1",
  knowledgePipelineExtraction: "knowledge_pipeline_extraction_v1",
  knowledgePipelineJudgment: "knowledge_pipeline_judgment_v1",
  publicMvpAnswerEvaluation: "public_mvp_answer_evaluation_v1",
  webSearchFallback: "web_search_fallback_v1",
} as const;

export const aiUsageProviders = {
  tavily: "tavily",
} as const;

export const aiUsageMechanisms = {
  webSearch: "search",
} as const;
