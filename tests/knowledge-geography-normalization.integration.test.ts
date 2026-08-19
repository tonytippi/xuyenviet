import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@xuyenviet/database", async (importOriginal) => ({
  ...await importOriginal<typeof import("@xuyenviet/database")>(),
  completeExtraction: vi.fn(),
  selectActiveAiGatewayModel: vi.fn(),
}));

import { aiGatewayModels, knowledgeCards, knowledgeIngestionCandidates, knowledgeProvinceReferences, sources, userRoles } from "@/db/schema";
import { knowledgeProvinceReferenceFixture } from "@/db/knowledge-geography";
import { completeExtraction, selectActiveAiGatewayModel } from "@xuyenviet/database";
import { claimNextKnowledgeIngestionCandidate, claimNextKnowledgeIngestionJob } from "@/features/knowledge/ingestion-jobs";
import { extractKnowledgeDraftsFromSourceAsActor } from "@/features/knowledge/extraction";
import { runKnowledgeIngestionCandidatePipeline, runKnowledgeIngestionPipeline } from "@/features/knowledge/ingestion-pipeline";
import { processNextApprovedKnowledgeIndexingBatch } from "@/features/knowledge/indexing-worker";
import { indexApprovedKnowledgeCard, searchApprovedKnowledge } from "@/features/knowledge/search";
import { appendSourceCaptureVersion } from "@/features/knowledge/source-captures";

import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

describe.sequential("Knowledge province geography persistence", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await seedTestOperator();
    await testDb.insert(userRoles).values({ userId: "operator", role: "operator" });
    await testDb.insert(sources).values({ id: "source", kind: "url", url: "https://example.com/source", canonicalUrl: "https://example.com/source", label: "Nguồn", sourceType: "curated", verificationStatus: "verified", eligibility: "eligible", submittedByUserId: "operator" });
  });

  test("installs provenance-backed references and normalizes a legacy candidate through card creation and search", async () => {
    const references = await testDb.select().from(knowledgeProvinceReferences);
    expect(references).toHaveLength(knowledgeProvinceReferenceFixture.length);
    expect(references.map(({ id, displayName, currentUnitId }) => ({ id, displayName, currentUnitId })).sort((left, right) => left.id.localeCompare(right.id))).toEqual([...knowledgeProvinceReferenceFixture].sort((left, right) => left.id.localeCompare(right.id)));
    expect(references).toContainEqual(expect.objectContaining({ id: "legacy-quang-nam", displayName: "Quảng Nam", currentUnitId: "vn-21-da-nang", version: "vn-admin-2025-07-01", effectiveDate: "2025-07-01", officialSourceUrl: expect.stringMatching(/^https:\/\//) }));
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "url", rawText: "Thông tin có bằng chứng.", metadata: { kind: "submitted" } });
    const job = await claimNextKnowledgeIngestionJob({ workerId: "worker", now: new Date(Date.now() + 1_000) }, testDb);
    if (!job) throw new Error("Expected ingestion job.");
    await runKnowledgeIngestionPipeline(job, testDb, async () => [{ fingerprint: "legacy-province", type: "place", title: "Điểm dừng", summary: "Thông tin có bằng chứng.", locationName: "Quảng Nam", spanStart: 0, spanEnd: 1 }]);
    await expect(testDb.select().from(knowledgeIngestionCandidates).where(eq(knowledgeIngestionCandidates.ingestionJobId, job.jobId))).resolves.toMatchObject([{ locationName: "Quảng Nam", normalizedCurrentProvinceId: "vn-21-da-nang", normalizedCurrentProvinceName: "Đà Nẵng" }]);
    const candidate = await claimNextKnowledgeIngestionCandidate({ workerId: "candidate-worker", now: new Date(Date.now() + 2_000) }, testDb);
    if (!candidate) throw new Error("Expected candidate.");
    await runKnowledgeIngestionCandidatePipeline(candidate, testDb, async () => ({ disposition: "apply", outcomeReasonCode: "applied", relation: { kind: "create", rationale: "Distinct evidence." } }));
    const [card] = await testDb.select().from(knowledgeCards).where(and(eq(knowledgeCards.locationName, "Quảng Nam"), eq(knowledgeCards.normalizedCurrentProvinceId, "vn-21-da-nang")));
    expect(card).toMatchObject({ normalizedCurrentProvinceName: "Đà Nẵng", lifecycleState: "active", knowledgeState: "community_observation" });
    await indexApprovedKnowledgeCard(card!.id);
    await expect(processNextApprovedKnowledgeIndexingBatch({}, testDb)).resolves.toMatchObject({ indexedCount: 1 });
    await expect(searchApprovedKnowledge("Đà Nẵng")).resolves.toEqual([expect.objectContaining({ id: card!.id, locationName: "Quảng Nam", normalizedCurrentProvinceName: "Đà Nẵng" })]);
    expect(capture.id).toBeTruthy();
  });

  test("does not backfill granular or multi-place labels", async () => {
    await testDb.insert(knowledgeCards).values({ id: "unsafe", lifecycleState: "active", knowledgeState: "community_observation", verificationRequirement: "none", type: "place", title: "Hội An", locationName: "Đà Nẵng - Hội An", summary: "Không suy diễn.", aiPromptVersion: "test", createdByUserId: "operator" });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.id, "unsafe"))).resolves.toMatchObject([{ locationName: "Đà Nẵng - Hội An", normalizedCurrentProvinceId: null, normalizedCurrentProvinceName: null, lifecycleState: "active" }]);
  });

  test("persists deterministic legacy geography through direct extraction", async () => {
    const capture = await appendSourceCaptureVersion(testDb, { sourceId: "source", captureKind: "url", rawText: "Nguồn có nội dung đủ điều kiện.", metadata: { kind: "submitted" } });
    await testDb.insert(aiGatewayModels).values({ id: "model", gatewayModelName: "test-model", displayLabel: "Test model", purpose: "extraction", supportsTextInput: true, supportsExtraction: true });
    vi.mocked(selectActiveAiGatewayModel).mockResolvedValue({ id: "model", gatewayModelName: "test-model" } as never);
    vi.mocked(completeExtraction).mockResolvedValue({ ok: true, provider: "test", model: "test-model", latencyMs: 1, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, cachedPromptTokens: null, cacheWritePromptTokens: null }, content: JSON.stringify({ drafts: [{ type: "place", title: "Điểm dừng", location_name: "Quảng Nam", route_segment: null, summary: "Thông tin vận hành đã được diễn giải.", practical_details: {}, tags: [], confidence: "curated", freshness_sensitive: false }] }) } as never);

    await expect(extractKnowledgeDraftsFromSourceAsActor("source", { userId: "operator", email: "operator@example.com" }, { captureVersionId: capture.id })).resolves.toMatchObject({ draftCount: 1 });
    await expect(testDb.select().from(knowledgeCards).where(eq(knowledgeCards.locationName, "Quảng Nam"))).resolves.toMatchObject([{ locationName: "Quảng Nam", normalizedCurrentProvinceId: "vn-21-da-nang", normalizedCurrentProvinceName: "Đà Nẵng" }]);
  });

  test("migration backfills only geography fields for an existing exact legacy card", async () => {
    const schemaName = "province_migration_test";
    const migration = readFileSync(resolve(process.cwd(), "drizzle/migrations/0073_normalize_knowledge_province_references.sql"), "utf8");
    const referenceInsert = migration.match(/INSERT INTO "knowledge_province_references" \("id", "display_name", "current_unit_id", "version", "effective_date", "official_source_url"\) VALUES[\s\S]*?;\n\nALTER TABLE/)?.[0].replace(/\n\nALTER TABLE$/, "");
    const candidateBackfill = migration.match(/UPDATE "knowledge_ingestion_candidates" AS candidate[\s\S]*?reference\."display_name";/)?.[0];
    const cardBackfill = migration.match(/UPDATE "knowledge_cards" AS card[\s\S]*?reference\."display_name";/)?.[0];
    const searchBackfill = migration.match(/UPDATE "knowledge_card_search_documents" AS document[\s\S]*?IS DISTINCT FROM card\."location_name";/)?.[0];
    const candidatePairConstraint = migration.match(/ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_normalized_province_pair_fk"[\s\S]*?;/)?.[0];
    const cardPairConstraint = migration.match(/ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_normalized_province_pair_fk"[\s\S]*?;/)?.[0];
    const candidateShapeConstraint = migration.match(/ALTER TABLE "knowledge_ingestion_candidates" ADD CONSTRAINT "knowledge_ingestion_candidates_normalized_province_shape_check"[\s\S]*?;/)?.[0];
    const cardShapeConstraint = migration.match(/ALTER TABLE "knowledge_cards" ADD CONSTRAINT "knowledge_cards_normalized_province_shape_check"[\s\S]*?;/)?.[0];
    if (!referenceInsert || !candidateBackfill || !cardBackfill || !searchBackfill || !candidatePairConstraint || !cardPairConstraint || !candidateShapeConstraint || !cardShapeConstraint) throw new Error("Expected migration reference, constraint, and backfill statements.");
    await testDb.execute(sql.raw(`create schema ${schemaName}; create table ${schemaName}.knowledge_ingestion_candidates (id text primary key, title text not null, location_name text, processing_status text not null); create table ${schemaName}.knowledge_cards (id text primary key, title text not null, location_name text, lifecycle_state text not null); create table ${schemaName}.knowledge_card_search_documents (knowledge_card_id text, searchable_text text, text_hash text, updated_at timestamp); insert into ${schemaName}.knowledge_ingestion_candidates (id, title, location_name, processing_status) values ('legacy-candidate', 'Giữ nguyên candidate', 'Quảng Nam', 'queued'); insert into ${schemaName}.knowledge_cards (id, title, location_name, lifecycle_state) values ('legacy-card', 'Giữ nguyên nội dung', 'Quảng Nam', 'pending_operator'); insert into ${schemaName}.knowledge_card_search_documents (knowledge_card_id, searchable_text, text_hash) values ('legacy-card', E'Tiêu đề\\nQuảng Nam', repeat('a', 64));`));
    try {
      await testDb.execute(sql.raw(`set local search_path to ${schemaName}; create table knowledge_province_references (id text primary key, display_name text not null, current_unit_id text not null, version text not null, effective_date text not null, official_source_url text not null); create unique index knowledge_province_references_id_display_name_idx on knowledge_province_references (id, display_name); alter table knowledge_ingestion_candidates add column normalized_current_province_id text; alter table knowledge_ingestion_candidates add column normalized_current_province_name text; alter table knowledge_cards add column normalized_current_province_id text; alter table knowledge_cards add column normalized_current_province_name text; ${referenceInsert}; ${candidatePairConstraint}; ${candidateShapeConstraint}; ${cardPairConstraint}; ${cardShapeConstraint}; ${candidateBackfill}; ${cardBackfill}; ${searchBackfill}`));
      const installedReferences = await testDb.execute(sql.raw(`select id, display_name as "displayName", current_unit_id as "currentUnitId" from ${schemaName}.knowledge_province_references`));
      const compareReferenceId = (left: { id: string }, right: { id: string }) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
      const normalizedInstalledReferences = installedReferences.map(({ id, displayName, currentUnitId }) => ({ id: String(id), displayName: String(displayName), currentUnitId: String(currentUnitId) }));
      expect(normalizedInstalledReferences.sort(compareReferenceId)).toEqual([...knowledgeProvinceReferenceFixture].sort(compareReferenceId).map(({ id, displayName, currentUnitId }) => ({ id, displayName, currentUnitId })));
      const candidates = await testDb.execute(sql.raw(`select title, location_name, normalized_current_province_id, normalized_current_province_name, processing_status from ${schemaName}.knowledge_ingestion_candidates where id = 'legacy-candidate'`));
      expect(candidates).toEqual([{ title: "Giữ nguyên candidate", location_name: "Quảng Nam", normalized_current_province_id: "vn-21-da-nang", normalized_current_province_name: "Đà Nẵng", processing_status: "queued" }]);
      const rows = await testDb.execute(sql.raw(`select title, location_name, normalized_current_province_id, normalized_current_province_name, lifecycle_state from ${schemaName}.knowledge_cards where id = 'legacy-card'`));
      expect(rows).toEqual([{ title: "Giữ nguyên nội dung", location_name: "Quảng Nam", normalized_current_province_id: "vn-21-da-nang", normalized_current_province_name: "Đà Nẵng", lifecycle_state: "pending_operator" }]);
      await expect(testDb.execute(sql.raw(`select searchable_text from ${schemaName}.knowledge_card_search_documents where knowledge_card_id = 'legacy-card'`))).resolves.toEqual([{ searchable_text: "Tiêu đề\nQuảng Nam\nĐà Nẵng" }]);
      await expect(testDb.execute(sql.raw(`insert into ${schemaName}.knowledge_ingestion_candidates (id, title, location_name, processing_status, normalized_current_province_id, normalized_current_province_name) values ('wrong-candidate', 'Sai cặp', 'Quảng Nam', 'queued', 'vn-21-da-nang', 'Huế')`))).rejects.toMatchObject({ cause: { code: "23503", constraint_name: "knowledge_ingestion_candidates_normalized_province_pair_fk" } });
      await expect(testDb.execute(sql.raw(`insert into ${schemaName}.knowledge_cards (id, title, location_name, lifecycle_state, normalized_current_province_id, normalized_current_province_name) values ('wrong-card', 'Sai cặp', 'Quảng Nam', 'draft', 'vn-21-da-nang', 'Huế')`))).rejects.toMatchObject({ cause: { code: "23503", constraint_name: "knowledge_cards_normalized_province_pair_fk" } });
      await expect(testDb.execute(sql.raw(`insert into ${schemaName}.knowledge_ingestion_candidates (id, title, location_name, processing_status, normalized_current_province_id) values ('id-only-candidate', 'Thiếu tên', 'Quảng Nam', 'queued', 'vn-21-da-nang')`))).rejects.toMatchObject({ cause: { code: "23514", constraint_name: "knowledge_ingestion_candidates_normalized_province_shape_check" } });
      await expect(testDb.execute(sql.raw(`insert into ${schemaName}.knowledge_ingestion_candidates (id, title, location_name, processing_status, normalized_current_province_name) values ('name-only-candidate', 'Thiếu ID', 'Quảng Nam', 'queued', 'Đà Nẵng')`))).rejects.toMatchObject({ cause: { code: "23514", constraint_name: "knowledge_ingestion_candidates_normalized_province_shape_check" } });
      await expect(testDb.execute(sql.raw(`insert into ${schemaName}.knowledge_cards (id, title, location_name, lifecycle_state, normalized_current_province_id) values ('id-only-card', 'Thiếu tên', 'Quảng Nam', 'draft', 'vn-21-da-nang')`))).rejects.toMatchObject({ cause: { code: "23514", constraint_name: "knowledge_cards_normalized_province_shape_check" } });
      await expect(testDb.execute(sql.raw(`insert into ${schemaName}.knowledge_cards (id, title, location_name, lifecycle_state, normalized_current_province_name) values ('name-only-card', 'Thiếu ID', 'Quảng Nam', 'draft', 'Đà Nẵng')`))).rejects.toMatchObject({ cause: { code: "23514", constraint_name: "knowledge_cards_normalized_province_shape_check" } });
    } finally {
      await testDb.execute(sql.raw(`drop schema if exists ${schemaName} cascade`));
    }
  });
});
