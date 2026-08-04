import { desc, inArray } from "drizzle-orm";
import type { AdminKnowledgeIntake, AdminKnowledgeSeedBatchRequest, AdminKnowledgeSeedBatchResponse, AdminKnowledgeSourceRemovalRequest, AdminKnowledgeSourceRemovalResponse, RequestPrincipal } from "@xuyenviet/contracts";
import type { AdminKnowledgeIntakePort } from "@xuyenviet/domain";
import { getDb } from "./client";
import { sources } from "./schema";

export function createPostgresAdminKnowledgeIntakePort(): AdminKnowledgeIntakePort { return { list, submitBatch: submit, removeSource }; }
async function list(): Promise<AdminKnowledgeIntake> {
  const db = getDb();
  const sourceRows = await db.select({ id: sources.id, url: sources.url, canonicalUrl: sources.canonicalUrl, label: sources.label, kind: sources.kind, eligibility: sources.eligibility, removalReason: sources.removalReason, createdAt: sources.createdAt }).from(sources).where(inArray(sources.kind, ["url", "facebook", "youtube"])).orderBy(desc(sources.createdAt)).limit(100);
  return { sources: sourceRows.map((source) => ({ id: source.id, displayUrl: source.eligibility === "eligible" ? source.canonicalUrl ?? source.url : null, displayTitle: source.label, kind: source.kind as "url" | "facebook" | "youtube", eligibility: source.eligibility, removalReason: source.removalReason, createdAt: source.createdAt.toISOString() })) };
}
async function submit(_actor: RequestPrincipal, _input: AdminKnowledgeSeedBatchRequest): Promise<AdminKnowledgeSeedBatchResponse> { throw new Error("Knowledge intake creation requires the Story 15.3 lifecycle command."); }
async function removeSource(_actor: RequestPrincipal, _sourceId: string, _input: AdminKnowledgeSourceRemovalRequest): Promise<AdminKnowledgeSourceRemovalResponse> { throw new Error("Source removal lifecycle transitions require the Story 15.3 command."); }
