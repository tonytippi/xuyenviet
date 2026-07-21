import { eq } from "drizzle-orm";

import { sourceCaptureVersions, sources, type SourceKind } from "@/db/schema";
import { hashCaptureText, normalizeCaptureText } from "@/features/knowledge/source-captures";

import { testDb } from "./db";

export async function seedSourceCaptureVersion(input: {
  sourceId: string;
  rawText?: string | null;
  rawMetadata?: Record<string, unknown>;
  captureKind?: SourceKind;
  id?: string;
  capturedAt?: Date;
}) {
  const rawText = input.rawText === null || input.rawText === undefined ? null : normalizeCaptureText(input.rawText);
  const [version] = await testDb
    .insert(sourceCaptureVersions)
    .values({
      id: input.id,
      sourceId: input.sourceId,
      versionSequence: 1,
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
