import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { AdminKnowledgeIntake, AdminKnowledgeIntakeQuery, AdminKnowledgeSeedBatchRequest, AdminKnowledgeSeedBatchResponse, AdminKnowledgeSourceRemovalRequest, AdminKnowledgeSourceRemovalResponse, RequestPrincipal } from "@xuyenviet/contracts";
import { canonicalizeYoutubeVideoUrl, type AdminKnowledgeIntakePort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { knowledgeOneUrlHandoffs, knowledgeSeedBatchItems, knowledgeSeedBatches, sources } from "./schema";
import { safeAdminDisplayUrl } from "./admin-youtube-capture";

export function createPostgresAdminKnowledgeIntakePort(): AdminKnowledgeIntakePort { return { list, submitBatch: submit, removeSource, handoff: { submit: submitHandoff, lookup: lookupHandoff } }; }
async function list(input: AdminKnowledgeIntakeQuery): Promise<AdminKnowledgeIntake> {
  const db = getDb();
  const sourceRows = await db.select({ id: sources.id, url: sources.url, canonicalUrl: sources.canonicalUrl, label: sources.label, kind: sources.kind, currentCaptureVersionId: sources.currentCaptureVersionId, eligibility: sources.eligibility, removalReason: sources.removalReason, createdAt: sources.createdAt }).from(sources).where(and(inArray(sources.kind, ["url", "facebook", "youtube"]), input.kind ? eq(sources.kind, input.kind) : undefined, input.processed === undefined ? undefined : input.processed ? isNotNull(sources.currentCaptureVersionId) : isNull(sources.currentCaptureVersionId))).orderBy(desc(sources.createdAt)).limit(100);
  return { sources: sourceRows.map((source) => ({ id: source.id, displayUrl: source.eligibility === "eligible" ? safeAdminDisplayUrl(source.canonicalUrl ?? source.url) : null, displayTitle: source.label, kind: source.kind as "url" | "facebook" | "youtube", processed: source.currentCaptureVersionId !== null, eligibility: source.eligibility, removalReason: source.removalReason, createdAt: source.createdAt.toISOString() })) };
}
async function submit(actor: RequestPrincipal, input: AdminKnowledgeSeedBatchRequest): Promise<AdminKnowledgeSeedBatchResponse> {
  const db = getDb();
  return db.transaction((tx) => submitInTransaction(tx, actor, input));
}
async function submitInTransaction(tx: Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (arg: infer T) => unknown ? T : never, actor: Pick<RequestPrincipal, "userId">, input: AdminKnowledgeSeedBatchRequest): Promise<AdminKnowledgeSeedBatchResponse> {
    const [batch] = await tx.insert(knowledgeSeedBatches).values({ label: input.label ?? null, submittedByUserId: actor.userId }).returning({ id: knowledgeSeedBatches.id });
    const seenCanonicalUrls = new Set<string>();
    let submittedCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;

    for (const [index, submittedUrl] of input.urls.entries()) {
      const normalized = normalizeIntakeUrl(submittedUrl);
      if (!normalized) {
        failedCount += 1;
        await tx.insert(knowledgeSeedBatchItems).values({ batchId: batch.id, lineNumber: index + 1, submittedUrl, canonicalUrl: null, sourceId: null, status: "failed", errorSummary: "URL phải là địa chỉ HTTPS hợp lệ." });
        continue;
      }

      if (seenCanonicalUrls.has(normalized.url)) {
        duplicateCount += 1;
        await tx.insert(knowledgeSeedBatchItems).values({ batchId: batch.id, lineNumber: index + 1, submittedUrl, canonicalUrl: normalized.url, sourceId: null, status: "duplicate", errorSummary: null });
        continue;
      }
      seenCanonicalUrls.add(normalized.url);

      // The lock makes the read-then-insert duplicate check safe across concurrent batches.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${normalized.url}, 45))`);
      const [existing] = await tx.select({ id: sources.id }).from(sources).where(eq(sources.canonicalUrl, normalized.url)).limit(1);
      if (existing) {
        duplicateCount += 1;
        await tx.insert(knowledgeSeedBatchItems).values({ batchId: batch.id, lineNumber: index + 1, submittedUrl, canonicalUrl: normalized.url, sourceId: null, status: "duplicate", errorSummary: null });
        continue;
      }

      const [source] = await tx.insert(sources).values({ kind: normalized.kind, url: normalized.url, canonicalUrl: normalized.url, label: `Nguồn từ ${normalized.hostname}`, publisher: input.publisher ?? normalized.hostname, collectedDate: input.collectedDate ?? null, sourceType: "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: actor.userId }).returning({ id: sources.id });
      submittedCount += 1;
      await tx.insert(knowledgeSeedBatchItems).values({ batchId: batch.id, lineNumber: index + 1, submittedUrl, canonicalUrl: normalized.url, sourceId: source.id, status: "pending", errorSummary: null });
    }

    return { batchId: batch.id, totalItems: input.urls.length, submittedCount, failedCount, duplicateCount };
}
async function removeSource(_actor: RequestPrincipal, _sourceId: string, _input: AdminKnowledgeSourceRemovalRequest): Promise<AdminKnowledgeSourceRemovalResponse> { throw new Error("Source removal lifecycle transitions require the Story 15.3 command."); }

async function submitHandoff(input: { reference: string; canonicalUrl: string; actorUserId: string }): Promise<"submitted" | "duplicate" | "failed" | "reconciling"> {
  if (!validReference(input.reference) || !validReference(input.actorUserId) || canonicalizeYoutubeVideoUrl(input.canonicalUrl)?.canonicalUrl !== input.canonicalUrl) return "reconciling";
  const db = getDb();
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(knowledgeOneUrlHandoffs).where(eq(knowledgeOneUrlHandoffs.reference, input.reference)).limit(1).for("update");
      if (existing) return existing.actorUserId === input.actorUserId && existing.canonicalUrl === input.canonicalUrl ? existing.outcome ?? "reconciling" : "reconciling";
      await tx.insert(knowledgeOneUrlHandoffs).values({ reference: input.reference, canonicalUrl: input.canonicalUrl, actorUserId: input.actorUserId });
      const result = await submitInTransaction(tx, { userId: input.actorUserId }, { urls: [input.canonicalUrl] });
      const outcome = classifyOneUrl(result);
      if (outcome === "reconciling") return outcome;
      await tx.update(knowledgeOneUrlHandoffs).set({ outcome, completedAt: new Date() }).where(eq(knowledgeOneUrlHandoffs.reference, input.reference));
      return outcome;
    });
  } catch {
    // A competing insert can lose the unique-reference race after the winner commits.
    // Read its owner-bound durable result rather than turning that completed admission into ambiguity.
    const outcome = await lookupHandoff(input.reference);
    return outcome === "missing" ? "reconciling" : outcome;
  }
}

async function lookupHandoff(reference: string): Promise<"submitted" | "duplicate" | "failed" | "reconciling" | "missing"> {
  if (!validReference(reference)) return "reconciling";
  try {
    const [row] = await getDb().select({ outcome: knowledgeOneUrlHandoffs.outcome }).from(knowledgeOneUrlHandoffs).where(eq(knowledgeOneUrlHandoffs.reference, reference)).limit(1);
    if (!row) return "missing";
    return row.outcome ?? "reconciling";
  } catch { return "reconciling"; }
}

function validReference(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
function classifyOneUrl(result: AdminKnowledgeSeedBatchResponse): "submitted" | "duplicate" | "failed" | "reconciling" {
  return result.submittedCount === 1 && result.duplicateCount === 0 && result.failedCount === 0 ? "submitted"
    : result.submittedCount === 0 && result.duplicateCount === 1 && result.failedCount === 0 ? "duplicate"
      : result.submittedCount === 0 && result.duplicateCount === 0 && result.failedCount === 1 ? "failed" : "reconciling";
}

export function normalizeIntakeUrl(value: string): { url: string; hostname: string; kind: "url" | "facebook" | "youtube" } | null {
  const youtube = canonicalizeYoutubeVideoUrl(value);
  if (youtube) return { url: youtube.canonicalUrl, hostname: "www.youtube.com", kind: "youtube" };
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !url.hostname) return null;
    url.hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
    if (url.hostname.length > 189) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase() === "fbclid" || key.toLowerCase() === "rdid" || key.toLowerCase().startsWith("utm_") || key.startsWith("__")) url.searchParams.delete(key);
      if (/token|secret|code|key|signature|password/i.test(key)) return null;
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    const hostname = url.hostname;
    const isYoutubeHost = hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be";
    const kind = hostname === "facebook.com" || hostname.endsWith(".facebook.com") || hostname === "fb.com" || hostname === "fb.watch"
      ? "facebook"
      : isYoutubeHost
        ? "youtube"
        : "url";
    if (kind === "youtube") return null;
    return { url: url.toString(), hostname, kind };
  } catch {
    return null;
  }
}
