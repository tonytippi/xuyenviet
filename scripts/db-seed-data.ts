import { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import { aiGatewayModels, rawSourceMaterial, sources, users } from "@xuyenviet/database";
import { loadFacebookSeedUrls } from "./facebook-seed-urls";
import { loadYoutubeSeedUrls } from "./youtube-seed-urls";

export async function seedDatabase(client: postgres.Sql) {
  const db = drizzle(client);
  const facebookSources = loadFacebookSeedUrls().map((source) => ({ id: source.id, kind: "facebook" as const, url: source.url, label: source.label, publisher: "Facebook", collectedDate: "2026-07-01", sourceType: "community" as const, verificationStatus: "unverified" as const, official: false, partner: false, submittedByUserId: "seed-fixture-operator-user" }));
  const youtubeSources = loadYoutubeSeedUrls().map((source) => ({ id: source.id, kind: "youtube" as const, url: source.url, canonicalUrl: source.url, label: source.label, publisher: "YouTube", collectedDate: "2026-07-01", sourceType: "community" as const, verificationStatus: "unverified" as const, official: false, partner: false, submittedByUserId: "seed-fixture-operator-user" }));
  const seedSources = [...facebookSources, ...youtubeSources];

  await db.insert(users).values([{ id: "seed-fixture-operator-user", name: "Seed Fixture Operator", email: "fixture-operator@xuyenviet.local" }]).onConflictDoNothing();
  await db.insert(aiGatewayModels).values([
      { id: "seed-model-answer", gatewayModelName: "cx/gpt-5.6-luna", displayLabel: "GPT 5.6 Luna", purpose: "ai_ask_initial_answer", active: true, defaultForPurpose: true, supportsTextInput: true, supportsStreaming: true, pricingCurrency: "USD", inputTokenPriceMicros: 400, outputTokenPriceMicros: 1600, pricingVersion: "seed" },
      { id: "seed-model-extraction", gatewayModelName: "cx/gpt-5.6-luna", displayLabel: "GPT 5.6 Luna Extraction", purpose: "extraction", active: true, defaultForPurpose: true, supportsTextInput: true, supportsExtraction: true, pricingCurrency: "USD", inputTokenPriceMicros: 400, outputTokenPriceMicros: 1600, pricingVersion: "seed" },
      { id: "seed-model-embeddings", gatewayModelName: "fireworks/nomic-ai/nomic-embed-text-v1.5", displayLabel: "Nomic Embed Text v1.5", purpose: "embeddings", active: true, defaultForPurpose: true, supportsTextInput: true, supportsEmbeddings: true, pricingCurrency: "USD", inputTokenPriceMicros: 20, pricingVersion: "seed" },
      { id: "seed-model-evaluation", gatewayModelName: "cx/gpt-5.6-luna", displayLabel: "GPT 5.6 Luna Evaluation", purpose: "evaluation", active: true, defaultForPurpose: true, supportsTextInput: true, supportsEvaluation: true, pricingCurrency: "USD", inputTokenPriceMicros: 400, outputTokenPriceMicros: 1600, pricingVersion: "seed" },
  ]).onConflictDoNothing();
  await db.insert(sources).values(seedSources).onConflictDoNothing();
  await db.insert(rawSourceMaterial).values(seedSources.map((source) => ({ id: source.id.replace("source", "raw"), sourceId: source.id, rawMetadata: { sourceUrl: source.url } }))).onConflictDoNothing();
}
