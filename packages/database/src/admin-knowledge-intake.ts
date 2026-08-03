import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AdminKnowledgeIntake, AdminKnowledgeSeedBatchRequest, AdminKnowledgeSeedBatchResponse, AdminKnowledgeSourceRemovalRequest, AdminKnowledgeSourceRemovalResponse, AdminKnowledgeSeedStatus, RequestPrincipal } from "@xuyenviet/contracts";
import type { AdminKnowledgeIntakePort } from "@xuyenviet/domain";

import { recordAuditEvent } from "./audit-writers";
import { createUserAuditActor } from "./actors";
import { lockAssistantProvenanceWithdrawalAnchors, requireCompletedAssistantProvenanceWithdrawalBackfill, withdrawAssistantProvenance } from "./assistant-provenance-withdrawal";
import { getDb } from "./client";
import { disableStaleKnowledgeSearchProjection, enqueueKnowledgeIndexWork } from "./knowledge-indexing-queue";
import { evaluateKnowledgeTravelerPolicy } from "./knowledge-state";
import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, knowledgeIngestionJobs, knowledgeRecommendations, knowledgeSeedBatchItems, knowledgeSeedBatches, knowledgeSourceSuggestions, rawSourceMaterial, sourceCaptureVersions, sources, users } from "./schema";

const statuses = ["pending", "reading", "extracted", "needs_review", "approved", "failed", "duplicate", "rejected"] as const;

export function createPostgresAdminKnowledgeIntakePort(): AdminKnowledgeIntakePort {
  return {
    async list() {
      const db = getDb();
      const sourceRows = await db.select({ id: sources.id, url: sources.url, canonicalUrl: sources.canonicalUrl, label: sources.label, kind: sources.kind, eligibility: sources.eligibility, removalReason: sources.removalReason, createdAt: sources.createdAt }).from(sources).where(inArray(sources.kind, ["url", "facebook", "youtube"])).orderBy(desc(sources.createdAt), desc(sources.id)).limit(100);
      const batches = await db.select({ id: knowledgeSeedBatches.id, label: knowledgeSeedBatches.label, createdAt: knowledgeSeedBatches.createdAt }).from(knowledgeSeedBatches).orderBy(desc(knowledgeSeedBatches.createdAt), desc(knowledgeSeedBatches.id)).limit(5);
      const items = batches.length ? await db.select({ id: knowledgeSeedBatchItems.id, batchId: knowledgeSeedBatchItems.batchId, lineNumber: knowledgeSeedBatchItems.lineNumber, submittedUrl: knowledgeSeedBatchItems.submittedUrl, canonicalUrl: knowledgeSeedBatchItems.canonicalUrl, sourceId: knowledgeSeedBatchItems.sourceId, status: knowledgeSeedBatchItems.status, errorSummary: knowledgeSeedBatchItems.errorSummary }).from(knowledgeSeedBatchItems).where(inArray(knowledgeSeedBatchItems.batchId, batches.map((batch) => batch.id))).orderBy(knowledgeSeedBatchItems.batchId, knowledgeSeedBatchItems.lineNumber) : [];
      const derivedStatuses = await deriveStatusesForSourceItems(items);
      for (const item of items) {
        const status = item.sourceId ? derivedStatuses.get(item.sourceId) ?? item.status : item.status;
        if (status !== item.status) {
          await db.update(knowledgeSeedBatchItems).set({ status, updatedAt: new Date() }).where(and(eq(knowledgeSeedBatchItems.id, item.id), eq(knowledgeSeedBatchItems.status, item.status)));
          item.status = status;
        }
      }
      return {
        sources: sourceRows.map((source) => ({ id: source.id, displayUrl: safeUrl(source.eligibility === "eligible" ? source.canonicalUrl ?? source.url : null), displayTitle: source.label, kind: source.kind as "url" | "facebook" | "youtube", eligibility: source.eligibility, removalReason: source.removalReason, createdAt: source.createdAt.toISOString() })),
        recentBatches: batches.map((batch) => { const batchItems = items.filter((item) => item.batchId === batch.id); return { id: batch.id, label: batch.label, createdAt: batch.createdAt.toISOString(), counts: countStatuses(batchItems.map((item) => item.status as AdminKnowledgeSeedStatus)), items: batchItems.map((item) => ({ lineNumber: item.lineNumber, status: item.status as AdminKnowledgeSeedStatus, displayUrl: safeUrl(item.canonicalUrl ?? item.submittedUrl), errorSummary: item.errorSummary })) }; }),
      } satisfies AdminKnowledgeIntake;
    },
    async submitBatch(actor, input) { return submit(actor, input); },
    async removeSource(actor, sourceId, input) { return remove(actor, sourceId, input); },
  };
}

async function deriveStatusesForSourceItems(items: Array<{ sourceId: string | null }>) {
  const db = getDb();
  const sourceIds = Array.from(new Set(items.map((item) => item.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId))));
  const derived = new Map<string, AdminKnowledgeSeedStatus>();
  if (sourceIds.length === 0) return derived;

  const cardRows = await db.select({ sourceId: knowledgeCardSources.sourceId, publicationState: knowledgeCards.publicationState, knowledgeState: knowledgeCards.knowledgeState, reviewState: knowledgeCards.reviewState, verificationState: knowledgeCards.verificationState, title: knowledgeCards.title, summary: knowledgeCards.summary, conditions: knowledgeCards.conditions, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment, activeTravelerSafeEvidenceCount: sql<number>`(select count(*)::int from ${knowledgeCardEvidence} evidence join ${knowledgeCardSources} link on link.knowledge_card_id = evidence.knowledge_card_id and link.source_id = evidence.source_id join ${sources} evidence_source on evidence_source.id = evidence.source_id and evidence_source.eligibility = 'eligible' join ${sourceCaptureVersions} capture on capture.id = evidence.capture_version_id and capture.source_id = evidence.source_id where evidence.knowledge_card_id = ${knowledgeCards.id} and evidence.state = 'active' and evidence.support_level in ('primary', 'supporting') and evidence.display_policy in ('fact_only', 'traveler_visible') and evidence_source.kind = capture.capture_kind and evidence_source.kind in ('url', 'facebook', 'youtube') and capture.payload_deleted_at is null and substring(capture.raw_text from evidence.span_start + 1 for evidence.span_end - evidence.span_start) = evidence.quote_text)`, activeTravelerSafeIndependenceKeyCount: sql<number>`(select count(distinct evidence.independence_key)::int from ${knowledgeCardEvidence} evidence join ${knowledgeCardSources} link on link.knowledge_card_id = evidence.knowledge_card_id and link.source_id = evidence.source_id join ${sources} evidence_source on evidence_source.id = evidence.source_id and evidence_source.eligibility = 'eligible' join ${sourceCaptureVersions} capture on capture.id = evidence.capture_version_id and capture.source_id = evidence.source_id where evidence.knowledge_card_id = ${knowledgeCards.id} and evidence.state = 'active' and evidence.support_level in ('primary', 'supporting') and evidence.display_policy in ('fact_only', 'traveler_visible') and evidence_source.kind = capture.capture_kind and evidence_source.kind in ('url', 'facebook', 'youtube') and capture.payload_deleted_at is null and substring(capture.raw_text from evidence.span_start + 1 for evidence.span_end - evidence.span_start) = evidence.quote_text)` }).from(knowledgeCardSources).innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId)).where(inArray(knowledgeCardSources.sourceId, sourceIds));
  for (const row of cardRows) derived.set(row.sourceId, pickHigherStatus(derived.get(row.sourceId), evaluateKnowledgeTravelerPolicy(row).policy === "exclude" ? "needs_review" : "approved"));

  const capturedYoutubeRows = await db.select({ sourceId: sources.id }).from(sources).innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, sources.currentCaptureVersionId)).where(and(inArray(sources.id, sourceIds), eq(sources.kind, "youtube"), sql`length(btrim(${sourceCaptureVersions.rawText})) > 0`));
  for (const row of capturedYoutubeRows) derived.set(row.sourceId, pickHigherStatus(derived.get(row.sourceId), "reading"));

  const suggestionRows = await db.select({ sourceId: knowledgeSourceSuggestions.sourceId, action: knowledgeSourceSuggestions.action }).from(knowledgeSourceSuggestions).where(and(inArray(knowledgeSourceSuggestions.sourceId, sourceIds), or(eq(knowledgeSourceSuggestions.action, "duplicate"), eq(knowledgeSourceSuggestions.action, "no_action"))));
  for (const row of suggestionRows) derived.set(row.sourceId, pickHigherStatus(derived.get(row.sourceId), row.action === "duplicate" ? "duplicate" : "rejected"));
  return derived;
}

function pickHigherStatus(current: AdminKnowledgeSeedStatus | undefined, next: AdminKnowledgeSeedStatus) {
  if (!current) return next;
  const rank: Record<AdminKnowledgeSeedStatus, number> = { pending: 0, reading: 0, extracted: 1, needs_review: 2, duplicate: 3, rejected: 4, failed: 5, approved: 6 };
  return rank[next] > rank[current] ? next : current;
}

async function submit(actor: RequestPrincipal, input: AdminKnowledgeSeedBatchRequest): Promise<AdminKnowledgeSeedBatchResponse> {
  const db = getDb(); const email = await actorEmail(actor.userId);
  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(knowledgeSeedBatches).values({ label: input.label ?? null, submittedByUserId: actor.userId }).returning({ id: knowledgeSeedBatches.id });
    const seen = new Set<string>(); let pendingCount = 0; let failedCount = 0; let duplicateCount = 0;
    for (const [index, submittedUrl] of input.urls.entries()) {
      const lineNumber = index + 1;
      try {
        const normalized = normalizeUrl(submittedUrl);
        if (seen.has(normalized)) { duplicateCount++; await failedItem(tx, batch!.id, lineNumber, submittedUrl, normalized, "duplicate", "URL trùng trong cùng batch; chỉ dòng đầu tiên được nạp."); continue; }
        seen.add(normalized);
        const url = new URL(normalized); const kind = isFacebook(url) ? "facebook" : isYoutube(url) ? "youtube" : "url";
        const [source] = await tx.insert(sources).values({ kind, url: normalized, canonicalUrl: null, label: url.hostname, publisher: input.publisher?.trim() || null, collectedDate: input.collectedDate ?? null, sourceType: kind === "url" ? "curated" : "community", verificationStatus: "unverified", official: false, partner: false, submittedByUserId: actor.userId }).returning({ id: sources.id });
        await tx.insert(rawSourceMaterial).values({ sourceId: source!.id, rawMetadata: { seedBatchId: batch!.id, seedBatchLineNumber: lineNumber } });
        await tx.insert(knowledgeSeedBatchItems).values({ batchId: batch!.id, lineNumber, submittedUrl, canonicalUrl: normalized, sourceId: source!.id, status: "pending" }); pendingCount++;
      } catch { failedCount++; await failedItem(tx, batch!.id, lineNumber, submittedUrl, null, "failed", "URL nguồn không hợp lệ."); }
    }
    await recordAuditEvent({ actor: createUserAuditActor({ userId: actor.userId, email }), operation: "create", targetType: "knowledge_seed_batch", targetId: batch!.id, afterSummary: `Operator submitted seed URL batch: total=${input.urls.length}; pending=${pendingCount}; failed=${failedCount}; duplicate=${duplicateCount}.` }, tx);
    return { batchId: batch!.id, totalItems: input.urls.length, pendingCount, failedCount, duplicateCount };
  });
}

async function remove(actor: RequestPrincipal, sourceId: string, input: AdminKnowledgeSourceRemovalRequest): Promise<AdminKnowledgeSourceRemovalResponse> {
  const db = getDb(); const email = await actorEmail(actor.userId);
  return db.transaction(async (tx) => {
    await requireCompletedAssistantProvenanceWithdrawalBackfill(tx); await lockAssistantProvenanceWithdrawalAnchors(tx, { sourceIds: [sourceId] });
    const [source] = await tx.select({ id: sources.id, eligibility: sources.eligibility }).from(sources).where(eq(sources.id, sourceId)).limit(1).for("update"); if (!source) throw new Error("source missing");
    const evidence = await tx.select({ id: knowledgeCardEvidence.id, cardId: knowledgeCardEvidence.knowledgeCardId }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.sourceId, sourceId)).orderBy(knowledgeCardEvidence.knowledgeCardId);
    const links = await tx.select({ cardId: knowledgeCardSources.knowledgeCardId }).from(knowledgeCardSources).where(eq(knowledgeCardSources.sourceId, sourceId)); const cardIds = [...new Set([...evidence.map((row) => row.cardId), ...links.map((row) => row.cardId)])].sort();
    await lockAssistantProvenanceWithdrawalAnchors(tx, { evidenceIds: evidence.map((row) => row.id), cardIds });
    for (const cardId of cardIds) await tx.select({ id: knowledgeCards.id }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1).for("update");
    for (const cardId of cardIds) await tx.select({ id: knowledgeRecommendations.id }).from(knowledgeRecommendations).where(and(eq(knowledgeRecommendations.knowledgeCardId, cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"]))).orderBy(knowledgeRecommendations.id).for("update");
    const lockedEvidence = await tx.select({ id: knowledgeCardEvidence.id, state: knowledgeCardEvidence.state }).from(knowledgeCardEvidence).where(eq(knowledgeCardEvidence.sourceId, sourceId)).for("update");
    const now = new Date(); const remediation = await withdrawAssistantProvenance(tx, { sourceIds: [sourceId], evidenceIds: lockedEvidence.map((row) => row.id), cardIds }, input.reason, now);
    if (source.eligibility === "withdrawn") return { status: "already_completed", sourceId, changedCardCount: cardIds.length };
    await tx.update(sources).set({ eligibility: "withdrawn", removalReason: input.reason, removedByUserId: actor.userId, removalCompletedAt: now, currentCaptureVersionId: null }).where(eq(sources.id, sourceId));
    const active = lockedEvidence.filter((row) => row.state === "active").map((row) => row.id); if (active.length) await tx.update(knowledgeCardEvidence).set({ state: "removed", withdrawalReason: input.reason }).where(inArray(knowledgeCardEvidence.id, active));
    for (const cardId of cardIds) {
      const [card] = await tx.select({ publicationState: knowledgeCards.publicationState, knowledgeState: knowledgeCards.knowledgeState, verificationState: knowledgeCards.verificationState }).from(knowledgeCards).where(eq(knowledgeCards.id, cardId)).limit(1); if (!card) continue;
      const remaining = await tx.select({ independenceKey: knowledgeCardEvidence.independenceKey }).from(knowledgeCardEvidence).innerJoin(sources, and(eq(sources.id, knowledgeCardEvidence.sourceId), eq(sources.eligibility, "eligible"))).innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId))).where(and(eq(knowledgeCardEvidence.knowledgeCardId, cardId), eq(knowledgeCardEvidence.state, "active"), or(eq(knowledgeCardEvidence.supportLevel, "primary"), eq(knowledgeCardEvidence.supportLevel, "supporting")), isNull(sourceCaptureVersions.payloadDeletedAt), sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`));
      const supportCount = new Set(remaining.map((row) => row.independenceKey)).size; const ineligible = supportCount === 0 || card.knowledgeState === "conflicted" || card.knowledgeState === "superseded" || card.verificationState === "failed"; const downgrade = card.knowledgeState === "community_pattern" && supportCount < 2;
      const [updated] = await tx.update(knowledgeCards).set({ evidenceSetRevision: sql`${knowledgeCards.evidenceSetRevision} + 1`, contentVersion: sql`${knowledgeCards.contentVersion} + 1`, updatedAt: now, ...(ineligible && card.publicationState === "active" ? { publicationState: "suppressed" as const } : {}), ...(downgrade ? { knowledgeState: "community_observation" as const } : {}) }).where(eq(knowledgeCards.id, cardId)).returning({ contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });
      if (updated) { await tx.update(knowledgeRecommendations).set({ status: "superseded", resolution: "accepted", resolvedByUserId: actor.userId, resolvedAt: now, executorSystem: null, updatedAt: now }).where(and(eq(knowledgeRecommendations.knowledgeCardId, cardId), inArray(knowledgeRecommendations.status, ["open", "in_review"]))); await enqueueKnowledgeIndexWork(tx, { cardId, contentVersion: updated.contentVersion, evidenceSetRevision: updated.evidenceSetRevision, reason: "source_removal" }); await disableStaleKnowledgeSearchProjection(tx, cardId, updated.contentVersion, now); }
    }
    await tx.update(sourceCaptureVersions).set({ rawText: null, fileName: null, mimeType: null, byteSize: null, storageKey: null, rawMetadata: null, payloadDeletedAt: now }).where(and(eq(sourceCaptureVersions.sourceId, sourceId), isNull(sourceCaptureVersions.payloadDeletedAt))); await tx.update(knowledgeIngestionJobs).set({ rawDiscoveryResponse: null, updatedAt: now }).where(eq(knowledgeIngestionJobs.sourceId, sourceId)); await tx.update(rawSourceMaterial).set({ rawText: null, fileName: null, mimeType: null, byteSize: null, storageKey: null, rawMetadata: null }).where(eq(rawSourceMaterial.sourceId, sourceId)); await tx.delete(knowledgeSourceSuggestions).where(eq(knowledgeSourceSuggestions.sourceId, sourceId));
    await recordAuditEvent({ actor: createUserAuditActor({ userId: actor.userId, email }), operation: "archive", targetType: "knowledge_source_removal", targetId: sourceId, afterSummary: `Source removal completed; reason=${input.reason}; affectedCardCount=${cardIds.length}; provenanceCount=${remediation.provenanceCount}.` }, tx);
    return { status: "completed", sourceId, changedCardCount: cardIds.length };
  });
}

async function actorEmail(userId: string) { const [user] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1); if (!user?.email) throw new Error("audit actor unavailable"); return user.email; }
async function failedItem(db: Pick<ReturnType<typeof getDb>, "insert">, batchId: string, lineNumber: number, submittedUrl: string, canonicalUrl: string | null, status: "failed" | "duplicate", errorSummary: string) { await db.insert(knowledgeSeedBatchItems).values({ batchId, lineNumber, submittedUrl: submittedUrl.slice(0, 2048), canonicalUrl, status, errorSummary }); }
function countStatuses(items: AdminKnowledgeSeedStatus[]) { return Object.fromEntries(statuses.map((status) => [status, items.filter((item) => item === status).length])) as Record<AdminKnowledgeSeedStatus, number>; }
function normalizeUrl(value: string) { const url = new URL(value); if (!["http:", "https:"].includes(url.protocol)) throw new Error("protocol"); url.hash = ""; for (const key of Array.from(url.searchParams.keys())) if (key.toLowerCase() === "fbclid" || key.toLowerCase() === "gclid" || key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key); url.searchParams.sort(); if (isYoutube(url)) { const id = url.hostname.replace(/^www\./, "") === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v"); if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`; } return url.toString(); }
function safeUrl(value: string | null) { if (!value) return null; try { const url = new URL(value); for (const key of Array.from(url.searchParams.keys())) if (/token|secret|code|key|signature|password/i.test(key)) url.searchParams.set(key, "[redacted]"); return url.toString(); } catch { return null; } }
function isFacebook(url: URL) { const host = url.hostname.toLowerCase().replace(/^www\./, ""); return host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host === "fb.watch"; }
function isYoutube(url: URL) { const host = url.hostname.toLowerCase().replace(/^www\./, ""); return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be"; }
