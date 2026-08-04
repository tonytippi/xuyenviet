import { desc, eq, inArray } from "drizzle-orm";
import type { AdminKnowledgeIntake, AdminKnowledgeSeedBatchRequest, AdminKnowledgeSeedBatchResponse, AdminKnowledgeSourceRemovalRequest, AdminKnowledgeSourceRemovalResponse, RequestPrincipal } from "@xuyenviet/contracts";
import type { AdminKnowledgeIntakePort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { knowledgeSeedBatchItems, knowledgeSeedBatches, sources } from "./schema";

export function createPostgresAdminKnowledgeIntakePort(): AdminKnowledgeIntakePort { return { list, submitBatch: submit, removeSource }; }
async function list(): Promise<AdminKnowledgeIntake> {
  const db = getDb();
  const [sourceRows, batches] = await Promise.all([
    db.select({ id: sources.id, url: sources.url, canonicalUrl: sources.canonicalUrl, label: sources.label, kind: sources.kind, eligibility: sources.eligibility, removalReason: sources.removalReason, createdAt: sources.createdAt }).from(sources).where(inArray(sources.kind, ["url", "facebook", "youtube"])).orderBy(desc(sources.createdAt)).limit(100),
    db.select({ id: knowledgeSeedBatches.id, label: knowledgeSeedBatches.label, createdAt: knowledgeSeedBatches.createdAt }).from(knowledgeSeedBatches).orderBy(desc(knowledgeSeedBatches.createdAt)).limit(5),
  ]);
  const batchIds = batches.map((batch) => batch.id);
  const items = batchIds.length ? await db.select({ batchId: knowledgeSeedBatchItems.batchId, lineNumber: knowledgeSeedBatchItems.lineNumber, status: knowledgeSeedBatchItems.status, submittedUrl: knowledgeSeedBatchItems.submittedUrl, canonicalUrl: knowledgeSeedBatchItems.canonicalUrl, errorSummary: knowledgeSeedBatchItems.errorSummary }).from(knowledgeSeedBatchItems).where(inArray(knowledgeSeedBatchItems.batchId, batchIds)) : [];
  const statuses = ["pending", "reading", "extracted", "needs_review", "approved", "failed", "duplicate", "rejected"] as const;
  return { sources: sourceRows.map((source) => ({ id: source.id, displayUrl: source.eligibility === "eligible" ? source.canonicalUrl ?? source.url : null, displayTitle: source.label, kind: source.kind as "url" | "facebook" | "youtube", eligibility: source.eligibility, removalReason: source.removalReason, createdAt: source.createdAt.toISOString() })), recentBatches: batches.map((batch) => { const rows = items.filter((item) => item.batchId === batch.id); return { id: batch.id, label: batch.label, createdAt: batch.createdAt.toISOString(), counts: Object.fromEntries(statuses.map((status) => [status, rows.filter((item) => item.status === status).length])) as Record<typeof statuses[number], number>, items: rows.map((item) => ({ lineNumber: item.lineNumber, status: item.status, displayUrl: item.canonicalUrl ?? item.submittedUrl, errorSummary: item.errorSummary })) }; }) };
}
async function submit(_actor: RequestPrincipal, _input: AdminKnowledgeSeedBatchRequest): Promise<AdminKnowledgeSeedBatchResponse> { throw new Error("Knowledge intake creation requires the Story 15.3 lifecycle command."); }
async function removeSource(_actor: RequestPrincipal, _sourceId: string, _input: AdminKnowledgeSourceRemovalRequest): Promise<AdminKnowledgeSourceRemovalResponse> { throw new Error("Source removal lifecycle transitions require the Story 15.3 command."); }
