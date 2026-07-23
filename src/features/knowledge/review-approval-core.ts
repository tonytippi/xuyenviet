import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db/client";
import { auditEvents, knowledgeCards, knowledgeCardSources, knowledgeSourceSuggestions, sourceCaptureVersions, sources } from "@/db/schema";
import { enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";
import type { AuthenticatedSession } from "@/server/auth";

type ReviewDb = ReturnType<typeof getDb>;
type ReviewMutationDb = Pick<ReviewDb, "select" | "update" | "insert" | "execute">;

const emailLikePattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneLikePattern = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/;
const sensitiveTokenPattern = /(provider[_-]?payload|storage[_-]?key|raw[_-]?metadata|raw[_-]?source)/i;
const targetKnowledgeCards = alias(knowledgeCards, "target_card_core");

export class KnowledgeDraftApprovalCoreError extends Error {
  constructor(message: string, public readonly code: "invalid_draft" | "not_reviewable" | "invalid_input") {
    super(message);
    this.name = "KnowledgeDraftApprovalCoreError";
  }
}

export async function approveKnowledgeDraftBatchForActorInTransaction(transaction: ReviewMutationDb, actor: AuthenticatedSession, draftIds: string[]): Promise<{ draftIds: string[] }> {
  if (draftIds.length === 0) {
    throw new KnowledgeDraftApprovalCoreError("Không có bản nháp nào để phê duyệt.", "invalid_draft");
  }

  const approvedDraftIds: string[] = [];

  for (const draftId of draftIds) {
    const result = await approveKnowledgeDraftForActorInTransaction(transaction, actor, draftId);
    approvedDraftIds.push(result.draftId);
  }

  return { draftIds: approvedDraftIds };
}

async function approveKnowledgeDraftForActorInTransaction(transaction: ReviewMutationDb, actor: AuthenticatedSession, draftId: string) {
  const draft = await loadReviewableDraft(transaction, draftId);
  await transaction.select({ id: knowledgeCards.id }).from(knowledgeCards).where(eq(knowledgeCards.id, draftId)).limit(1).for("update");
  for (const source of draft.sources.sort((left, right) => left.id.localeCompare(right.id))) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${source.id}, 44))`);
  }
  await assertEligibleDraftSources(transaction, draft.sources.map((source) => source.id));
  assertApprovalReady(draft.card);
  const rawLeakCorpus = await loadRawLeakCorpusForSources(transaction, draft.sources.map((source) => source.id));
  rejectUnsafeCardFields({ title: draft.card.title, locationName: draft.card.locationName, routeSegment: draft.card.routeSegment, summary: draft.card.summary, tags: draft.card.tags, practicalDetails: draft.card.practicalDetails }, rawLeakCorpus);

  const [updatedDraft] = await transaction
    .update(knowledgeCards)
    .set({
      status: "approved",
      publicationState: "active",
      knowledgeState: "uncertain",
      reviewState: "reviewed",
      verificationState: "not_required",
      needsReview: false,
      contentVersion: sql`${knowledgeCards.contentVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(knowledgeCards.id, draftId), eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true)))
    .returning({ id: knowledgeCards.id, contentVersion: knowledgeCards.contentVersion, evidenceSetRevision: knowledgeCards.evidenceSetRevision });

  if (!updatedDraft) {
    throw new KnowledgeDraftApprovalCoreError("Bản nháp này không còn trong trạng thái cần duyệt.", "not_reviewable");
  }
  await enqueueKnowledgeIndexWork(transaction, { cardId: draftId, contentVersion: updatedDraft.contentVersion, evidenceSetRevision: updatedDraft.evidenceSetRevision, reason: "draft_approval" });

  await transaction.insert(auditEvents).values({
    actorUserId: actor.userId,
    actorEmail: actor.email,
    operation: "approve",
    targetType: "knowledge_draft",
    targetId: draftId,
    beforeSummary: `Draft before mutation: status=${draft.card.status}; type=${draft.card.type}; confidence=${draft.card.confidence}; needsReview=${draft.card.needsReview}; freshnessSensitive=${draft.card.freshnessSensitive}.`,
    afterSummary: `Operator approved legacy draft state: status=approved; publicationState=active; knowledgeState=uncertain; retrieval remains blocked until bounded evidence exists; linkedSources=${draft.sources.length}.`,
  });

  return { draftId };
}

async function assertEligibleDraftSources(db: Pick<ReviewDb, "select">, sourceIds: string[]) {
  const [eligible] = await db.select({ id: sources.id }).from(sources).innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.sourceId, sources.id), isNull(sourceCaptureVersions.payloadDeletedAt))).where(and(inArray(sources.id, sourceIds), eq(sources.eligibility, "eligible"))).limit(1);
  if (!eligible) throw new KnowledgeDraftApprovalCoreError("Bản nháp không còn nguồn đủ điều kiện để phê duyệt.", "not_reviewable");
}

async function loadReviewableDraft(db: Pick<ReviewDb, "select">, draftId: string) {
  const draft = await getKnowledgeDraftForReviewFromDb(db, draftId);

  if (!draft) {
    throw new KnowledgeDraftApprovalCoreError("Không tìm thấy bản nháp cần duyệt.", "invalid_draft");
  }

  if (draft.card.status !== "draft" || !draft.card.needsReview) {
    throw new KnowledgeDraftApprovalCoreError("Bản nháp này không còn trong trạng thái cần duyệt.", "not_reviewable");
  }

  if (draft.sources.length === 0) {
    throw new KnowledgeDraftApprovalCoreError("Bản nháp cần ít nhất một nguồn liên kết trước khi lưu.", "invalid_draft");
  }

  return draft;
}

async function getKnowledgeDraftForReviewFromDb(db: Pick<ReviewDb, "select">, draftId: string) {
  const rows = await db
    .select({
      card: knowledgeCards,
      source: { id: sources.id },
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId))
    .leftJoin(knowledgeSourceSuggestions, eq(knowledgeSourceSuggestions.suggestedCardId, knowledgeCards.id))
    .leftJoin(targetKnowledgeCards, eq(targetKnowledgeCards.id, knowledgeSourceSuggestions.targetCardId))
    .where(eq(knowledgeCards.id, draftId));

  const card = rows[0]?.card;
  if (!card) return null;

  return {
    card,
    sources: rows.map((row) => row.source).filter((source): source is { id: string } => Boolean(source?.id)),
  };
}

async function loadRawLeakCorpusForSources(db: Pick<ReviewDb, "select">, sourceIds: string[]) {
  if (sourceIds.length === 0) {
    return [];
  }

  const rows = await db
     .select({ rawText: sourceCaptureVersions.rawText, fileName: sourceCaptureVersions.fileName, storageKey: sourceCaptureVersions.storageKey, rawMetadata: sourceCaptureVersions.rawMetadata })
      .from(sourceCaptureVersions)
      .where(and(inArray(sourceCaptureVersions.sourceId, sourceIds), isNull(sourceCaptureVersions.payloadDeletedAt)));

  return rows.flatMap((row) => [row.rawText, row.fileName, row.storageKey, ...flattenMetadataStrings(row.rawMetadata)]).filter((value): value is string => Boolean(value));
}

function assertApprovalReady(card: typeof knowledgeCards.$inferSelect) {
  if (!card.title.trim() || !card.summary.trim() || (!card.locationName?.trim() && !card.routeSegment?.trim())) {
    throw new KnowledgeDraftApprovalCoreError("Bản nháp cần đủ tiêu đề, tóm tắt và địa điểm hoặc cung đường trước khi phê duyệt.", "invalid_draft");
  }
}

function rejectUnsafeCardFields(input: { title: string; locationName: string | null; routeSegment: string | null; summary: string; tags: string[]; practicalDetails: Record<string, unknown> }, rawTexts: string[]) {
  rejectUnsafeSafeFields([input.title, input.locationName, input.routeSegment, input.summary, ...input.tags, ...Object.keys(input.practicalDetails)].filter((value): value is string => typeof value === "string"), rawTexts, { allowContactValues: false });

  for (const detail of flattenDetailEntries(input.practicalDetails)) {
    rejectUnsafeSafeFields([detail.value], rawTexts, { allowContactValues: isPublicContactDetailKey(detail.key) });
  }
}

function rejectUnsafeSafeFields(values: string[], rawTexts: string[], options: { allowContactValues: boolean }) {
  const normalizedRawValues = rawTexts.map(normalizeForOverlap).filter(Boolean);
  const rawCorpus = normalizedRawValues.join(" ");

  for (const value of values) {
    if ((!options.allowContactValues && (emailLikePattern.test(value) || phoneLikePattern.test(value))) || sensitiveTokenPattern.test(value)) {
      throw new KnowledgeDraftApprovalCoreError("Trường an toàn không được chứa số liên hệ, email hoặc metadata thô.", "invalid_input");
    }

    const normalized = normalizeForOverlap(value);

    if (normalizedRawValues.includes(normalized) || (normalized.length >= 24 && rawCorpus.includes(normalized))) {
      throw new KnowledgeDraftApprovalCoreError("Trường an toàn không được sao chép nguyên văn nội dung nguồn thô.", "invalid_input");
    }
  }
}

function flattenDetailEntries(details: Record<string, unknown>) {
  return Object.entries(details).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string").map((item) => ({ key, value: item })));
}

function isPublicContactDetailKey(key: string) {
  return /contact|phone|tel|hotline|email|booking|reservation|zalo/i.test(key);
}

function flattenMetadataStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenMetadataStrings);
  if (typeof value === "object" && value !== null) return Object.entries(value).flatMap(([key, metadataValue]) => [key, ...flattenMetadataStrings(metadataValue)]);
  return [];
}

function normalizeForOverlap(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
