import { and, eq, sql } from "drizzle-orm";
import { type YoutubeCaptureCompatibilityDescriptor, type YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { resolveConfiguredYoutubeCaptureCompatibility } from "./runtime-config";
import { sourceCaptureVersions, sources } from "./schema";

type KnowledgeReader = Pick<ReturnType<typeof getDb>, "transaction">;
const eligibilityStatementTimeoutMs = 900;

/** Knowledge owns this projection so Discovery cannot observe source or capture identity. */
export function createYoutubeCaptureEligibilityPort(database: KnowledgeReader = getDb(), compatibility: YoutubeCaptureCompatibilityDescriptor = resolveConfiguredYoutubeCaptureCompatibility()): YoutubeCaptureEligibilityPort {
  return {
    async check(videoId, signal) {
      if (signal?.aborted) return "unavailable";
      try {
        const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const [capture] = await database.transaction(async (transaction) => {
          await transaction.execute(sql.raw(`set local statement_timeout = ${eligibilityStatementTimeoutMs}`));
          if (signal?.aborted) throw new Error("YouTube capture eligibility read aborted.");
          return transaction.select({ id: sourceCaptureVersions.id }).from(sourceCaptureVersions).innerJoin(sources, and(eq(sources.id, sourceCaptureVersions.sourceId), eq(sources.kind, "youtube"))).where(and(eq(sources.canonicalUrl, canonicalUrl), eq(sourceCaptureVersions.captureMethodVersion, compatibility.captureMethodVersion), eq(sourceCaptureVersions.payloadSchemaVersion, compatibility.payloadSchemaVersion), sql`${sources.currentCaptureVersionId} = ${sourceCaptureVersions.id}`)).limit(1);
        });
        return capture ? "already_compatible" : "eligible";
      } catch { return "unavailable"; }
    },
  };
}
