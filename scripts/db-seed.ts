import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  aiGatewayModels,
  assistantRetrievalDecisions,
  chatContext,
  conversations,
  messages,
  rawSourceMaterial,
  sources,
  tripProjects,
  userRoles,
  users,
  webSearchResults,
} from "../src/db/schema";
import { getDatabaseUrl } from "./db-env";
import { loadFacebookSeedUrls } from "./facebook-seed-urls";

const databaseUrl = getDatabaseUrl();
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);
const facebookSources = loadFacebookSeedUrls().map((source) => ({
  id: source.id,
  kind: "facebook" as const,
  url: source.url,
  label: source.label,
  publisher: "Facebook",
  collectedDate: "2026-07-01",
  sourceType: "community" as const,
  verificationStatus: "unverified" as const,
  official: false,
  partner: false,
  submittedByUserId: "seed-fixture-operator-user",
}));

async function main() {
  const now = new Date("2026-07-01T00:00:00.000Z");

  await db.insert(users).values([
    {
      id: "seed-fixture-operator-user",
      name: "Seed Fixture Operator",
      email: "fixture-operator@xuyenviet.local",
    },
    {
      id: "seed-traveler-user",
      name: "Seed Fixture Traveler",
      email: "fixture-traveler@xuyenviet.local",
    },
    {
      id: "system-facebook-capture",
      name: "System Facebook Capture",
      email: "system-facebook-capture@xuyenviet.internal",
    },
    {
      id: "system-youtube-capture",
      name: "System YouTube Capture",
      email: "system-youtube-capture@xuyenviet.internal",
    },
  ]).onConflictDoNothing();

  await db.insert(userRoles).values([
    { userId: "seed-traveler-user", role: "traveler" },
  ]).onConflictDoNothing();

  await db.insert(aiGatewayModels).values([
    {
      id: "seed-model-answer",
      gatewayModelName: "cx/gpt-5.6-luna",
      displayLabel: "GPT 5.6 Luna",
      purpose: "ai_ask_initial_answer",
      active: true,
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsStreaming: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 400,
      outputTokenPriceMicros: 1600,
      pricingVersion: "seed",
    },
    {
      id: "seed-model-extraction",
      gatewayModelName: "cx/gpt-5.6-luna",
      displayLabel: "GPT 5.6 Luna Extraction",
      purpose: "extraction",
      active: true,
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsExtraction: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 400,
      outputTokenPriceMicros: 1600,
      pricingVersion: "seed",
    },
    {
      id: "seed-model-embeddings",
      gatewayModelName: "fireworks/nomic-ai/nomic-embed-text-v1.5",
      displayLabel: "Nomic Embed Text v1.5",
      purpose: "embeddings",
      active: true,
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsEmbeddings: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 20,
      pricingVersion: "seed",
    },
    {
      id: "seed-model-evaluation",
      gatewayModelName: "cx/gpt-5.6-luna",
      displayLabel: "GPT 5.6 Luna Evaluation",
      purpose: "evaluation",
      active: true,
      defaultForPurpose: true,
      supportsTextInput: true,
      supportsEvaluation: true,
      pricingCurrency: "USD",
      inputTokenPriceMicros: 400,
      outputTokenPriceMicros: 1600,
      pricingVersion: "seed",
    },
  ]).onConflictDoNothing();

  await db.insert(tripProjects).values({
    id: "seed-trip-hanoi-hue",
    userId: "seed-traveler-user",
    title: "Hà Nội đi Huế 5 ngày",
    origin: "Hà Nội",
    destination: "Huế",
    startDate: "2026-08-01",
    endDate: "2026-08-05",
    travelers: "2 người lớn",
    notes: "Seed trip for local development.",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(conversations).values({
    id: "seed-conversation-hanoi-hue",
    userId: "seed-traveler-user",
    tripProjectId: "seed-trip-hanoi-hue",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  await db.insert(messages).values([
    {
      id: "seed-message-user-1",
      conversationId: "seed-conversation-hanoi-hue",
      userId: "seed-traveler-user",
      role: "user",
      content: "Tư vấn lịch trình Hà Nội đi Huế 5 ngày bằng ô tô.",
      createdAt: now,
    },
    {
      id: "seed-message-assistant-1",
      conversationId: "seed-conversation-hanoi-hue",
      userId: "seed-traveler-user",
      role: "assistant",
      content: "Nên chia chặng Hà Nội - Nghệ An - Quảng Bình - Huế để giảm mệt và có thời gian nghỉ.",
      createdAt: new Date(now.getTime() + 60_000),
    },
  ]).onConflictDoNothing();

  await db.insert(chatContext).values([
    {
      id: "seed-chat-context-origin",
      userId: "seed-traveler-user",
      conversationId: "seed-conversation-hanoi-hue",
      tripProjectId: "seed-trip-hanoi-hue",
      sourceMessageId: "seed-message-user-1",
      field: "origin",
      scope: "trip_project",
      value: "Hà Nội",
      confidence: 95,
    },
    {
      id: "seed-chat-context-destination",
      userId: "seed-traveler-user",
      conversationId: "seed-conversation-hanoi-hue",
      tripProjectId: "seed-trip-hanoi-hue",
      sourceMessageId: "seed-message-user-1",
      field: "destination",
      scope: "trip_project",
      value: "Huế",
      confidence: 95,
    },
  ]).onConflictDoNothing();

  await db.insert(sources).values(facebookSources).onConflictDoNothing();

  await db.insert(rawSourceMaterial).values(facebookSources.map((source) => ({
    id: source.id.replace("source", "raw"),
    sourceId: source.id,
    rawMetadata: { sourceUrl: source.url },
  }))).onConflictDoNothing();

  await db.insert(webSearchResults).values({
    id: "seed-web-result-hue-weather",
    userId: "seed-traveler-user",
    conversationId: "seed-conversation-hanoi-hue",
    userMessageId: "seed-message-user-1",
    query: "thời tiết Huế tháng 8 du lịch tự lái",
    title: "Thời tiết Huế tháng 8",
    url: "https://example.com/hue-weather-august",
    snippet: "Tháng 8 ở Huế thường nóng, cần chuẩn bị lịch tham quan nhẹ vào buổi trưa.",
    provider: "seed",
    providerScore: 0.8,
    checkedAt: now,
    sourceType: "general",
    confidence: "unverified",
    triggerReason: "freshness_sensitive_request",
    rank: 1,
  }).onConflictDoNothing();

  await db.insert(assistantRetrievalDecisions).values({
    id: "seed-retrieval-decision-1",
    userId: "seed-traveler-user",
    conversationId: "seed-conversation-hanoi-hue",
    userMessageId: "seed-message-user-1",
    assistantMessageId: "seed-message-assistant-1",
    approvedKnowledgeCandidateCount: 0,
    approvedKnowledgeSelectedCount: 0,
    approvedKnowledgeTargetCount: 3,
    approvedKnowledgeRelevanceThreshold: 1,
    broadPlanningQuestion: true,
    freshnessRequired: false,
    conflictDetected: false,
    webSearchTriggered: true,
    webSearchTriggerReasons: ["freshness_sensitive_request"],
    generalReasoningUsed: true,
    warnings: [],
  }).onConflictDoNothing();
}

main()
  .then(async () => {
    await client.end();
    console.log("Seed data inserted.");
  })
  .catch(async (error) => {
    await client.end();
    console.error(error);
    process.exit(1);
  });
