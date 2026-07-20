import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db/client";
import {
  knowledgeCards,
  knowledgeCardSearchDocuments,
  knowledgeCardSources,
  knowledgeSourceSuggestions,
  knowledgeCardTypeValues,
  knowledgeConfidenceValues,
  rawSourceMaterial,
  sources,
  type KnowledgeConfidence,
  type KnowledgeSourceSupport,
} from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { requireAdminSession, type AuthenticatedSessionWithRoles } from "@/server/auth";

const maxTitleLength = 160;
const maxLocationLength = 160;
const maxRouteSegmentLength = 160;
const maxSummaryLength = 1200;
const maxDetailKeyLength = 60;
const maxDetailStringLength = 500;
const maxDetailEntries = 20;
const maxDetailArrayItems = 10;
const maxOrderedStops = 40;
const maxPracticalDetailsJsonLength = 10_000;
const maxTags = 12;
const maxTagLength = 40;
const emailLikePattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneLikePattern = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/;
const sensitiveTokenPattern = /(provider[_-]?payload|storage[_-]?key|raw[_-]?metadata|raw[_-]?source)/i;
const targetKnowledgeCards = alias(knowledgeCards, "target_card");

type ReviewDb = ReturnType<typeof getDb>;
type ReviewMutationDb = Pick<ReviewDb, "select" | "update" | "insert">;

export type KnowledgeDraftReviewSource = Pick<
  typeof sources.$inferSelect,
  "id" | "kind" | "url" | "canonicalUrl" | "label" | "publisher" | "collectedDate" | "sourceType" | "verificationStatus" | "official" | "partner"
> & {
  supportLevel: KnowledgeSourceSupport;
};

export type KnowledgeDraftReviewCard = Pick<
  typeof knowledgeCards.$inferSelect,
  | "id"
  | "status"
  | "type"
  | "title"
  | "locationName"
  | "routeSegment"
  | "summary"
  | "practicalDetails"
  | "tags"
  | "confidence"
  | "freshnessSensitive"
  | "needsReview"
  | "updatedAt"
  | "createdAt"
> & {
  sources: KnowledgeDraftReviewSource[];
  suggestion: KnowledgeDraftReviewSuggestion | null;
};

export type ApprovedKnowledgeCard = Pick<
  typeof knowledgeCards.$inferSelect,
  | "id"
  | "status"
  | "type"
  | "title"
  | "locationName"
  | "routeSegment"
  | "summary"
  | "practicalDetails"
  | "tags"
  | "confidence"
  | "freshnessSensitive"
  | "needsReview"
  | "updatedAt"
  | "createdAt"
> & {
  sources: KnowledgeDraftReviewSource[];
};

export type ApprovedKnowledgeIndexStatus = {
  state: "indexed" | "needs_indexing" | "stale_index" | "inactive_index";
  label: string;
  documentStatus: string | null;
  indexedAt: Date | null;
};

export type ApprovedKnowledgeCardWithIndexStatus = ApprovedKnowledgeCard & {
  indexStatus: ApprovedKnowledgeIndexStatus;
};

export type KnowledgeDraftReviewSuggestion = Pick<
  typeof knowledgeSourceSuggestions.$inferSelect,
  "id" | "action" | "targetCardId" | "beforeSummary" | "afterSummary" | "conflictSummary" | "rationale" | "createdAt"
> & {
  targetCard: Pick<typeof knowledgeCards.$inferSelect, "id" | "status" | "type" | "title" | "locationName" | "routeSegment" | "summary" | "confidence" | "freshnessSensitive"> | null;
};

export type KnowledgeDraftUpdateInput = {
  type: string;
  title: string;
  locationName?: string | null;
  routeSegment?: string | null;
  summary: string;
  practicalDetails?: unknown;
  tags?: unknown;
  confidence: string;
  freshnessSensitive?: boolean | string | null;
};

export type KnowledgeDraftReviewResult = {
  draftId: string;
};

export class KnowledgeDraftReviewError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_draft" | "invalid_input" | "not_reviewable",
  ) {
    super(message);
    this.name = "KnowledgeDraftReviewError";
  }
}

export function isKnowledgeDraftReviewError(error: unknown) {
  return error instanceof KnowledgeDraftReviewError || (error instanceof Error && error.name === "KnowledgeDraftReviewError");
}

export async function listKnowledgeDraftsForReview(): Promise<KnowledgeDraftReviewCard[]> {
  await requireAdminSession();

  const rows = await getDb()
    .select({
      card: knowledgeCards,
      source: {
        id: sources.id,
        kind: sources.kind,
        url: sources.url,
        canonicalUrl: sources.canonicalUrl,
        label: sources.label,
        publisher: sources.publisher,
        collectedDate: sources.collectedDate,
        sourceType: sources.sourceType,
        verificationStatus: sources.verificationStatus,
        official: sources.official,
        partner: sources.partner,
        supportLevel: knowledgeCardSources.supportLevel,
      },
      suggestion: knowledgeSourceSuggestions,
      targetCard: targetKnowledgeCards,
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId))
    .leftJoin(knowledgeSourceSuggestions, eq(knowledgeSourceSuggestions.suggestedCardId, knowledgeCards.id))
    .leftJoin(targetKnowledgeCards, eq(targetKnowledgeCards.id, knowledgeSourceSuggestions.targetCardId))
    .where(and(eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true)))
    .orderBy(desc(knowledgeCards.createdAt));

  return groupDraftRows(rows).filter((draft) => draft.sources.length > 0);
}

export async function getKnowledgeDraftForReview(draftId: string): Promise<KnowledgeDraftReviewCard | null> {
  await requireAdminSession();
  const normalizedDraftId = draftId.trim();

  if (!normalizedDraftId) {
    throw new KnowledgeDraftReviewError("Không tìm thấy bản nháp cần duyệt.", "invalid_draft");
  }

  const rows = await getDb()
    .select({
      card: knowledgeCards,
      source: {
        id: sources.id,
        kind: sources.kind,
        url: sources.url,
        canonicalUrl: sources.canonicalUrl,
        label: sources.label,
        publisher: sources.publisher,
        collectedDate: sources.collectedDate,
        sourceType: sources.sourceType,
        verificationStatus: sources.verificationStatus,
        official: sources.official,
        partner: sources.partner,
        supportLevel: knowledgeCardSources.supportLevel,
      },
      suggestion: knowledgeSourceSuggestions,
      targetCard: targetKnowledgeCards,
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId))
    .leftJoin(knowledgeSourceSuggestions, eq(knowledgeSourceSuggestions.suggestedCardId, knowledgeCards.id))
    .leftJoin(targetKnowledgeCards, eq(targetKnowledgeCards.id, knowledgeSourceSuggestions.targetCardId))
    .where(and(eq(knowledgeCards.id, normalizedDraftId), eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true)));

  const draft = groupDraftRows(rows)[0];
  return draft && draft.sources.length > 0 ? draft : null;
}

export async function listApprovedKnowledgeCards(): Promise<ApprovedKnowledgeCard[]> {
  await requireAdminSession();

  const rows = await getDb()
    .select({
      card: {
        id: knowledgeCards.id,
        status: knowledgeCards.status,
        type: knowledgeCards.type,
        title: knowledgeCards.title,
        locationName: knowledgeCards.locationName,
        routeSegment: knowledgeCards.routeSegment,
        summary: knowledgeCards.summary,
        practicalDetails: knowledgeCards.practicalDetails,
        tags: knowledgeCards.tags,
        confidence: knowledgeCards.confidence,
        freshnessSensitive: knowledgeCards.freshnessSensitive,
        needsReview: knowledgeCards.needsReview,
        updatedAt: knowledgeCards.updatedAt,
        createdAt: knowledgeCards.createdAt,
      },
      source: {
        id: sources.id,
        kind: sources.kind,
        url: sources.url,
        canonicalUrl: sources.canonicalUrl,
        label: sources.label,
        publisher: sources.publisher,
        collectedDate: sources.collectedDate,
        sourceType: sources.sourceType,
        verificationStatus: sources.verificationStatus,
        official: sources.official,
        partner: sources.partner,
        supportLevel: knowledgeCardSources.supportLevel,
      },
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId))
    .where(and(eq(knowledgeCards.status, "approved"), eq(knowledgeCards.needsReview, false)))
    .orderBy(desc(knowledgeCards.updatedAt));

  return groupApprovedRows(rows).filter((card) => card.sources.length > 0);
}

export async function listApprovedKnowledgeCardsWithIndexStatus(): Promise<ApprovedKnowledgeCardWithIndexStatus[]> {
  const cards = await listApprovedKnowledgeCards();
  return attachIndexStatus(cards);
}

export async function getApprovedKnowledgeIndexStatuses(cardIds: string[]): Promise<Map<string, ApprovedKnowledgeIndexStatus>> {
  await requireAdminSession();
  return loadApprovedKnowledgeIndexStatuses(cardIds);
}

export async function getApprovedKnowledgeCard(cardId: string): Promise<ApprovedKnowledgeCard | null> {
  await requireAdminSession();
  const normalizedCardId = cardId.trim();

  if (!normalizedCardId) {
    throw new KnowledgeDraftReviewError("Không tìm thấy thẻ tri thức đã phê duyệt.", "invalid_draft");
  }

  const rows = await getDb()
    .select({
      card: {
        id: knowledgeCards.id,
        status: knowledgeCards.status,
        type: knowledgeCards.type,
        title: knowledgeCards.title,
        locationName: knowledgeCards.locationName,
        routeSegment: knowledgeCards.routeSegment,
        summary: knowledgeCards.summary,
        practicalDetails: knowledgeCards.practicalDetails,
        tags: knowledgeCards.tags,
        confidence: knowledgeCards.confidence,
        freshnessSensitive: knowledgeCards.freshnessSensitive,
        needsReview: knowledgeCards.needsReview,
        updatedAt: knowledgeCards.updatedAt,
        createdAt: knowledgeCards.createdAt,
      },
      source: {
        id: sources.id,
        kind: sources.kind,
        url: sources.url,
        canonicalUrl: sources.canonicalUrl,
        label: sources.label,
        publisher: sources.publisher,
        collectedDate: sources.collectedDate,
        sourceType: sources.sourceType,
        verificationStatus: sources.verificationStatus,
        official: sources.official,
        partner: sources.partner,
        supportLevel: knowledgeCardSources.supportLevel,
      },
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId))
    .where(and(eq(knowledgeCards.id, normalizedCardId), eq(knowledgeCards.status, "approved"), eq(knowledgeCards.needsReview, false)));

  const card = groupApprovedRows(rows)[0];
  return card && card.sources.length > 0 ? card : null;
}

export async function updateKnowledgeDraft(draftId: string, input: KnowledgeDraftUpdateInput): Promise<KnowledgeDraftReviewResult> {
  const session = await requireAdminSession();
  const normalizedDraftId = draftId.trim();

  if (!normalizedDraftId) {
    throw new KnowledgeDraftReviewError("Không tìm thấy bản nháp cần lưu.", "invalid_draft");
  }

  const db = getDb();
  return db.transaction(async (transaction) => {
    const draft = await loadReviewableDraft(transaction, normalizedDraftId);
    const rawLeakCorpus = await loadRawLeakCorpusForSources(transaction, draft.sources.map((source) => source.id));
    const values = normalizeDraftUpdateInput(input, draft.sources, rawLeakCorpus);

    const [updatedDraft] = await transaction
      .update(knowledgeCards)
      .set({
        type: values.type,
        title: values.title,
        locationName: values.locationName,
        routeSegment: values.routeSegment,
        summary: values.summary,
        practicalDetails: values.practicalDetails,
        tags: values.tags,
        confidence: values.confidence,
        freshnessSensitive: values.freshnessSensitive,
        status: "draft",
        needsReview: true,
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeCards.id, normalizedDraftId), eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true)))
      .returning({ id: knowledgeCards.id });

    if (!updatedDraft) {
      throw new KnowledgeDraftReviewError("Bản nháp này không còn trong trạng thái cần duyệt.", "not_reviewable");
    }

    await recordAuditEvent(
      {
        actor: session,
        operation: "update",
        targetType: "knowledge_draft",
        targetId: normalizedDraftId,
        beforeSummary: summarizeDraft(draft.card),
        afterSummary: `Operator edited review-needed draft fields: type=${values.type}; confidence=${values.confidence}; freshnessSensitive=${values.freshnessSensitive}; tags=${values.tags.length}.`,
      },
      transaction,
    );

    return { draftId: normalizedDraftId };
  });
}

export async function rejectKnowledgeDraft(draftId: string): Promise<KnowledgeDraftReviewResult> {
  const session = await requireAdminSession();
  const normalizedDraftId = draftId.trim();

  if (!normalizedDraftId) {
    throw new KnowledgeDraftReviewError("Không tìm thấy bản nháp cần từ chối.", "invalid_draft");
  }

  const db = getDb();
  return db.transaction(async (transaction) => {
    const draft = await loadReviewableDraft(transaction, normalizedDraftId);

    const [updatedDraft] = await transaction
      .update(knowledgeCards)
      .set({
        status: "rejected",
        needsReview: false,
        updatedAt: new Date(),
      })
      .where(and(eq(knowledgeCards.id, normalizedDraftId), eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true)))
      .returning({ id: knowledgeCards.id });

    if (!updatedDraft) {
      throw new KnowledgeDraftReviewError("Bản nháp này không còn trong trạng thái cần duyệt.", "not_reviewable");
    }

    await recordAuditEvent(
      {
        actor: session,
        operation: "update",
        targetType: "knowledge_draft",
        targetId: normalizedDraftId,
        beforeSummary: summarizeDraft(draft.card),
        afterSummary: "Operator rejected the draft knowledge card; source links remain preserved and no retrieval state was created.",
      },
      transaction,
    );

    return { draftId: normalizedDraftId };
  });
}

export async function approveKnowledgeDraft(draftId: string, expectedUpdatedAt?: string | null): Promise<KnowledgeDraftReviewResult> {
  const session = await requireAdminSession();
  const normalizedDraftId = draftId.trim();

  if (!normalizedDraftId) {
    throw new KnowledgeDraftReviewError("Không tìm thấy bản nháp cần phê duyệt.", "invalid_draft");
  }

  const db = getDb();
  return db.transaction(async (transaction) => {
    return approveKnowledgeDraftInTransaction(transaction, session, normalizedDraftId, expectedUpdatedAt);
  });
}

export async function approveKnowledgeDraftBatch(draftIds: string[]): Promise<{ draftIds: string[] }> {
  const session = await requireAdminSession();
  const normalizedDraftIds = draftIds.map((draftId) => draftId.trim()).filter(Boolean);

  if (normalizedDraftIds.length === 0) {
    throw new KnowledgeDraftReviewError("Không có bản nháp nào để phê duyệt.", "invalid_draft");
  }

  const db = getDb();
  return db.transaction(async (transaction) => {
    return approveKnowledgeDraftBatchInTransaction(transaction, session, normalizedDraftIds);
  });
}

export async function approveKnowledgeDraftBatchInTransaction(transaction: ReviewMutationDb, session: AuthenticatedSessionWithRoles, normalizedDraftIds: string[]): Promise<{ draftIds: string[] }> {
  if (normalizedDraftIds.length === 0) {
    throw new KnowledgeDraftReviewError("Không có bản nháp nào để phê duyệt.", "invalid_draft");
  }

  const approvedDraftIds: string[] = [];

  for (const draftId of normalizedDraftIds) {
    const result = await approveKnowledgeDraftInTransaction(transaction, session, draftId);
    approvedDraftIds.push(result.draftId);
  }

  return { draftIds: approvedDraftIds };
}

async function approveKnowledgeDraftInTransaction(
  transaction: ReviewMutationDb,
  session: AuthenticatedSessionWithRoles,
  normalizedDraftId: string,
  expectedUpdatedAt?: string | null,
): Promise<KnowledgeDraftReviewResult> {
  const draft = await loadReviewableDraft(transaction, normalizedDraftId);
  assertApprovalVersionCurrent(draft.card, expectedUpdatedAt);
  assertApprovalReady(draft.card);
  const rawLeakCorpus = await loadRawLeakCorpusForSources(transaction, draft.sources.map((source) => source.id));
  assertApprovalSafeFields(draft.card, rawLeakCorpus);

  const [updatedDraft] = await transaction
    .update(knowledgeCards)
    .set({
      status: "approved",
      needsReview: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeCards.id, normalizedDraftId),
        eq(knowledgeCards.status, "draft"),
        eq(knowledgeCards.needsReview, true),
        ...(expectedUpdatedAt ? [eq(knowledgeCards.updatedAt, new Date(expectedUpdatedAt))] : []),
      ),
    )
    .returning({ id: knowledgeCards.id });

  if (!updatedDraft) {
    throw new KnowledgeDraftReviewError("Bản nháp này không còn trong trạng thái cần duyệt.", "not_reviewable");
  }

  const approvedCard = await getKnowledgeDraftForReviewFromDb(transaction, normalizedDraftId);

  if (!approvedCard || approvedCard.sources.length === 0) {
    throw new KnowledgeDraftReviewError("Bản nháp cần ít nhất một nguồn liên kết trước khi phê duyệt.", "invalid_draft");
  }

  await recordAuditEvent(
    {
      actor: session,
      operation: "approve",
      targetType: "knowledge_draft",
      targetId: normalizedDraftId,
      beforeSummary: summarizeDraft(draft.card),
      afterSummary: `Operator approved draft for retrieval eligibility: status=approved; needsReview=false; linkedSources=${draft.sources.length}. Embeddings were not created.`,
    },
    transaction,
  );

  return { draftId: normalizedDraftId };
}

function assertApprovalVersionCurrent(card: Pick<KnowledgeDraftReviewCard, "updatedAt">, expectedUpdatedAt?: string | null) {
  if (!expectedUpdatedAt) {
    return;
  }

  if (card.updatedAt.toISOString() !== expectedUpdatedAt) {
    throw new KnowledgeDraftReviewError("Bản nháp đã thay đổi sau khi trang được mở. Vui lòng tải lại và kiểm tra lại trước khi phê duyệt.", "not_reviewable");
  }
}

function assertApprovalReady(card: KnowledgeDraftReviewCard) {
  if (!knowledgeCardTypeValues.includes(card.type) || !knowledgeConfidenceValues.includes(card.confidence)) {
    throw new KnowledgeDraftReviewError("Bản nháp có loại thẻ hoặc confidence không hợp lệ.", "invalid_draft");
  }

  if (!card.title.trim() || !card.summary.trim() || (!card.locationName?.trim() && !card.routeSegment?.trim())) {
    throw new KnowledgeDraftReviewError("Bản nháp cần đủ tiêu đề, tóm tắt và địa điểm hoặc cung đường trước khi phê duyệt.", "invalid_draft");
  }
}

function assertApprovalSafeFields(card: KnowledgeDraftReviewCard, rawTexts: string[]) {
  rejectUnsafeCardFields({ title: card.title, locationName: card.locationName, routeSegment: card.routeSegment, summary: card.summary, tags: card.tags, practicalDetails: card.practicalDetails }, rawTexts);
}

async function loadReviewableDraft(db: Pick<ReviewDb, "select">, draftId: string) {
  const draft = await getKnowledgeDraftForReviewFromDb(db, draftId);

  if (!draft) {
    throw new KnowledgeDraftReviewError("Không tìm thấy bản nháp cần duyệt.", "invalid_draft");
  }

  if (draft.card.status !== "draft" || !draft.card.needsReview) {
    throw new KnowledgeDraftReviewError("Bản nháp này không còn trong trạng thái cần duyệt.", "not_reviewable");
  }

  if (draft.sources.length === 0) {
    throw new KnowledgeDraftReviewError("Bản nháp cần ít nhất một nguồn liên kết trước khi lưu.", "invalid_draft");
  }

  return draft;
}

async function getKnowledgeDraftForReviewFromDb(db: Pick<ReviewDb, "select">, draftId: string) {
  const rows = await db
    .select({
      card: knowledgeCards,
      source: {
        id: sources.id,
        kind: sources.kind,
        url: sources.url,
        canonicalUrl: sources.canonicalUrl,
        label: sources.label,
        publisher: sources.publisher,
        collectedDate: sources.collectedDate,
        sourceType: sources.sourceType,
        verificationStatus: sources.verificationStatus,
        official: sources.official,
        partner: sources.partner,
        supportLevel: knowledgeCardSources.supportLevel,
      },
      suggestion: knowledgeSourceSuggestions,
      targetCard: targetKnowledgeCards,
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .leftJoin(sources, eq(sources.id, knowledgeCardSources.sourceId))
    .leftJoin(knowledgeSourceSuggestions, eq(knowledgeSourceSuggestions.suggestedCardId, knowledgeCards.id))
    .leftJoin(targetKnowledgeCards, eq(targetKnowledgeCards.id, knowledgeSourceSuggestions.targetCardId))
    .where(eq(knowledgeCards.id, draftId));

  const grouped = groupDraftRows(rows);
  const card = grouped[0];

  return card ? { card, sources: card.sources } : null;
}

async function loadRawLeakCorpusForSources(db: Pick<ReviewDb, "select">, sourceIds: string[]) {
  if (sourceIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      rawText: rawSourceMaterial.rawText,
      fileName: rawSourceMaterial.fileName,
      storageKey: rawSourceMaterial.storageKey,
      rawMetadata: rawSourceMaterial.rawMetadata,
    })
    .from(rawSourceMaterial)
    .where(inArray(rawSourceMaterial.sourceId, sourceIds));

  return rows.flatMap((row) => [row.rawText, row.fileName, row.storageKey, ...flattenMetadataStrings(row.rawMetadata)]).filter((value): value is string => Boolean(value));
}

function normalizeDraftUpdateInput(input: KnowledgeDraftUpdateInput, linkedSources: KnowledgeDraftReviewSource[], rawTexts: string[]) {
  const type = normalizeEnum(input.type, knowledgeCardTypeValues);
  const title = normalizeBoundedString(input.title, maxTitleLength);
  const locationName = normalizeOptionalBoundedString(input.locationName, maxLocationLength);
  const routeSegment = normalizeOptionalBoundedString(input.routeSegment, maxRouteSegmentLength);
  const summary = normalizeBoundedString(input.summary, maxSummaryLength);
  const confidence = clampConfidence(normalizeEnum(input.confidence, knowledgeConfidenceValues), linkedSources);
  const freshnessSensitive = normalizeFreshnessSensitive(input.freshnessSensitive);
  const practicalDetails = normalizePracticalDetails(input.practicalDetails);
  const tags = normalizeTags(input.tags);

  if (!type || !title || !summary || !confidence || freshnessSensitive === null) {
    throw new KnowledgeDraftReviewError("Dữ liệu bản nháp không hợp lệ. Vui lòng kiểm tra tiêu đề, loại, tóm tắt, độ tin cậy và freshness.", "invalid_input");
  }

  if (!locationName && !routeSegment) {
    throw new KnowledgeDraftReviewError("Bản nháp cần ít nhất một địa điểm hoặc cung đường.", "invalid_input");
  }

  rejectUnsafeCardFields({ title, locationName, routeSegment, summary, tags, practicalDetails }, rawTexts);

  return { type, title, locationName, routeSegment, summary, practicalDetails, tags, confidence, freshnessSensitive };
}

function groupDraftRows(
  rows: Array<{
    card: typeof knowledgeCards.$inferSelect;
    source: {
      id: string | null;
      kind: KnowledgeDraftReviewSource["kind"] | null;
      url: string | null;
      canonicalUrl: string | null;
      label: string | null;
      publisher: string | null;
      collectedDate: string | null;
      sourceType: KnowledgeDraftReviewSource["sourceType"] | null;
      verificationStatus: KnowledgeDraftReviewSource["verificationStatus"] | null;
      official: boolean | null;
      partner: boolean | null;
      supportLevel: KnowledgeDraftReviewSource["supportLevel"] | null;
    } | null;
    suggestion: typeof knowledgeSourceSuggestions.$inferSelect | null;
    targetCard: {
      id: string | null;
      status: typeof knowledgeCards.$inferSelect.status | null;
      type: typeof knowledgeCards.$inferSelect.type | null;
      title: string | null;
      locationName: string | null;
      routeSegment: string | null;
      summary: string | null;
      confidence: typeof knowledgeCards.$inferSelect.confidence | null;
      freshnessSensitive: boolean | null;
    } | null;
  }>,
): KnowledgeDraftReviewCard[] {
  const drafts = new Map<string, KnowledgeDraftReviewCard>();

  for (const row of rows) {
    const existing = drafts.get(row.card.id);
    const card = existing ?? { ...row.card, sources: [], suggestion: null };

    const source = normalizeJoinedSource(row.source);

    if (source && !card.sources.some((existingSource) => existingSource.id === source.id)) {
      card.sources.push(source);
    }

    if (!card.suggestion) {
      card.suggestion = normalizeJoinedSuggestion(row.suggestion, row.targetCard);
    }

    drafts.set(row.card.id, card);
  }

  return Array.from(drafts.values());
}

function groupApprovedRows(
  rows: Array<{
    card: Omit<ApprovedKnowledgeCard, "sources">;
    source: JoinedKnowledgeSource | null;
  }>,
): ApprovedKnowledgeCard[] {
  const cards = new Map<string, ApprovedKnowledgeCard>();

  for (const row of rows) {
    const existing = cards.get(row.card.id);
    const card = existing ?? toApprovedKnowledgeCard(row.card);
    const source = normalizeJoinedSource(row.source);

    if (source && !card.sources.some((existingSource) => existingSource.id === source.id)) {
      card.sources.push(source);
    }

    cards.set(row.card.id, card);
  }

  return Array.from(cards.values());
}

async function attachIndexStatus(cards: ApprovedKnowledgeCard[]): Promise<ApprovedKnowledgeCardWithIndexStatus[]> {
  const statuses = await loadApprovedKnowledgeIndexStatuses(cards.map((card) => card.id));
  return cards.map((card) => ({ ...card, indexStatus: statuses.get(card.id) ?? toMissingIndexStatus() }));
}

async function loadApprovedKnowledgeIndexStatuses(cardIds: string[]) {
  const uniqueCardIds = Array.from(new Set(cardIds.map((cardId) => cardId.trim()).filter(Boolean)));
  const statuses = new Map<string, ApprovedKnowledgeIndexStatus>();

  if (uniqueCardIds.length === 0) {
    return statuses;
  }

  const rows = await getDb()
    .select({
      cardId: knowledgeCards.id,
      cardUpdatedAt: knowledgeCards.updatedAt,
      documentStatus: knowledgeCardSearchDocuments.status,
      documentUpdatedAt: knowledgeCardSearchDocuments.updatedAt,
    })
    .from(knowledgeCards)
    .leftJoin(knowledgeCardSearchDocuments, eq(knowledgeCardSearchDocuments.knowledgeCardId, knowledgeCards.id))
    .where(and(inArray(knowledgeCards.id, uniqueCardIds), eq(knowledgeCards.status, "approved"), eq(knowledgeCards.needsReview, false)));

  for (const row of rows) {
    statuses.set(row.cardId, toIndexStatus(row.documentStatus, row.documentUpdatedAt, row.cardUpdatedAt));
  }

  return statuses;
}

function toMissingIndexStatus(): ApprovedKnowledgeIndexStatus {
  return {
    state: "needs_indexing",
    label: "Chưa index",
    documentStatus: null,
    indexedAt: null,
  };
}

function toIndexStatus(documentStatus: string | null, documentUpdatedAt: Date | null, cardUpdatedAt: Date): ApprovedKnowledgeIndexStatus {
  if (!documentStatus || !documentUpdatedAt) {
    return toMissingIndexStatus();
  }

  if (documentStatus !== "active") {
    return {
      state: "inactive_index",
      label: "Index không active",
      documentStatus,
      indexedAt: documentUpdatedAt,
    };
  }

  if (documentUpdatedAt.getTime() <= cardUpdatedAt.getTime()) {
    return {
      state: "stale_index",
      label: "Index cần refresh",
      documentStatus,
      indexedAt: documentUpdatedAt,
    };
  }

  return {
    state: "indexed",
    label: "Đã index",
    documentStatus,
    indexedAt: documentUpdatedAt,
  };
}

function toApprovedKnowledgeCard(card: Omit<ApprovedKnowledgeCard, "sources">): ApprovedKnowledgeCard {
  return {
    id: card.id,
    status: card.status,
    type: card.type,
    title: card.title,
    locationName: card.locationName,
    routeSegment: card.routeSegment,
    summary: card.summary,
    practicalDetails: card.practicalDetails,
    tags: card.tags,
    confidence: card.confidence,
    freshnessSensitive: card.freshnessSensitive,
    needsReview: card.needsReview,
    updatedAt: card.updatedAt,
    createdAt: card.createdAt,
    sources: [],
  };
}

function normalizeJoinedSuggestion(
  suggestion: typeof knowledgeSourceSuggestions.$inferSelect | null,
  targetCard: Parameters<typeof groupDraftRows>[0][number]["targetCard"],
): KnowledgeDraftReviewSuggestion | null {
  if (!suggestion?.id) {
    return null;
  }

  return {
    id: suggestion.id,
    action: suggestion.action,
    targetCardId: suggestion.targetCardId,
    beforeSummary: suggestion.beforeSummary,
    afterSummary: suggestion.afterSummary,
    conflictSummary: suggestion.conflictSummary,
    rationale: suggestion.rationale,
    createdAt: suggestion.createdAt,
    targetCard: normalizeJoinedTargetCard(targetCard),
  };
}

function normalizeJoinedTargetCard(targetCard: Parameters<typeof groupDraftRows>[0][number]["targetCard"]) {
  if (!targetCard?.id || !targetCard.status || !targetCard.type || !targetCard.title || !targetCard.summary || !targetCard.confidence || targetCard.freshnessSensitive === null) {
    return null;
  }

  return {
    id: targetCard.id,
    status: targetCard.status,
    type: targetCard.type,
    title: targetCard.title,
    locationName: targetCard.locationName,
    routeSegment: targetCard.routeSegment,
    summary: targetCard.summary,
    confidence: targetCard.confidence,
    freshnessSensitive: targetCard.freshnessSensitive,
  };
}

type JoinedKnowledgeSource = {
  id: string | null;
  kind: KnowledgeDraftReviewSource["kind"] | null;
  url: string | null;
  canonicalUrl: string | null;
  label: string | null;
  publisher: string | null;
  collectedDate: string | null;
  sourceType: KnowledgeDraftReviewSource["sourceType"] | null;
  verificationStatus: KnowledgeDraftReviewSource["verificationStatus"] | null;
  official: boolean | null;
  partner: boolean | null;
  supportLevel: KnowledgeDraftReviewSource["supportLevel"] | null;
};

function normalizeJoinedSource(source: JoinedKnowledgeSource | null): KnowledgeDraftReviewSource | null {
  if (!source?.id || !source.kind || !source.label || !source.sourceType || !source.verificationStatus || !source.supportLevel || source.official === null || source.partner === null) {
    return null;
  }

  return {
    id: source.id,
    kind: source.kind,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    label: source.label,
    publisher: source.publisher,
    collectedDate: source.collectedDate,
    sourceType: source.sourceType,
    verificationStatus: source.verificationStatus,
    official: source.official,
    partner: source.partner,
    supportLevel: source.supportLevel,
  };
}

function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value : null;
}

function clampConfidence(confidence: KnowledgeConfidence | null, linkedSources: KnowledgeDraftReviewSource[]): KnowledgeConfidence | null {
  if (!confidence) {
    return null;
  }

  const requestedRank = confidenceRank(confidence);
  const confidenceSources = linkedSources.filter((source) => source.supportLevel !== "conflicting");
  const ceilingRank = Math.max(...confidenceSources.map((source) => confidenceRank(sourceConfidenceCeiling(source))), confidenceRank("unverified"));
  const persistedRank = Math.min(requestedRank, ceilingRank);

  return knowledgeConfidenceValues[persistedRank];
}

function confidenceRank(confidence: KnowledgeConfidence) {
  return knowledgeConfidenceValues.indexOf(confidence);
}

function sourceConfidenceCeiling(source: KnowledgeDraftReviewSource): KnowledgeConfidence {
  if (source.official) return "official";
  if (source.partner) return "partner";
  if (source.sourceType === "community") return "community";
  if (source.verificationStatus === "verified") return "curated";
  return "unverified";
}

function normalizeFreshnessSensitive(value: KnowledgeDraftUpdateInput["freshnessSensitive"]) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value === "true" || value === "on") return true;
    if (value === "false" || value === "") return false;
  }

  if (value === null || value === undefined) {
    return false;
  }

  return null;
}

function normalizeBoundedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function normalizeOptionalBoundedString(value: unknown, maxLength: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = normalizeBoundedString(value, maxLength);

  if (!normalized) {
    throw new KnowledgeDraftReviewError("Trường địa điểm hoặc cung đường không hợp lệ.", "invalid_input");
  }

  return normalized;
}

function normalizePracticalDetails(value: unknown): Record<string, unknown> {
  const parsed = typeof value === "string" ? parseDetailsJson(value) : value;

  if (!isRecord(parsed)) {
    throw new KnowledgeDraftReviewError("Chi tiết thực tế phải là JSON object hợp lệ.", "invalid_input");
  }

  const details: Record<string, unknown> = {};
  const entries = Object.entries(parsed);

  if (entries.length > maxDetailEntries) {
    throw new KnowledgeDraftReviewError("Chi tiết thực tế chỉ được có tối đa 20 mục.", "invalid_input");
  }

  for (const [key, detailValue] of entries) {
    const safeKey = normalizeBoundedString(key, maxDetailKeyLength);

    if (!safeKey) {
      throw new KnowledgeDraftReviewError("Khóa chi tiết thực tế không hợp lệ.", "invalid_input");
    }

    const safeValue = normalizeDetailValue(safeKey, detailValue);

    details[safeKey] = safeValue;
  }

  return details;
}

function parseDetailsJson(value: string) {
  const trimmed = value.trim();

  if (trimmed.length > maxPracticalDetailsJsonLength) {
    throw new KnowledgeDraftReviewError("Chi tiết thực tế quá dài.", "invalid_input");
  }

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new KnowledgeDraftReviewError("Chi tiết thực tế phải là JSON object hợp lệ.", "invalid_input");
  }
}

function normalizeDetailValue(key: string, value: unknown): string | string[] {
  if (typeof value === "string") {
    const normalized = normalizeBoundedString(value, maxDetailStringLength);

    if (!normalized) {
      throw new KnowledgeDraftReviewError("Giá trị chi tiết thực tế không hợp lệ.", "invalid_input");
    }

    return normalized;
  }

  if (Array.isArray(value)) {
    if (value.length > (key === "ordered_stops" ? maxOrderedStops : maxDetailArrayItems)) {
      throw new KnowledgeDraftReviewError("Mỗi chi tiết thực tế chỉ được có tối đa 10 dòng, riêng ordered_stops tối đa 40 điểm.", "invalid_input");
    }

    const values = value.map((item) => {
      const normalized = key === "ordered_stops" ? normalizeOrderedStop(item) : normalizeBoundedString(item, maxDetailStringLength);

      if (!normalized) {
        throw new KnowledgeDraftReviewError("Danh sách chi tiết thực tế chứa giá trị không hợp lệ.", "invalid_input");
      }

      return normalized;
    });

    return values;
  }

  throw new KnowledgeDraftReviewError("Giá trị chi tiết thực tế không hợp lệ.", "invalid_input");
}

function normalizeOrderedStop(value: unknown) {
  const normalized = normalizeBoundedString(value, maxLocationLength);

  if (!normalized || normalized.split(/\s+/).length > 12 || /[\r\n\[\]{}.,;:!?]/.test(normalized) || /^\d+\s*[.)-]/.test(normalized) || /(rẽ|đi tiếp|chạy tiếp|băng qua|vượt|lướt qua|theo đường)/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function normalizeTags(value: unknown) {
  const tagValues = typeof value === "string" ? (value.trim() ? value.split(",") : []) : value;

  if (!Array.isArray(tagValues)) {
    throw new KnowledgeDraftReviewError("Tags phải là danh sách hợp lệ.", "invalid_input");
  }

  if (tagValues.length > maxTags) {
    throw new KnowledgeDraftReviewError("Bản nháp chỉ được có tối đa 12 tags.", "invalid_input");
  }

  const normalizedTags = tagValues.map((tag) => {
    const normalized = normalizeBoundedString(tag, maxTagLength);

    if (!normalized) {
      throw new KnowledgeDraftReviewError("Tags chứa giá trị trống hoặc quá dài.", "invalid_input");
    }

    return normalized;
  });

  const tags = Array.from(new Set(normalizedTags));

  return tags;
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
      throw new KnowledgeDraftReviewError("Trường an toàn không được chứa số liên hệ, email hoặc metadata thô.", "invalid_input");
    }

    const normalized = normalizeForOverlap(value);

    if (normalizedRawValues.includes(normalized) || (normalized.length >= 24 && rawCorpus.includes(normalized))) {
      throw new KnowledgeDraftReviewError("Trường an toàn không được sao chép nguyên văn nội dung nguồn thô.", "invalid_input");
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
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenMetadataStrings);
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, metadataValue]) => [key, ...flattenMetadataStrings(metadataValue)]);
  }

  return [];
}

function normalizeForOverlap(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function summarizeDraft(card: Pick<KnowledgeDraftReviewCard, "status" | "type" | "confidence" | "needsReview" | "freshnessSensitive">) {
  return `Draft before mutation: status=${card.status}; type=${card.type}; confidence=${card.confidence}; needsReview=${card.needsReview}; freshnessSensitive=${card.freshnessSensitive}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseKnowledgeDraftFormData(formData: FormData): KnowledgeDraftUpdateInput {
  return {
    type: getRequiredFormString(formData, "type"),
    title: getRequiredFormString(formData, "title"),
    locationName: getOptionalFormString(formData, "locationName"),
    routeSegment: getOptionalFormString(formData, "routeSegment"),
    summary: getRequiredFormString(formData, "summary"),
    practicalDetails: getRequiredFormString(formData, "practicalDetails"),
    tags: getOptionalFormString(formData, "tags") ?? "",
    confidence: getRequiredFormString(formData, "confidence"),
    freshnessSensitive: formData.get("freshnessSensitive") === "on",
  };
}

function getRequiredFormString(formData: FormData, key: string) {
  const value = getOptionalFormString(formData, key);

  if (!value) {
    return "";
  }

  return value;
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() || null : null;
}
