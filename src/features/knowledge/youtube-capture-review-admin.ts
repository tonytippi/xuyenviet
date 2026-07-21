import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { sourceCaptureVersions, sources } from "@/db/schema";
import { getActiveKnowledgeExtractionJobForSource } from "@/features/knowledge/extraction-jobs";
import { getExistingCardsForCaptureSource } from "@/features/knowledge/facebook-capture-review";
import { parseStoredYoutubeEvidence } from "@/features/knowledge/youtube-capture";
import { requireAdminSession } from "@/server/auth";

const safeMetadataMaxLength = 160;
const unsafeMetadataPattern = /cookie|token|secret|password|provider\s*payload|provider[_-]?payload|prompt|response|<html|<!doctype/i;

type YoutubeCaptureRow = {
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string | null;
  sourceCanonicalUrl: string | null;
  sourceType: typeof sources.$inferSelect.sourceType;
  verificationStatus: typeof sources.$inferSelect.verificationStatus;
  official: boolean;
  partner: boolean;
  createdAt: Date;
  rawText: string | null;
  captureMethod: string | null;
  capturedAt: string | null;
  model: string | null;
  promptVersion: string | null;
  evidenceCount: string | null;
};

export async function listAdminYoutubeCaptureReviews(input: { limit?: number; offset?: number } = {}) {
  await requireAdminSession();
  const db = getDb();
  const rows = await db
    .select(youtubeCaptureSelection)
    .from(sources)
     .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, sources.currentCaptureVersionId))
    .where(eq(sources.kind, "youtube"))
    .orderBy(desc(sources.createdAt));

  const captures = await hydrateCapturedRows(db, rows);
  const offset = Math.max(input.offset ?? 0, 0);
  return captures.slice(offset, offset + (input.limit ?? 25));
}

export async function countAdminYoutubeCaptureReviews() {
  await requireAdminSession();
  const db = getDb();
  const rows = await db
    .select(youtubeCaptureSelection)
    .from(sources)
     .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, sources.currentCaptureVersionId))
    .where(eq(sources.kind, "youtube"));

  return (await hydrateCapturedRows(db, rows)).length;
}

export async function getAdminYoutubeCaptureReviewDetail(sourceId: string) {
  await requireAdminSession();
  const normalizedSourceId = sourceId.trim();
  if (!normalizedSourceId) return null;

  const db = getDb();
  const [row] = await db
    .select(youtubeCaptureSelection)
    .from(sources)
     .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, sources.currentCaptureVersionId))
    .where(and(eq(sources.id, normalizedSourceId), eq(sources.kind, "youtube")))
    .limit(1);

  return row ? (await hydrateCapturedRows(db, [row]))[0] ?? null : null;
}

export async function getAdminYoutubeCaptureExtractionTarget(sourceId: string) {
  const session = await requireAdminSession();
  const detail = await getAdminYoutubeCaptureReviewDetail(sourceId);
  if (!detail) return null;

  return {
    sourceId: detail.sourceId,
    actor: { userId: session.userId, email: session.email },
    existingCards: detail.existingCards,
  };
}

const youtubeCaptureSelection = {
  sourceId: sources.id,
  sourceLabel: sources.label,
  sourceUrl: sources.url,
  sourceCanonicalUrl: sources.canonicalUrl,
  sourceType: sources.sourceType,
  verificationStatus: sources.verificationStatus,
  official: sources.official,
  partner: sources.partner,
  createdAt: sources.createdAt,
   rawText: sourceCaptureVersions.rawText,
   captureMethod: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'captureMethod'`,
   capturedAt: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'capturedAt'`,
   model: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'model'`,
   promptVersion: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'promptVersion'`,
   evidenceCount: sql<string | null>`${sourceCaptureVersions.rawMetadata}->>'evidenceCount'`,
};

async function hydrateCapturedRows(db: ReturnType<typeof getDb>, rows: YoutubeCaptureRow[]) {
  return Promise.all(
    rows.flatMap(async (row) => {
      const evidence = parseStoredYoutubeEvidence(row.rawText);
      if (!evidence || row.captureMethod !== "gemini_youtube_url") return [];

      return [{
        sourceId: row.sourceId,
        sourceLabel: safeText(row.sourceLabel) ?? "YouTube video",
        sourceUrl: safeUrl(row.sourceUrl),
        sourceCanonicalUrl: safeUrl(row.sourceCanonicalUrl),
        sourceType: row.sourceType,
        verificationStatus: row.verificationStatus,
        official: row.official,
        partner: row.partner,
        createdAt: row.createdAt,
        captureMethod: row.captureMethod,
        capturedAt: safeIsoDate(row.capturedAt),
        model: safeText(row.model),
        promptVersion: safeText(row.promptVersion),
        evidenceCount: evidence.length,
        evidence,
        existingCards: await getExistingCardsForCaptureSource(db, row.sourceId),
        activeExtractionJob: await getActiveKnowledgeExtractionJobForSource(db, row.sourceId),
      }];
    }),
  ).then((items) => items.flat());
}

function safeText(value: string | null) {
  const text = value?.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return text && !unsafeMetadataPattern.test(text) ? text.slice(0, safeMetadataMaxLength) : null;
}

function safeIsoDate(value: string | null) {
  const text = safeText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    for (const key of Array.from(url.searchParams.keys())) {
      const queryValue = url.searchParams.get(key) ?? "";
      if (/token|secret|key|signature|password|code/i.test(key) || unsafeMetadataPattern.test(queryValue)) {
        url.searchParams.set(key, "[ẩn]");
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}
