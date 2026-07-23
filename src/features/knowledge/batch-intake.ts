import "server-only";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCardEvidence, knowledgeCards, knowledgeCardSources, knowledgeCardTypeValues, knowledgeRecommendations, knowledgeSeedBatchItems, knowledgeSeedBatches, knowledgeSourceSuggestions, sourceCaptureVersions, sources, type KnowledgeCardType, type KnowledgeRecommendationReason, type KnowledgeSeedBatchItemStatus, type KnowledgeSuggestionAction } from "@/db/schema";
import { isKnowledgeCardTravelerEligible } from "@/features/knowledge/state";
import { recordAuditEvent } from "@/features/audit/events";
import { requireAdminSession } from "@/server/auth";

import { isSourceValidationError, normalizeTravelSourceInput } from "./sources";
import { appendSourceCaptureVersion } from "./source-captures";

const maxBatchUrls = 50;
const maxBatchLabelLength = 160;
const maxRecentBatches = 5;
const maxSubmittedUrlLength = 2048;
const maxSafeErrorLength = 500;
const activeCorridorSeedTarget = 100;
const corridorBuckets = [
  { label: "Hà Nội", aliases: ["ha noi", "hanoi"] },
  { label: "Ninh Bình", aliases: ["ninh binh"] },
  { label: "Thanh Hóa", aliases: ["thanh hoa"] },
  { label: "Nghệ An / Vinh", aliases: ["nghe an", "vinh"] },
  { label: "Hà Tĩnh", aliases: ["ha tinh"] },
  { label: "Quảng Bình / Đồng Hới", aliases: ["quang binh", "dong hoi"] },
  { label: "Quảng Trị", aliases: ["quang tri"] },
  { label: "Huế", aliases: ["hue"] },
  { label: "Đà Nẵng", aliases: ["da nang"] },
  { label: "Hội An / Quảng Nam", aliases: ["hoi an", "quang nam"] },
  { label: "Quảng Ngãi", aliases: ["quang ngai"] },
  { label: "Quy Nhơn / Bình Định", aliases: ["quy nhon", "binh dinh"] },
  { label: "Phú Yên / Tuy Hòa", aliases: ["phu yen", "tuy hoa"] },
  { label: "Nha Trang / Khánh Hòa", aliases: ["nha trang", "khanh hoa"] },
  { label: "Phan Rang / Ninh Thuận", aliases: ["phan rang", "ninh thuan"] },
  { label: "Phan Thiết / Bình Thuận", aliases: ["phan thiet", "binh thuan"] },
  { label: "Đồng Nai", aliases: ["dong nai"] },
  { label: "TP.HCM / Sài Gòn", aliases: ["tp hcm", "tphcm", "ho chi minh", "sai gon", "hcmc"] },
];

type BatchDb = ReturnType<typeof getDb>;

export type BatchSeedUrlIntakeInput = {
  urls: string;
  label?: string | null;
  publisher?: string | null;
  collectedDate?: string | null;
};

export type BatchSeedUrlIntakeResult = {
  batchId: string;
  totalItems: number;
  pendingCount: number;
  failedCount: number;
  duplicateCount: number;
};

export type KnowledgeSeedBatchListItem = Pick<typeof knowledgeSeedBatchItems.$inferSelect, "id" | "lineNumber" | "submittedUrl" | "canonicalUrl" | "sourceId" | "errorSummary" | "createdAt" | "updatedAt"> & {
  status: KnowledgeSeedBatchItemStatus;
};

export type KnowledgeSeedBatchListEntry = Pick<typeof knowledgeSeedBatches.$inferSelect, "id" | "label" | "createdAt"> & {
  items: KnowledgeSeedBatchListItem[];
  counts: Record<KnowledgeSeedBatchItemStatus, number>;
};

export type ActiveEvidenceGroundedSeedCoverage = {
  targetActiveCards: number;
  activeEvidenceGroundedCards: number;
  remainingActiveCards: number;
  isComplete: boolean;
  activeCommunityObservations: number;
  activeCommunityPatterns: number;
  caveatOnlyHighRiskCards: number;
  pendingReviewCards: number;
  pendingVerificationCards: number;
  actionableWork: Array<
    | { kind: "recommendation"; reason: KnowledgeRecommendationReason; priority: number; count: number }
    | { kind: "source_intake"; reason: Extract<KnowledgeSuggestionAction, "create" | "update" | "conflict">; priority: null; count: number }
  >;
  byType: Array<{ type: KnowledgeCardType; count: number }>;
  byRouteOrLocation: Array<{ routeOrLocation: string; count: number }>;
};

export class KnowledgeBatchIntakeError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_input" | "too_many_urls",
  ) {
    super(message);
    this.name = "KnowledgeBatchIntakeError";
  }
}

export function isKnowledgeBatchIntakeError(error: unknown) {
  return error instanceof KnowledgeBatchIntakeError || (error instanceof Error && error.name === "KnowledgeBatchIntakeError");
}

export async function submitKnowledgeSeedUrlBatch(input: BatchSeedUrlIntakeInput): Promise<BatchSeedUrlIntakeResult> {
  const session = await requireAdminSession();
  const lines = parseSubmittedUrlLines(input.urls);
  const label = normalizeOptionalSafeString(input.label, "Nhãn batch", maxBatchLabelLength);

  if (lines.length === 0) {
    throw new KnowledgeBatchIntakeError("Cần nhập ít nhất một URL để nạp batch.", "invalid_input");
  }

  if (lines.length > maxBatchUrls) {
    throw new KnowledgeBatchIntakeError(`Mỗi batch chỉ hỗ trợ tối đa ${maxBatchUrls} URL.`, "too_many_urls");
  }

  const db = getDb();
  return db.transaction(async (transaction) => {
    const [batch] = await transaction.insert(knowledgeSeedBatches).values({ label, submittedByUserId: session.userId }).returning({ id: knowledgeSeedBatches.id });
    const seenCanonicalUrls = new Set<string>();
    let pendingCount = 0;
    let failedCount = 0;
    let duplicateCount = 0;

    for (const line of lines) {
      let normalized: ReturnType<typeof normalizeTravelSourceInput>;
      let canonicalUrl: string;

      try {
        normalized = normalizeTravelSourceInput({
          url: line.url,
          publisher: input.publisher,
          collectedDate: input.collectedDate,
          rawMetadata: { seedBatchId: batch.id, seedBatchLineNumber: line.lineNumber },
        });
        canonicalUrl = normalized.source.url ?? "";

        if (!canonicalUrl) {
          throw new KnowledgeBatchIntakeError("URL nguồn không hợp lệ.", "invalid_input");
        }

        if (line.url.length > maxSubmittedUrlLength || canonicalUrl.length > maxSubmittedUrlLength) {
          throw new KnowledgeBatchIntakeError("URL nguồn quá dài để theo dõi trong batch.", "invalid_input");
        }
      } catch (error) {
        failedCount += 1;
        await insertFailedItem(transaction, batch.id, line, null, "failed", getSafeLineError(error));
        continue;
      }

      if (seenCanonicalUrls.has(canonicalUrl)) {
        duplicateCount += 1;
        await insertFailedItem(transaction, batch.id, line, canonicalUrl, "duplicate", "URL trùng trong cùng batch; chỉ dòng đầu tiên được nạp.");
        continue;
      }

      seenCanonicalUrls.add(canonicalUrl);
      const [source] = await transaction
        .insert(sources)
        .values({ ...normalized.source, submittedByUserId: session.userId })
        .returning({ id: sources.id });

       if (normalized.capture.rawText) {
         await appendSourceCaptureVersion(transaction, { sourceId: source.id, captureKind: normalized.source.kind, rawText: normalized.capture.rawText, metadata: normalized.capture.metadata, file: normalized.capture.file ?? undefined });
       }
      await transaction.insert(knowledgeSeedBatchItems).values({
        batchId: batch.id,
        lineNumber: line.lineNumber,
        submittedUrl: line.url,
        canonicalUrl,
        sourceId: source.id,
        status: "pending",
      });
      pendingCount += 1;
    }

    await recordAuditEvent(
      {
        actor: session,
        operation: "create",
        targetType: "knowledge_seed_batch",
        targetId: batch.id,
        afterSummary: `Operator submitted seed URL batch: total=${lines.length}; pending=${pendingCount}; failed=${failedCount}; duplicate=${duplicateCount}.`,
      },
      transaction,
    );

    return { batchId: batch.id, totalItems: lines.length, pendingCount, failedCount, duplicateCount };
  });
}

export async function listRecentKnowledgeSeedBatches(limit = maxRecentBatches): Promise<KnowledgeSeedBatchListEntry[]> {
  await requireAdminSession();
  const db = getDb();
  const batches = await db
    .select({ id: knowledgeSeedBatches.id, label: knowledgeSeedBatches.label, createdAt: knowledgeSeedBatches.createdAt })
    .from(knowledgeSeedBatches)
    .orderBy(desc(knowledgeSeedBatches.createdAt), desc(knowledgeSeedBatches.id))
    .limit(Math.max(1, Math.min(limit, maxRecentBatches)));

  if (batches.length === 0) {
    return [];
  }

  const batchIds = batches.map((batch) => batch.id);
  const rows = await db.select().from(knowledgeSeedBatchItems).where(inArray(knowledgeSeedBatchItems.batchId, batchIds)).orderBy(knowledgeSeedBatchItems.batchId, knowledgeSeedBatchItems.lineNumber);
  const derivedStatuses = await deriveStatusesForSourceItems(db, rows.filter((row) => row.sourceId));
  const itemsByBatch = new Map<string, KnowledgeSeedBatchListItem[]>();
  const staleStatusUpdates: Array<{ id: string; previousStatus: KnowledgeSeedBatchItemStatus; status: KnowledgeSeedBatchItemStatus }> = [];

  for (const row of rows) {
    const status = row.sourceId ? (derivedStatuses.get(row.sourceId) ?? row.status) : row.status;
    if (status !== row.status) {
      staleStatusUpdates.push({ id: row.id, previousStatus: row.status, status });
    }
    const item = { ...row, status };
    const items = itemsByBatch.get(row.batchId) ?? [];
    items.push(item);
    itemsByBatch.set(row.batchId, items);
  }

  await persistDerivedStatuses(db, staleStatusUpdates);

  return batches.map((batch) => {
    const items = itemsByBatch.get(batch.id) ?? [];
    return { ...batch, items, counts: countStatuses(items) };
  });
}

export async function getActiveEvidenceGroundedSeedCoverage(): Promise<ActiveEvidenceGroundedSeedCoverage> {
  await requireAdminSession();
  const db = getDb();
  const cardRows = await db
    .select({
      id: knowledgeCards.id,
      type: knowledgeCards.type,
      status: knowledgeCards.status,
      needsReview: knowledgeCards.needsReview,
      locationName: knowledgeCards.locationName,
      routeSegment: knowledgeCards.routeSegment,
      publicationState: knowledgeCards.publicationState,
      knowledgeState: knowledgeCards.knowledgeState,
      reviewState: knowledgeCards.reviewState,
      verificationState: knowledgeCards.verificationState,
      contentVersion: knowledgeCards.contentVersion,
      evidenceSetRevision: knowledgeCards.evidenceSetRevision,
    })
    .from(knowledgeCards)
    .where(eq(knowledgeCards.publicationState, "active"));
  const evidenceRows = await db
    .select({ cardId: knowledgeCardEvidence.knowledgeCardId, independenceKey: knowledgeCardEvidence.independenceKey })
    .from(knowledgeCardEvidence)
    .innerJoin(knowledgeCards, and(eq(knowledgeCards.id, knowledgeCardEvidence.knowledgeCardId), eq(knowledgeCards.publicationState, "active")))
    .innerJoin(sources, eq(sources.id, knowledgeCardEvidence.sourceId))
    .innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, knowledgeCardEvidence.captureVersionId), eq(sourceCaptureVersions.sourceId, knowledgeCardEvidence.sourceId)))
    .where(and(
      eq(knowledgeCardEvidence.state, "active"),
      sql`${knowledgeCardEvidence.supportLevel} in ('primary', 'supporting')`,
      eq(sources.eligibility, "eligible"),
      sql`${sourceCaptureVersions.payloadDeletedAt} is null`,
      sql`${sourceCaptureVersions.rawText} is not null`,
      sql`substring(${sourceCaptureVersions.rawText} from ${knowledgeCardEvidence.spanStart} + 1 for ${knowledgeCardEvidence.spanEnd} - ${knowledgeCardEvidence.spanStart}) = ${knowledgeCardEvidence.quoteText}`,
    ));
  const evidenceKeysByCardId = new Map<string, Set<string>>();
  for (const row of evidenceRows) {
    const keys = evidenceKeysByCardId.get(row.cardId) ?? new Set<string>();
    keys.add(row.independenceKey);
    evidenceKeysByCardId.set(row.cardId, keys);
  }

  const uniqueEligibleCards = new Map<string, { type: KnowledgeCardType; locationName: string | null; routeSegment: string | null }>();
  const corridorCards = cardRows.filter((card) => hasCorridorSignal(card.routeSegment, card.locationName));
  let activeCommunityObservations = 0;
  let activeCommunityPatterns = 0;
  let caveatOnlyHighRiskCards = 0;
  let pendingReviewCards = 0;
  let pendingVerificationCards = 0;

  for (const row of cardRows) {
    if (!hasCorridorSignal(row.routeSegment, row.locationName)) continue;
    const activeSupportingEvidenceCount = evidenceKeysByCardId.get(row.id)?.size ?? 0;
    const hasCurrentEvidence = activeSupportingEvidenceCount > 0;
    if (hasCurrentEvidence && (row.knowledgeState === "uncertain" || row.verificationState === "required")) caveatOnlyHighRiskCards += 1;
    if (row.needsReview || row.reviewState === "ai_recommended" || row.reviewState === "in_review") pendingReviewCards += 1;
    if (row.verificationState === "required") pendingVerificationCards += 1;
    const eligibleForCoverage = isKnowledgeCardTravelerEligible({
      ...row,
      activeSupportingEvidenceCount,
      capturePayloadAvailable: hasCurrentEvidence,
    });
    const hasRequiredPatternSupport = row.knowledgeState !== "community_pattern" || activeSupportingEvidenceCount >= 2;
    if (eligibleForCoverage && hasRequiredPatternSupport && row.knowledgeState !== "uncertain" && !uniqueEligibleCards.has(row.id)) {
      uniqueEligibleCards.set(row.id, { type: row.type, locationName: row.locationName, routeSegment: row.routeSegment });
      if (row.knowledgeState === "community_observation") activeCommunityObservations += 1;
      if (row.knowledgeState === "community_pattern") activeCommunityPatterns += 1;
    }
  }

  const recommendationRows = await db
    .select({ cardId: knowledgeRecommendations.knowledgeCardId, reason: knowledgeRecommendations.reason, priority: knowledgeRecommendations.priority })
    .from(knowledgeRecommendations)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeRecommendations.knowledgeCardId))
    .where(and(
      sql`${knowledgeRecommendations.status} in ('open', 'in_review')`,
      eq(knowledgeRecommendations.contentVersion, knowledgeCards.contentVersion),
      eq(knowledgeRecommendations.evidenceSetRevision, knowledgeCards.evidenceSetRevision),
    ));
  const corridorCardIds = new Set(corridorCards.map((card) => card.id));
  const actionableWorkCounts = new Map<string, ActiveEvidenceGroundedSeedCoverage["actionableWork"][number]>();
  for (const row of recommendationRows) {
    if (!corridorCardIds.has(row.cardId)) continue;
    const key = `${row.priority}:${row.reason}`;
    const current = actionableWorkCounts.get(key);
    actionableWorkCounts.set(key, current ? { ...current, count: current.count + 1 } : { kind: "recommendation", reason: row.reason, priority: row.priority, count: 1 });
  }
  const sourceSuggestionRows = await db
    .select({ action: knowledgeSourceSuggestions.action, suggestedCardId: knowledgeSourceSuggestions.suggestedCardId, targetCardId: knowledgeSourceSuggestions.targetCardId })
    .from(knowledgeSourceSuggestions)
    .innerJoin(sources, and(eq(sources.id, knowledgeSourceSuggestions.sourceId), eq(sources.eligibility, "eligible")))
    .innerJoin(sourceCaptureVersions, and(eq(sourceCaptureVersions.id, sources.currentCaptureVersionId), isNull(sourceCaptureVersions.payloadDeletedAt)))
    .where(or(eq(knowledgeSourceSuggestions.action, "create"), eq(knowledgeSourceSuggestions.action, "update"), eq(knowledgeSourceSuggestions.action, "conflict")));
  const sourceSuggestionCardIds = Array.from(new Set(sourceSuggestionRows.flatMap((row) => [row.targetCardId, row.suggestedCardId]).filter((cardId): cardId is string => Boolean(cardId))));
  const sourceSuggestionCorridorCardIds = new Set(
    sourceSuggestionCardIds.length === 0
      ? []
      : (await db
        .select({ id: knowledgeCards.id, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment })
        .from(knowledgeCards)
        .where(inArray(knowledgeCards.id, sourceSuggestionCardIds)))
        .filter((card) => hasCorridorSignal(card.routeSegment, card.locationName))
        .map((card) => card.id),
  );
  for (const row of sourceSuggestionRows) {
    const relatedCardId = row.targetCardId ?? row.suggestedCardId;
    if (!relatedCardId || !sourceSuggestionCorridorCardIds.has(relatedCardId) || (row.action !== "create" && row.action !== "update" && row.action !== "conflict")) continue;
    const key = `source_intake:${row.action}`;
    const current = actionableWorkCounts.get(key);
    actionableWorkCounts.set(key, current ? { ...current, count: current.count + 1 } : { kind: "source_intake", reason: row.action, priority: null, count: 1 });
  }

  const activeEvidenceGroundedCards = uniqueEligibleCards.size;
  return {
    targetActiveCards: activeCorridorSeedTarget,
    activeEvidenceGroundedCards,
    remainingActiveCards: Math.max(activeCorridorSeedTarget - activeEvidenceGroundedCards, 0),
    isComplete: activeEvidenceGroundedCards >= activeCorridorSeedTarget,
    activeCommunityObservations,
    activeCommunityPatterns,
    caveatOnlyHighRiskCards,
    pendingReviewCards,
    pendingVerificationCards,
    actionableWork: Array.from(actionableWorkCounts.values()).sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER) || a.reason.localeCompare(b.reason)),
    byType: countByType(Array.from(uniqueEligibleCards.values())),
    byRouteOrLocation: countByRouteOrLocation(Array.from(uniqueEligibleCards.values())),
  };
}

function parseSubmittedUrlLines(input: string) {
  return input
    .split(/\r\n|\n|\r/)
    .map((value, index) => ({ lineNumber: index + 1, url: value.trim() }))
    .filter((line) => line.url.length > 0);
}

function normalizeOptionalSafeString(value: string | null | undefined, fieldName: string, maxLength: number) {
  const normalized = value?.trim() || null;

  if (!normalized) {
    return null;
  }

  if (normalized.includes("\n") || normalized.includes("\r") || normalized.length > maxLength) {
    throw new KnowledgeBatchIntakeError(`${fieldName} cần ngắn gọn và không chứa nội dung thô.`, "invalid_input");
  }

  return normalized;
}

async function insertFailedItem(
  db: Pick<BatchDb, "insert">,
  batchId: string,
  line: { lineNumber: number; url: string },
  canonicalUrl: string | null,
  status: "failed" | "duplicate",
  errorSummary: string,
) {
  await db.insert(knowledgeSeedBatchItems).values({
    batchId,
    lineNumber: line.lineNumber,
    submittedUrl: line.url.slice(0, maxSubmittedUrlLength),
    canonicalUrl: canonicalUrl?.slice(0, maxSubmittedUrlLength) ?? null,
    status,
    errorSummary: normalizeSafeErrorSummary(errorSummary),
  });
}

async function persistDerivedStatuses(db: Pick<BatchDb, "update">, updates: Array<{ id: string; previousStatus: KnowledgeSeedBatchItemStatus; status: KnowledgeSeedBatchItemStatus }>) {
  for (const update of updates) {
    await db
      .update(knowledgeSeedBatchItems)
      .set({ status: update.status, updatedAt: new Date() })
      .where(and(eq(knowledgeSeedBatchItems.id, update.id), eq(knowledgeSeedBatchItems.status, update.previousStatus)));
  }
}

function normalizeSafeErrorSummary(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, maxSafeErrorLength) || "Không thể nạp URL này.";
}

function getSafeLineError(error: unknown) {
  if (isSourceValidationError(error) && error instanceof Error) {
    return error.message;
  }

  if (isKnowledgeBatchIntakeError(error) && error instanceof Error) {
    return error.message;
  }

  return "Không thể nạp URL này. Vui lòng kiểm tra lại định dạng nguồn.";
}

async function deriveStatusesForSourceItems(db: Pick<BatchDb, "select">, items: Array<typeof knowledgeSeedBatchItems.$inferSelect>) {
  const sourceIds = Array.from(new Set(items.map((item) => item.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId))));
  const derived = new Map<string, KnowledgeSeedBatchItemStatus>();

  if (sourceIds.length === 0) {
    return derived;
  }

  const cardRows = await db
    .select({
      sourceId: knowledgeCardSources.sourceId,
      status: knowledgeCards.status,
      needsReview: knowledgeCards.needsReview,
      publicationState: knowledgeCards.publicationState,
      knowledgeState: knowledgeCards.knowledgeState,
      reviewState: knowledgeCards.reviewState,
      verificationState: knowledgeCards.verificationState,
      locationName: knowledgeCards.locationName,
      routeSegment: knowledgeCards.routeSegment,
      activeSupportingEvidenceCount: sql<number>`case when exists (select 1 from ${knowledgeCardEvidence} evidence join ${knowledgeCardSources} link on link.knowledge_card_id = evidence.knowledge_card_id and link.source_id = evidence.source_id join ${sourceCaptureVersions} capture on capture.id = evidence.capture_version_id and capture.source_id = evidence.source_id where evidence.knowledge_card_id = ${knowledgeCards.id} and evidence.state = 'active' and evidence.support_level in ('primary', 'supporting') and capture.payload_deleted_at is null and substring(capture.raw_text from evidence.span_start + 1 for evidence.span_end - evidence.span_start) = evidence.quote_text) then 1 else 0 end`,
      capturePayloadAvailable: sql<boolean>`true`,
    })
    .from(knowledgeCardSources)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId))
    .where(inArray(knowledgeCardSources.sourceId, sourceIds));

  for (const row of cardRows) {
    const current = derived.get(row.sourceId);
    const next = mapCardStatus(row);
    derived.set(row.sourceId, pickHigherStatus(current, next));
  }

  const capturedYoutubeRows = await db
    .select({ sourceId: sources.id })
    .from(sources)
     .innerJoin(sourceCaptureVersions, eq(sourceCaptureVersions.id, sources.currentCaptureVersionId))
     .where(and(inArray(sources.id, sourceIds), eq(sources.kind, "youtube"), sql`length(btrim(${sourceCaptureVersions.rawText})) > 0`));

  for (const row of capturedYoutubeRows) {
    derived.set(row.sourceId, pickHigherStatus(derived.get(row.sourceId), "reading"));
  }

  const suggestionRows = await db
    .select({ sourceId: knowledgeSourceSuggestions.sourceId, action: knowledgeSourceSuggestions.action })
    .from(knowledgeSourceSuggestions)
    .where(and(inArray(knowledgeSourceSuggestions.sourceId, sourceIds), or(eq(knowledgeSourceSuggestions.action, "duplicate"), eq(knowledgeSourceSuggestions.action, "no_action"))));

  for (const row of suggestionRows) {
    derived.set(row.sourceId, pickHigherStatus(derived.get(row.sourceId), row.action === "duplicate" ? "duplicate" : "rejected"));
  }

  return derived;
}

function mapCardStatus(card: Pick<typeof knowledgeCards.$inferSelect, "status" | "needsReview" | "publicationState" | "knowledgeState" | "reviewState" | "verificationState"> & { activeSupportingEvidenceCount?: number; capturePayloadAvailable?: boolean }): KnowledgeSeedBatchItemStatus {
  const { status, needsReview } = card;
  if (status === "approved" && needsReview) return "needs_review";
  if (status === "approved") return isKnowledgeCardTravelerEligible(card) ? "approved" : "needs_review";
  if (status === "archived") return "rejected";
  if (status === "rejected") return "rejected";
  if (status === "duplicate" || status === "no_action") return "duplicate";
  if (status === "draft" && needsReview) return "needs_review";
  return "extracted";
}

function pickHigherStatus(current: KnowledgeSeedBatchItemStatus | undefined, next: KnowledgeSeedBatchItemStatus) {
  if (!current) return next;
  const rank: Record<KnowledgeSeedBatchItemStatus, number> = {
    pending: 0,
    reading: 0,
    extracted: 1,
    needs_review: 2,
    duplicate: 3,
    rejected: 4,
    failed: 5,
    approved: 6,
  };
  return rank[next] > rank[current] ? next : current;
}

function countStatuses(items: KnowledgeSeedBatchListItem[]) {
  const counts: Record<KnowledgeSeedBatchItemStatus, number> = {
    pending: 0,
    reading: 0,
    extracted: 0,
    needs_review: 0,
    approved: 0,
    failed: 0,
    duplicate: 0,
    rejected: 0,
  };

  for (const item of items) {
    counts[item.status] += 1;
  }

  return counts;
}

function hasCorridorSignal(routeSegment: string | null, locationName: string | null) {
  return getCorridorBucketLabel(routeSegment, locationName) !== null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function countByType(cards: Array<{ type: KnowledgeCardType }>) {
  const counts = new Map<KnowledgeCardType, number>(knowledgeCardTypeValues.map((type) => [type, 0]));
  for (const card of cards) {
    counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function countByRouteOrLocation(cards: Array<{ locationName: string | null; routeSegment: string | null }>) {
  const counts = new Map<string, number>(corridorBuckets.map((bucket) => [bucket.label, 0]));
  for (const card of cards) {
    const key = getCorridorBucketLabel(null, card.locationName) ?? getCorridorBucketLabel(card.routeSegment, null);
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([routeOrLocation, count]) => ({ routeOrLocation, count }))
    .sort((a, b) => b.count - a.count || a.routeOrLocation.localeCompare(b.routeOrLocation));
}

function getCorridorBucketLabel(routeSegment: string | null, locationName: string | null) {
  const normalizedValue = ` ${normalizeSearchText([routeSegment, locationName].filter(Boolean).join(" "))} `;
  for (const bucket of corridorBuckets) {
    if (bucket.aliases.some((alias) => normalizedValue.includes(` ${normalizeSearchText(alias)} `))) {
      return bucket.label;
    }
  }
  return null;
}
