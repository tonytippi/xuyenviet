import { eq } from "drizzle-orm";

import { knowledgeCardEvidence, sourceCaptureVersions, sources, type KnowledgeEvidenceDisplayPolicy, type KnowledgeSourceSupport, type SourceKind } from "@/db/schema";
import { hashCaptureText, normalizeCaptureText } from "@/features/knowledge/source-captures";

import { testDb } from "./db";

export async function seedSourceCaptureVersion(input: {
  sourceId: string;
  rawText?: string | null;
  rawMetadata?: Record<string, unknown>;
  captureKind?: SourceKind;
  id?: string;
  versionSequence?: number;
  capturedAt?: Date;
}) {
  const rawText = input.rawText === null || input.rawText === undefined ? null : normalizeCaptureText(input.rawText);
  const [version] = await testDb
    .insert(sourceCaptureVersions)
    .values({
      id: input.id,
      sourceId: input.sourceId,
      versionSequence: input.versionSequence ?? 1,
      captureKind: input.captureKind ?? "facebook",
      rawText,
      rawMetadata: input.rawMetadata,
      contentHash: hashCaptureText(rawText ?? ""),
      capturedAt: input.capturedAt ?? new Date("2026-07-13T00:00:00.000Z"),
    })
    .returning();
  await testDb.update(sources).set({ currentCaptureVersionId: version.id }).where(eq(sources.id, input.sourceId));
  return version;
}

export async function seedKnowledgeCardEvidence(input: {
  cardId: string;
  sourceId: string;
  captureVersionId: string;
  quoteText: string;
  spanStart?: number;
  supportLevel?: KnowledgeSourceSupport;
  displayPolicy?: KnowledgeEvidenceDisplayPolicy;
  state?: "active" | "removed";
  observedAt?: Date;
  independenceKey?: string;
}) {
  const spanStart = input.spanStart ?? 0;
  const [evidence] = await testDb
    .insert(knowledgeCardEvidence)
    .values({
      knowledgeCardId: input.cardId,
      sourceId: input.sourceId,
      captureVersionId: input.captureVersionId,
      quoteText: input.quoteText,
      spanStart,
      spanEnd: spanStart + Array.from(input.quoteText).length,
      observedAt: input.observedAt ?? new Date("2026-07-13T00:00:00.000Z"),
      capturedAt: new Date("2026-07-13T00:00:00.000Z"),
      supportLevel: input.supportLevel ?? "supporting",
      displayPolicy: input.displayPolicy ?? "fact_only",
      state: input.state ?? "active",
      independenceKey: input.independenceKey ?? `${input.sourceId}:${input.captureVersionId}`,
    })
    .returning();
  return evidence;
}
