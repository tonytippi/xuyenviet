import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCards, knowledgeCardSources, knowledgeCardTypeValues, knowledgeSeedBatchItems, knowledgeSeedBatches, knowledgeSourceSuggestions, rawSourceMaterial, sources, type KnowledgeCardType, type KnowledgeSeedBatchItemStatus } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { requireAdminSession } from "@/server/auth";

import { isSourceValidationError, normalizeTravelSourceInput } from "./sources";

const maxBatchUrls = 50;
const maxBatchLabelLength = 160;
const maxRecentBatches = 5;
const maxSubmittedUrlLength = 2048;
const maxSafeErrorLength = 500;
const approvedCorridorSeedTarget = 100;
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

export type ApprovedCorridorSeedProgress = {
  targetApprovedItems: number;
  approvedCorridorItems: number;
  remainingApprovedItems: number;
  isComplete: boolean;
  seedItemStatusCounts: Record<KnowledgeSeedBatchItemStatus, number>;
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
        canonicalUrl = normalized.source.canonicalUrl ?? "";

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

      await transaction.insert(rawSourceMaterial).values({ ...normalized.rawMaterial, sourceId: source.id });
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

export async function getApprovedCorridorSeedProgress(): Promise<ApprovedCorridorSeedProgress> {
  await requireAdminSession();
  const db = getDb();
  const seedItems = await db.select().from(knowledgeSeedBatchItems);
  const derivedStatuses = await deriveStatusesForSourceItems(db, seedItems.filter((row) => row.sourceId));
  const staleStatusUpdates: Array<{ id: string; previousStatus: KnowledgeSeedBatchItemStatus; status: KnowledgeSeedBatchItemStatus }> = [];
  const itemsWithDerivedStatuses: KnowledgeSeedBatchListItem[] = seedItems.map((row) => {
    const status = row.sourceId ? (derivedStatuses.get(row.sourceId) ?? row.status) : row.status;
    if (status !== row.status) {
      staleStatusUpdates.push({ id: row.id, previousStatus: row.status, status });
    }
    return { ...row, status };
  });

  await persistDerivedStatuses(db, staleStatusUpdates);

  const cardRows = await db
    .select({ id: knowledgeCards.id, type: knowledgeCards.type, locationName: knowledgeCards.locationName, routeSegment: knowledgeCards.routeSegment })
    .from(knowledgeCards)
    .innerJoin(knowledgeCardSources, eq(knowledgeCardSources.knowledgeCardId, knowledgeCards.id))
    .where(and(eq(knowledgeCards.status, "approved"), eq(knowledgeCards.needsReview, false)));

  const uniqueEligibleCards = new Map<string, { type: KnowledgeCardType; locationName: string | null; routeSegment: string | null }>();
  for (const row of cardRows) {
    if (!uniqueEligibleCards.has(row.id) && hasCorridorSignal(row.routeSegment, row.locationName)) {
      uniqueEligibleCards.set(row.id, { type: row.type, locationName: row.locationName, routeSegment: row.routeSegment });
    }
  }

  const approvedCorridorItems = uniqueEligibleCards.size;
  return {
    targetApprovedItems: approvedCorridorSeedTarget,
    approvedCorridorItems,
    remainingApprovedItems: Math.max(approvedCorridorSeedTarget - approvedCorridorItems, 0),
    isComplete: approvedCorridorItems >= approvedCorridorSeedTarget,
    seedItemStatusCounts: countStatuses(itemsWithDerivedStatuses),
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
    .select({ sourceId: knowledgeCardSources.sourceId, status: knowledgeCards.status, needsReview: knowledgeCards.needsReview })
    .from(knowledgeCardSources)
    .innerJoin(knowledgeCards, eq(knowledgeCards.id, knowledgeCardSources.knowledgeCardId))
    .where(inArray(knowledgeCardSources.sourceId, sourceIds));

  for (const row of cardRows) {
    const current = derived.get(row.sourceId);
    const next = mapCardStatus(row.status, row.needsReview);
    derived.set(row.sourceId, pickHigherStatus(current, next));
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

function mapCardStatus(status: typeof knowledgeCards.$inferSelect.status, needsReview: boolean): KnowledgeSeedBatchItemStatus {
  if (status === "approved" && needsReview) return "needs_review";
  if (status === "approved") return "approved";
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
    const key = getCorridorBucketLabel(card.routeSegment, card.locationName);
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
