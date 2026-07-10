import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  aiGatewayModels,
  assistantResponseProvenance,
  assistantRetrievalDecisions,
  chatContext,
  conversations,
  knowledgeCardSearchDocuments,
  knowledgeCardSources,
  knowledgeCards,
  messages,
  rawSourceMaterial,
  sources,
  tripProjects,
  userRoles,
  users,
  webSearchResults,
} from "../src/db/schema";
import { getDatabaseUrl } from "./db-env";

const databaseUrl = getDatabaseUrl();
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

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
  ]).onConflictDoNothing();

  await db.insert(userRoles).values([
    { userId: "seed-traveler-user", role: "traveler" },
  ]).onConflictDoNothing();

  await db.insert(aiGatewayModels).values([
    {
      id: "seed-model-answer",
      gatewayModelName: "cx/gpt-5.4-mini",
      displayLabel: "GPT 5.4 Mini",
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
      gatewayModelName: "cx/gpt-5.4-mini",
      displayLabel: "GPT 5.4 Mini Extraction",
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
      gatewayModelName: "cx/gpt-5.4-mini",
      displayLabel: "GPT 5.4 Mini Evaluation",
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

  await db.insert(sources).values([
    {
      id: "seed-source-hue-parking",
      kind: "pasted_text",
      label: "Kinh nghiệm đỗ xe trung tâm Huế",
      sourceType: "curated",
      verificationStatus: "verified",
      official: false,
      partner: false,
      submittedByUserId: "seed-fixture-operator-user",
    },
    {
      id: "seed-source-quang-binh-stop",
      kind: "url",
      url: "https://example.com/quang-binh-rest-stop",
      canonicalUrl: "https://example.com/quang-binh-rest-stop",
      label: "Điểm nghỉ giữa đường ở Quảng Bình",
      publisher: "Example Travel",
      collectedDate: "2026-06-15",
      sourceType: "community",
      verificationStatus: "unverified",
      official: false,
      partner: false,
      submittedByUserId: "seed-fixture-operator-user",
    },
  ]).onConflictDoNothing();

  await db.insert(rawSourceMaterial).values([
    {
      id: "seed-raw-hue-parking",
      sourceId: "seed-source-hue-parking",
      rawText: "Trung tâm Huế dễ đông cuối tuần. Nên chọn khách sạn có bãi đỗ hoặc hỏi trước chỗ gửi xe qua đêm.",
    },
    {
      id: "seed-raw-quang-binh-stop",
      sourceId: "seed-source-quang-binh-stop",
      rawText: "Một số gia đình chọn nghỉ ở Đồng Hới để chia chặng trước khi vào Huế.",
    },
  ]).onConflictDoNothing();

  await db.insert(knowledgeCards).values([
    {
      id: "seed-card-hue-parking",
      status: "approved",
      type: "parking",
      title: "Hỏi bãi đỗ xe qua đêm khi ở trung tâm Huế",
      locationName: "Huế",
      summary: "Khu trung tâm Huế có thể khó đỗ xe vào cuối tuần. Nên ưu tiên khách sạn có bãi đỗ hoặc xác nhận điểm gửi xe trước khi đặt phòng.",
      practicalDetails: { applies_to: "self_drive", timing: "before_booking" },
      tags: ["hue", "parking", "hotel"],
      confidence: "curated",
      freshnessSensitive: false,
      needsReview: false,
      aiPromptVersion: "seed-v1",
      aiGatewayModelId: "seed-model-extraction",
      createdByUserId: "seed-fixture-operator-user",
    },
    {
      id: "seed-card-quang-binh-stop",
      status: "approved",
      type: "route_note",
      title: "Chia chặng tại Đồng Hới khi đi Hà Nội - Huế",
      locationName: "Đồng Hới",
      routeSegment: "Hà Nội - Huế",
      summary: "Nếu đi cùng trẻ nhỏ hoặc không muốn lái quá dài, Đồng Hới là điểm nghỉ hợp lý trước khi vào Huế hôm sau.",
      practicalDetails: { drive_style: "relaxed", overnight_stop: true },
      tags: ["quang-binh", "dong-hoi", "route"],
      confidence: "community",
      freshnessSensitive: false,
      needsReview: false,
      aiPromptVersion: "seed-v1",
      aiGatewayModelId: "seed-model-extraction",
      createdByUserId: "seed-fixture-operator-user",
    },
  ]).onConflictDoNothing();

  await db.insert(knowledgeCardSources).values([
    {
      knowledgeCardId: "seed-card-hue-parking",
      sourceId: "seed-source-hue-parking",
      supportLevel: "primary",
    },
    {
      knowledgeCardId: "seed-card-quang-binh-stop",
      sourceId: "seed-source-quang-binh-stop",
      supportLevel: "primary",
    },
  ]).onConflictDoNothing();

  await db.insert(knowledgeCardSearchDocuments).values([
    {
      id: "seed-search-doc-hue-parking",
      knowledgeCardId: "seed-card-hue-parking",
      status: "active",
      searchableText: "Huế parking hotel bãi đỗ xe qua đêm trung tâm khách sạn",
      textHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      sourceCount: 1,
      confidence: "curated",
      freshnessSensitive: false,
    },
    {
      id: "seed-search-doc-quang-binh-stop",
      knowledgeCardId: "seed-card-quang-binh-stop",
      status: "active",
      searchableText: "Hà Nội Huế Đồng Hới Quảng Bình chia chặng nghỉ đêm tự lái",
      textHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sourceCount: 1,
      confidence: "community",
      freshnessSensitive: false,
    },
  ]).onConflictDoNothing();

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
    approvedKnowledgeCandidateCount: 2,
    approvedKnowledgeSelectedCount: 2,
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

  await db.insert(assistantResponseProvenance).values([
    {
      id: "seed-provenance-hue-parking",
      userId: "seed-traveler-user",
      conversationId: "seed-conversation-hanoi-hue",
      userMessageId: "seed-message-user-1",
      assistantMessageId: "seed-message-assistant-1",
      sourceCategory: "knowledge",
      sourceReferenceId: "seed-card-hue-parking",
      sourceReferenceType: "knowledge_card",
      rank: 1,
      retrievalScore: 0.92,
      sourceType: "curated",
      verificationStatus: "verified",
      usedInPrompt: true,
      citedInAnswer: true,
      sourceSnapshot: { title: "Hỏi bãi đỗ xe qua đêm khi ở trung tâm Huế" },
    },
    {
      id: "seed-provenance-quang-binh-stop",
      userId: "seed-traveler-user",
      conversationId: "seed-conversation-hanoi-hue",
      userMessageId: "seed-message-user-1",
      assistantMessageId: "seed-message-assistant-1",
      sourceCategory: "knowledge",
      sourceReferenceId: "seed-card-quang-binh-stop",
      sourceReferenceType: "knowledge_card",
      rank: 2,
      retrievalScore: 0.86,
      sourceType: "community",
      verificationStatus: "unverified",
      usedInPrompt: true,
      citedInAnswer: true,
      sourceSnapshot: { title: "Chia chặng tại Đồng Hới khi đi Hà Nội - Huế" },
    },
  ]).onConflictDoNothing();
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
