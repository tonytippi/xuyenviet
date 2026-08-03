import postgres from "postgres";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { resolvePlanningAnnotationCapabilities, sanitizeStoredPlanningAnnotations, type AiAskStreamExecutionPort, type PlanningReadRepository, type UserRoleGovernancePort, type UserRoleGovernanceTransactionPort, UserRoleGovernancePolicyError } from "@xuyenviet/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { loadAnswerContext } from "./answer-context";
import { formatAssistantMessageProvenance } from "./provenance";
import { answerUsefulnessFeedback, assistantResponseProvenance, conversations, messages, tripChangeProposals, tripPlanChangeHistory, tripPlanItems, tripProjectConstraints, tripProjects, users } from "./schema";
import { adminUserRosterPageSize, encodeAdminUserRosterCursor, evaluateSchemaAdmission, parsePlanningAnswerDetailResponse, planningDetailProvenanceLimit, type AdminIdentityHandoff, type PlanningJsonValue, type PlanningProvenance, type RequestRole, type SchemaCompatibilityDeclaration, type TravelerShellProjection, type TripAnswerContextResponse } from "@xuyenviet/contracts";
import { createAiAskStreamExecutionPort } from "./ai-ask-stream-execution";
import { discardAiAskCommandsForDeletedConversations } from "./ai-ask-commands";
import { recordAuditEvent } from "./audit-writers";
import { toUserAuditActor } from "./actors";
import type { TravelerCommandPort } from "@xuyenviet/domain";

const answerUsefulnessCommentMaxLength = 500;

export * from "./ai-ask-commands";
export * from "./ai-ask-stream-execution";
export * from "./answer-context";
export * from "./answer-freshness";
export * from "./approved-knowledge";
export * from "./assistant-provenance-withdrawal";
export * from "./audit-writers";
export * from "./actors";
export * from "./client";
export * from "./domain-outbox";
export * from "./gateway";
export * from "./knowledge-search";
export * from "./knowledge-indexing-queue";
export * from "./knowledge-state";
export * from "./models";
export * from "./prompts";
export * from "./provenance";
export * from "./schema";
export * from "./source-bundle";
export * from "./usage";
export * from "./usage-constants";
export * from "./usage-events";
export * from "./web-search";
export * from "./trip-plan-commands";
export * from "./plan-references";
export * from "./traveler-proposal-commands";

export type ApiIdentityRecord = {
  userId: string;
  expires: Date;
  authorizationVersion: number;
};

export interface ApiIdentityRepository {
  getSession(sessionId: string): Promise<ApiIdentityRecord | null>;
  getAdminSession?(sessionId: string): Promise<ApiIdentityRecord | null>;
}
export type BrowserIdentity = ApiIdentityRecord & { roles: RequestRole[]; csrfHash: string; sessionId: string };
export type BrowserOAuthTransaction = { id: string; state: string; codeVerifier: string; returnUrl: string; referralCode?: string | null; expires: Date };
export class BrowserGoogleAccountConflictError extends Error {}
export interface BrowserIdentityRepository extends ApiIdentityRepository {
  purgeExpiredBrowserOAuthTransactions(limit: number): Promise<void>;
  createBrowserOAuthTransaction(transaction: BrowserOAuthTransaction): Promise<void>;
  consumeBrowserOAuthTransaction(id: string, state: string): Promise<BrowserOAuthTransaction | null>;
  resolveOrCreateBrowserGoogleUser(subject: string, email: string, name: string | null, image: string | null, referralCode: string | null): Promise<{ userId: string; authorizationVersion: number }>;
  createBrowserSession(userId: string, sessionId: string, csrfHash: string, authorizationVersion: number, expires: Date): Promise<void>;
  getBrowserSession(sessionId: string): Promise<BrowserIdentity | null>;
  getBrowserLogoutCsrfHash(sessionId: string): Promise<string | null>;
  renewBrowserSession(sessionId: string, expires: Date): Promise<boolean>;
  revokeBrowserSession(sessionId: string): Promise<void>;
}

export interface AdminIdentityRepository extends ApiIdentityRepository {
  resolveAdminHandoff(sessionId: string, subject?: string): Promise<AdminIdentityHandoff | null>;
  revokeAdminSession(sessionId: string): Promise<void>;
  purgeExpiredAdminOAuthTransactions(limit: number): Promise<void>;
  createAdminOAuthTransaction(transaction: AdminOAuthTransaction): Promise<void>;
  consumeAdminOAuthTransaction(id: string, state: string): Promise<AdminOAuthTransaction | null>;
  provisionConfiguredAdminRoleForGoogleAccount(providerAccountId: string, email: string): Promise<void>;
  resolveAdminRolesForGoogleAccount(providerAccountId: string): Promise<RequestRole[] | null>;
  createAdminSessionForGoogleAccount(providerAccountId: string, expires: Date): Promise<string | null>;
}
export type AdminOAuthTransaction = { id: string; state: string; codeVerifier: string; callbackUrl: string; expires: Date };

export type StoredConversationSummaryRow = { id: string; updatedAt: Date; messageContent: string | null };
export type ReleaseSchemaVersionRepository = {
  hasCompatibleSchemaVersion(declaration: SchemaCompatibilityDeclaration): Promise<boolean>;
  getResolvedTargetIdentity?(): Promise<string>;
  readSchemaAdmission?(): Promise<{ rows: Array<{ version: string }>; resolvedTargetIdentity: string }>;
  recordSchemaVersion(version: string): Promise<void>;
  close?(): Promise<void>;
};
export interface ConversationSummaryRepository {
  listOwnedConversationSummaryRows(userId: string, limit: number): Promise<StoredConversationSummaryRow[]>;
}
export interface TravelerShellRepository {
  loadOwnedTravelerShell(userId: string, conversationId?: string, tripProjectId?: string): Promise<TravelerShellProjection>;
}

export function createPostgresConversationSummaryRepository(databaseUrl: string): ConversationSummaryRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async listOwnedConversationSummaryRows(userId, limit) {
      return sql<StoredConversationSummaryRow[]>`
        select selected.id, selected.updated_at as "updatedAt", preview.content as "messageContent"
        from (
          select id, updated_at
          from conversations
          where user_id = ${userId} and trip_project_id is null
          order by updated_at desc, id desc
          limit ${limit}
        ) selected
        left join lateral (
          select content
          from messages
          where conversation_id = selected.id and user_id = ${userId} and role = 'user'
          order by created_at asc, id asc
          limit 1
        ) preview on true
        order by selected.updated_at desc, selected.id desc
      `;
    },
  };
}

export function createPostgresTravelerShellRepository(): TravelerShellRepository {
  return {
    async loadOwnedTravelerShell(userId, conversationId, tripProjectId) {
      const db = (await import("./client")).getDb();
      const [project] = tripProjectId ? await db.select({ id: tripProjects.id, title: tripProjects.title, origin: tripProjects.origin, destination: tripProjects.destination, startDate: tripProjects.startDate, endDate: tripProjects.endDate, travelers: tripProjects.travelers, primaryConversationId: tripProjects.primaryConversationId }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1) : [];
      const selectedConversationId = project?.primaryConversationId ?? conversationId;
      const [conversation] = selectedConversationId ? await db.select({ id: conversations.id, tripProjectId: conversations.tripProjectId }).from(conversations).where(and(eq(conversations.id, selectedConversationId), eq(conversations.userId, userId))).limit(1) : [];
      if (project && (!conversation || conversation.tripProjectId !== project.id)) return { conversation: null, tripProject: null, workspace: null };
      // The API contract exposes at most 200 messages. Select the latest window
      // first, then restore chronological order for the rendered conversation.
      const recentMessages = conversation ? await db.select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, userId))).orderBy(desc(messages.createdAt), desc(messages.id)).limit(200) : [];
      const ownedMessages = recentMessages.reverse();
      if (project) await db.transaction(async (transaction) => {
        const elapsed = await transaction.select({ id: tripChangeProposals.id }).from(tripChangeProposals).where(and(eq(tripChangeProposals.tripProjectId, project.id), eq(tripChangeProposals.userId, userId), eq(tripChangeProposals.status, "pending"), sql`${tripChangeProposals.expiresAt} is not null and ${tripChangeProposals.expiresAt} <= now()`));
        const { expireTripChangeProposalInTransaction } = await import("./traveler-proposal-commands");
        for (const proposal of elapsed) await expireTripChangeProposalInTransaction(transaction, { tripProjectId: project.id, proposalId: proposal.id });
      });
      const proposalRows = project ? await db.select({ id: tripChangeProposals.id, rationale: tripChangeProposals.rationale, expiresAt: tripChangeProposals.expiresAt, createdAt: tripChangeProposals.createdAt, operations: tripChangeProposals.operations, alternatives: tripChangeProposals.alternatives }).from(tripChangeProposals).where(and(eq(tripChangeProposals.tripProjectId, project.id), eq(tripChangeProposals.userId, userId), eq(tripChangeProposals.status, "pending"), sql`(${tripChangeProposals.expiresAt} is null or ${tripChangeProposals.expiresAt} > now())`)).orderBy(asc(tripChangeProposals.createdAt), asc(tripChangeProposals.id)).limit(20) : [];
      const items = project ? await db.select({ id: tripPlanItems.id, kind: tripPlanItems.kind, anchorRole: tripPlanItems.anchorRole, type: tripPlanItems.type, label: tripPlanItems.label, notes: tripPlanItems.notes, ordinal: tripPlanItems.ordinal, state: tripPlanItems.state, plannedAt: tripPlanItems.plannedAt, parentItemId: tripPlanItems.parentItemId, transportOriginLabel: tripPlanItems.transportOriginLabel, transportDestinationLabel: tripPlanItems.transportDestinationLabel, accommodationPlaceAreaLabel: tripPlanItems.accommodationPlaceAreaLabel, createdAt: tripPlanItems.createdAt }).from(tripPlanItems).where(and(eq(tripPlanItems.tripProjectId, project.id), eq(tripPlanItems.userId, userId))).orderBy(asc(tripPlanItems.ordinal), asc(tripPlanItems.id)).limit(60) : [];
      const pendingProposals = proposalRows.map((proposal) => projectPendingProposal(proposal, items));
      const first = pendingProposals.filter((proposal) => !proposal.expiresAt || new Date(proposal.expiresAt).getTime() > Date.now()).sort((left, right) => (left.expiresAt ?? left.createdAt).localeCompare(right.expiresAt ?? right.createdAt))[0];
      const [constraint] = project ? await db.select().from(tripProjectConstraints).where(and(eq(tripProjectConstraints.tripProjectId, project.id), eq(tripProjectConstraints.userId, userId))).limit(1) : [];
      const history = project ? await db.select({ proposalId: tripPlanChangeHistory.proposalId, operationClass: tripPlanChangeHistory.operationClass, actorClass: tripPlanChangeHistory.actorClass, actorSystem: tripPlanChangeHistory.actorSystem, affected: tripPlanChangeHistory.affectedItemReferences, summary: tripPlanChangeHistory.safeBeforeAfterSummary, createdAt: tripPlanChangeHistory.createdAt }).from(tripPlanChangeHistory).where(and(eq(tripPlanChangeHistory.tripProjectId, project.id), eq(tripPlanChangeHistory.userId, userId))).orderBy(desc(tripPlanChangeHistory.createdAt)).limit(20) : [];
      return {
        conversation: conversation ? { ...conversation, messages: ownedMessages.map((message) => ({ ...message, content: message.content ?? "" })) } : null,
        tripProject: project ? project : null,
        workspace: project ? { focus: first ? { kind: first.expiresAt ? "pending-proposal-with-expiry" : "pending-proposal", proposalId: first.id, reason: first.rationale ?? "Có đề xuất thay đổi kế hoạch", sortKey: `0|${first.id}` } : { kind: "preparation", reason: "Chuẩn bị cho chuyến đi", sortKey: "5|" }, timelineGroups: [{ dateDivider: null, legId: null, entries: items.map((item) => ({ id: item.id, kind: item.kind, anchorRole: item.anchorRole, type: item.type, state: item.state, stateLabel: item.state, typeLabel: item.type ?? item.kind, label: item.label, plannedAt: item.plannedAt?.toISOString() ?? null, timeContext: item.plannedAt?.toISOString() ?? null, placeContext: item.type === "transport" ? [item.transportOriginLabel, item.transportDestinationLabel].filter(Boolean).join(" → ").slice(0, 500) || null : item.accommodationPlaceAreaLabel?.slice(0, 500) ?? null, notesPreview: item.notes?.slice(0, 80) ?? null, parentItemId: item.parentItemId, ordinal: item.ordinal, depth: item.parentItemId ? 1 : 0 })) }], constraints: constraint ? { adultCount: constraint.adultCount, childCount: constraint.childCount, childrenSummary: workspaceChildren(constraint.children), vehicleType: constraint.vehicleType === "car" || constraint.vehicleType === "motorcycle" || constraint.vehicleType === "ev" ? constraint.vehicleType : null, evChargingNeed: constraint.evChargingNeed === "none" || constraint.evChargingNeed === "preferred" || constraint.evChargingNeed === "required" ? constraint.evChargingNeed : null, drivingToleranceHours: constraint.drivingToleranceHours, budgetCurrency: constraint.budgetCurrency === "VND" ? "VND" : null, budgetMinVnd: constraint.budgetMinVnd, budgetMaxVnd: constraint.budgetMaxVnd, preferenceTags: workspacePreferenceTags(constraint.preferenceTags), avoidItems: workspaceAvoidItems(constraint.avoidItems) } : null, planHistory: history.map((row) => ({ proposalId: row.proposalId, operationLabel: row.operationClass, actorLabel: row.actorClass === "system" ? "Hệ thống" : "Bạn", timestampLabel: row.createdAt.toISOString(), affectedItemLabels: workspaceHistoryLabels(row.affected), beforeAfter: isHistoryEntries(row.summary) })), pendingProposals } : null,
      };
    },
  };
}

export function createPostgresTravelerCommandPort(): TravelerCommandPort {
  return {
    async createTripProject(userId, input) {
      const title = input.title.trim();
      const optional = (value: string | null | undefined, max: number) => {
        const normalized = value?.trim();
        if (!normalized) return null;
        return normalized.length <= max ? normalized : undefined;
      };
      const startDate = optional(input.startDate, 10);
      const endDate = optional(input.endDate, 10);
      const origin = optional(input.origin, 500);
      const destination = optional(input.destination, 500);
      const travelers = optional(input.travelers, 500);
      const notes = optional(input.notes, 2_000);
      if (!title || title.length > 160 || [startDate, endDate, origin, destination, travelers, notes].some((value) => value === undefined) || startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(Date.parse(startDate))) || endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(endDate))) || startDate && endDate && startDate > endDate) return { success: false, reason: "invalid_input" };
      try {
        const project = await (await import("./client")).getDb().transaction(async (transaction) => {
          const [actor] = await transaction.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
          if (!actor?.email) throw new Error("Audit actor unavailable.");
          const [created] = await transaction.insert(tripProjects).values({ userId, title, origin, destination, startDate, endDate, travelers, notes }).returning();
          await recordAuditEvent({ actor: toUserAuditActor({ userId, email: actor.email }), operation: "create", targetType: "trip_project", targetId: created!.id, afterSummary: JSON.stringify({ titleLength: created!.title.length, hasOrigin: Boolean(created!.origin), hasDestination: Boolean(created!.destination), hasStartDate: Boolean(created!.startDate), hasEndDate: Boolean(created!.endDate), hasTravelers: Boolean(created!.travelers), hasNotes: Boolean(created!.notes) }) }, transaction);
          return created!;
        });
        return { success: true, project: { id: project.id, title: project.title, origin: project.origin, destination: project.destination, startDate: project.startDate, endDate: project.endDate, travelers: project.travelers, notes: project.notes, updatedAt: project.updatedAt.toISOString() } };
      } catch { return { success: false, reason: "failed" }; }
    },
    async deleteConversation(userId, conversationId) {
      if (!validTravelerIdentifier(conversationId)) return { success: false, reason: "not_found" };
      try {
        return await (await import("./client")).getDb().transaction(async (transaction) => {
           const [actor] = await transaction.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1); if (!actor?.email) throw new Error("Audit actor unavailable.");
           const [conversation] = await transaction.select({ id: conversations.id, tripProjectId: conversations.tripProjectId }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1).for("update");
          if (!conversation) return { success: false, reason: "not_found" } as const;
           if (conversation.tripProjectId) {
            const [project] = await transaction.select({ id: tripProjects.id, primaryConversationId: tripProjects.primaryConversationId }).from(tripProjects).where(and(eq(tripProjects.id, conversation.tripProjectId), eq(tripProjects.userId, userId))).limit(1).for("update");
            if (project?.primaryConversationId === conversation.id) {
              const [next] = await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, userId), sql`${conversations.id} <> ${conversation.id}`)).orderBy(desc(conversations.updatedAt), desc(conversations.id)).limit(1);
              const replacement = next ?? (await transaction.insert(conversations).values({ userId, tripProjectId: project.id }).returning({ id: conversations.id }))[0]!;
              await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(eq(conversations.id, replacement.id));
              await transaction.update(tripProjects).set({ primaryConversationId: replacement.id, aggregateVersion: sql`${tripProjects.aggregateVersion} + 1`, updatedAt: new Date() }).where(eq(tripProjects.id, project.id));
             }
           }
           await discardAiAskCommandsForDeletedConversations(transaction, userId, [conversation.id]);
           await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
          const deleted = await transaction.delete(conversations).where(and(eq(conversations.id, conversation.id), eq(conversations.userId, userId))).returning({ id: conversations.id });
          if (deleted.length !== 1) return { success: false, reason: "not_found" } as const;
           await recordAuditEvent({ actor: toUserAuditActor({ userId, email: actor.email }), operation: "delete", targetType: "conversation", targetId: conversation.id, afterSummary: JSON.stringify({ deleted: true }) }, transaction);
          return { success: true } as const;
        });
      } catch { return { success: false, reason: "failed" }; }
    },
    async deleteTripProject(userId, tripProjectId) {
      if (!validTravelerIdentifier(tripProjectId)) return { success: false, reason: "not_found" };
      try {
        return await (await import("./client")).getDb().transaction(async (transaction) => {
          const [actor] = await transaction.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1); if (!actor?.email) throw new Error("Audit actor unavailable.");
          const [project] = await transaction.select({ id: tripProjects.id }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1).for("update");
          if (!project) return { success: false, reason: "not_found" } as const;
          const linkedConversations = await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, userId))).for("update");
          const linkedConversationCount = linkedConversations.length;
          await transaction.update(tripProjects).set({ primaryConversationId: null, aggregateVersion: sql`${tripProjects.aggregateVersion} + 1`, updatedAt: new Date() }).where(eq(tripProjects.id, project.id));
          await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, userId)));
          await discardAiAskCommandsForDeletedConversations(transaction, userId, linkedConversations.map((conversation) => conversation.id));
          await transaction.delete(conversations).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, userId)));
          const deleted = await transaction.delete(tripProjects).where(and(eq(tripProjects.id, project.id), eq(tripProjects.userId, userId))).returning({ id: tripProjects.id });
          if (deleted.length !== 1) return { success: false, reason: "not_found" } as const;
           await recordAuditEvent({ actor: toUserAuditActor({ userId, email: actor.email }), operation: "delete", targetType: "trip_project", targetId: project.id, afterSummary: JSON.stringify({ deleted: true, linkedConversationCount }) }, transaction);
          return { success: true } as const;
        });
      } catch { return { success: false, reason: "failed" }; }
    },
    async saveAnswerUsefulnessFeedback(userId, input) {
      const comment = input.comment?.trim() || null;
      if (comment && Array.from(comment).length > answerUsefulnessCommentMaxLength) return { success: false, reason: "comment_too_long" };
      try {
        return await (await import("./client")).getDb().transaction(async (transaction) => {
          const [message] = await transaction.select({ id: messages.id, conversationId: messages.conversationId, role: messages.role }).from(messages).where(and(eq(messages.id, input.assistantMessageId), eq(messages.userId, userId))).limit(1).for("update");
          if (!message) return { success: false, reason: "not_found" } as const;
          if (message.role !== "assistant") return { success: false, reason: "invalid_target" } as const;
          const [feedback] = await transaction.insert(answerUsefulnessFeedback).values({ userId, conversationId: message.conversationId, assistantMessageId: message.id, rating: input.rating, comment }).onConflictDoUpdate({ target: [answerUsefulnessFeedback.assistantMessageId, answerUsefulnessFeedback.userId], set: { rating: input.rating, comment, updatedAt: sql`now()` } }).returning({ rating: answerUsefulnessFeedback.rating, comment: answerUsefulnessFeedback.comment, updatedAt: answerUsefulnessFeedback.updatedAt });
          return { success: true, feedback: { rating: feedback!.rating, comment: feedback!.comment, updatedAt: feedback!.updatedAt.toISOString() } } as const;
        });
      } catch { return { success: false, reason: "failed" }; }
    },
    async applyTripChangeProposal(userId, input) {
      try { const result = await import("./traveler-proposal-commands").then(({ applyTripChangeProposal }) => applyTripChangeProposal(userId, input)); return result.success ? { success: true, aggregateVersion: result.aggregateVersion, proposalStatus: "applied" } : result; } catch { return { success: false, reason: "failed" }; }
    },
    async dismissTripChangeProposal(userId, input) {
      try { const result = await import("./traveler-proposal-commands").then(({ dismissTripChangeProposal }) => dismissTripChangeProposal(userId, input)); return result.success ? { success: true, proposalStatus: "dismissed" } : result; } catch { return { success: false, reason: "failed" }; }
    },
    async executeAnnotationProposalAction(userId, input) {
      try { const result = await import("./traveler-proposal-commands").then(({ executeAnnotationProposalAction }) => executeAnnotationProposalAction(userId, input)); return result.success ? "aggregateVersion" in result ? { success: true, aggregateVersion: result.aggregateVersion as number, proposalStatus: "applied" } : { success: true, proposalStatus: "dismissed" } : result; } catch { return { success: false, reason: "failed" }; }
    },
  };
}

function validTravelerIdentifier(value: string) { return value.length > 0 && value.length <= 128 && value.trim() === value; }

function projectPendingProposal(proposal: { id: string; rationale: string; expiresAt: Date | null; createdAt: Date; operations: unknown; alternatives: unknown }, items: Array<{ id: string; kind: "anchor" | "leg" | "activity"; label: string; ordinal: number; state: string }>) {
  const byId = new Map(items.map((item) => [item.id, item])); const operations = Array.isArray(proposal.operations) ? proposal.operations : [];
  const affectedItems: Array<{ itemId: string; kind: "anchor" | "leg" | "activity"; label: string; change: "create" | "update" | "remove" | "reorder" | "change-state" | "upsert-constraints" }> = [];
  const beforeAfter: Array<{ operation: string; before: string | null; after: string | null }> = [];
  for (const raw of operations.slice(0, 20)) { if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue; const op = raw as Record<string, unknown>; const item = typeof op.itemId === "string" ? byId.get(op.itemId) : undefined; if (op.kind === "create-item" && op.item && typeof op.item === "object" && !Array.isArray(op.item)) { const draft = op.item as Record<string, unknown>; if (typeof draft.label === "string" && (draft.kind === "anchor" || draft.kind === "leg" || draft.kind === "activity")) { affectedItems.push({ itemId: "(mới)", kind: draft.kind, label: draft.label.slice(0, 160), change: "create" }); beforeAfter.push({ operation: "Tạo mục mới", before: null, after: draft.label.slice(0, 160) }); } } else if (op.kind === "upsert-constraints") { affectedItems.push({ itemId: "constraints", kind: "activity", label: "Ràng buộc", change: "upsert-constraints" }); beforeAfter.push({ operation: "Cập nhật ràng buộc", before: null, after: null }); } else if (item && typeof op.kind === "string") { const change = op.kind === "update-item" ? "update" : op.kind === "remove-item" ? "remove" : op.kind === "reorder-item" ? "reorder" : op.kind === "change-item-state" ? "change-state" : null; if (!change) continue; affectedItems.push({ itemId: item.id, kind: item.kind, label: item.label, change }); beforeAfter.push({ operation: change === "remove" ? "Xoá mục" : change === "reorder" ? `Sắp xếp lại · ${item.label}` : change === "change-state" ? `Đổi trạng thái · ${item.label}` : `Cập nhật · ${item.label}`, before: change === "reorder" ? `vị trí ${item.ordinal}` : change === "remove" ? item.label : change === "change-state" ? item.state : null, after: change === "reorder" && typeof op.ordinal === "number" ? `vị trí ${op.ordinal}` : change === "change-state" && typeof op.state === "string" ? op.state : null }); } }
  const alternatives = Array.isArray(proposal.alternatives) ? proposal.alternatives.flatMap((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && typeof (entry as Record<string, unknown>).summary === "string" ? [{ summary: ((entry as Record<string, unknown>).summary as string).slice(0, 280) }] : []).slice(0, 5) : [];
  return { id: proposal.id, expiresAt: proposal.expiresAt?.toISOString() ?? null, createdAt: proposal.createdAt.toISOString(), rationale: proposal.rationale, status: "pending" as const, affectedItems, beforeAfter, alternatives, hasAlternatives: alternatives.length > 0 };
}
function isHistoryEntries(value: unknown): Array<{ operation: string; before: string | null; after: string | null }> { const entries: unknown[] = value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>).entries) ? (value as Record<string, unknown>).entries as unknown[] : []; const text = (item: unknown, maximum: number) => typeof item === "string" ? item.trim().slice(0, maximum) || null : null; return entries.slice(0, 20).flatMap((entry: unknown) => { if (!entry || typeof entry !== "object" || Array.isArray(entry)) return []; const item = entry as Record<string, unknown>; const operation = text(item.operation, 500); return operation ? [{ operation, before: text(item.before, 1_000), after: text(item.after, 1_000) }] : []; }); }
function workspaceHistoryLabels(value: unknown): string[] { return Array.isArray(value) ? value.slice(0, 20).flatMap((item) => item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).label === "string" ? [((item as Record<string, unknown>).label as string).trim().slice(0, 160)].filter(Boolean) : []) : []; }
function workspaceChildren(value: unknown): Array<{ ageRange: string | null; comfortTags: string[]; preferenceTags: string[] }> { return Array.isArray(value) ? value.slice(0, 10).flatMap((child) => { if (!child || typeof child !== "object" || Array.isArray(child)) return []; const item = child as Record<string, unknown>; if (!Number.isInteger(item.ageMin) || !Number.isInteger(item.ageMax) || (item.ageMin as number) < 0 || (item.ageMax as number) > 17 || (item.ageMin as number) > (item.ageMax as number)) return []; const tags = (tags: unknown) => Array.isArray(tags) ? tags.slice(0, 6).flatMap((tag) => typeof tag === "string" && tag.trim() === tag && tag.length > 0 && tag.length <= 160 ? [tag] : []) : []; const ageMin = item.ageMin as number; const ageMax = item.ageMax as number; return [{ ageRange: ageMin === ageMax ? `${ageMin} tuổi` : `${ageMin}-${ageMax} tuổi`, comfortTags: tags(item.comfortTags), preferenceTags: tags(item.preferenceTags) }]; }) : []; }
function workspacePreferenceTags(value: unknown): string[] { return Array.isArray(value) ? value.slice(0, 20).flatMap((tag) => typeof tag === "string" && tag.trim() === tag && tag.length > 0 && tag.length <= 160 ? [tag] : []) : []; }
function workspaceAvoidItems(value: unknown): Array<{ category: "place" | "activity"; label: string }> { return Array.isArray(value) ? value.slice(0, 20).flatMap((item) => { if (!item || typeof item !== "object" || Array.isArray(item)) return []; const entry = item as Record<string, unknown>; return (entry.category === "place" || entry.category === "activity") && typeof entry.label === "string" && entry.label.trim() === entry.label && entry.label.length > 0 && entry.label.length <= 120 ? [{ category: entry.category, label: entry.label }] : []; }) : []; }

export function createPostgresReleaseSchemaVersionRepository(databaseUrl: string): ReleaseSchemaVersionRepository {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async hasCompatibleSchemaVersion(version) {
      const rows = await sql<{ version: string }[]>`select version from release_schema_versions`;
      return evaluateSchemaAdmission(version, rows).compatible;
    },
    async getResolvedTargetIdentity() {
      const [target] = await sql<{ identity: string }[]>`select 'database=' || current_database() || ';host=' || coalesce(host(inet_server_addr()), 'local') || ';port=' || coalesce(inet_server_port()::text, '5432') as identity`;
      if (!target?.identity) throw new Error("Could not resolve database target identity.");
      return target.identity;
    },
    async readSchemaAdmission() {
      const rows = await sql<{ version: string | null; identity: string }[]>`select release_schema_versions.version, target.identity from (select 'database=' || current_database() || ';host=' || coalesce(host(inet_server_addr()), 'local') || ';port=' || coalesce(inet_server_port()::text, '5432') as identity) target left join release_schema_versions on true`;
      const identity = rows[0]?.identity;
      if (typeof identity !== "string") throw new Error("Could not resolve database target identity.");
      return { rows: rows.flatMap((row) => typeof row.version === "string" ? [{ version: row.version }] : []), resolvedTargetIdentity: identity };
    },
    async recordSchemaVersion(version) {
      await sql.begin(async (transaction) => {
        await transaction`select pg_advisory_xact_lock(918_040_004)`;
        await transaction`delete from release_schema_versions`;
        await transaction`insert into release_schema_versions (version) values (${version})`;
      });
    },
    async close() { await sql.end({ timeout: 5 }); },
  };
}

export function createPostgresApiIdentityRepository(databaseUrl: string, adminSessionLookupKey: string, browserSessionLookupKey = adminSessionLookupKey, browserOAuthTransactionProtectionKey?: string): AdminIdentityRepository & BrowserIdentityRepository {
  if (adminSessionLookupKey.length < 32) throw new Error("Admin session lookup key is invalid.");
  if (browserOAuthTransactionProtectionKey !== undefined && browserOAuthTransactionProtectionKey.length < 32) throw new Error("Browser OAuth transaction protection key is invalid.");
  const sql = postgres(databaseUrl, { max: 1 });
  const lookupHash = (sessionId: string) => createHmac("sha256", adminSessionLookupKey).update(sessionId).digest("base64url");
  const browserLookupHash = (sessionId: string) => createHmac("sha256", browserSessionLookupKey).update(sessionId).digest("base64url");
  const oauthTransactionProtection = browserOAuthTransactionProtectionKey ? createBrowserOAuthTransactionProtection(browserOAuthTransactionProtectionKey) : null;
  return {
    async getSession(sessionId) {
      const rows = await sql<ApiIdentityRecord[]>`
        select sessions.user_id as "userId", sessions.expires, users.authorization_version as "authorizationVersion"
        from sessions join users on users.id = sessions.user_id
        where sessions.session_token = ${sessionId}
        limit 1
      `;
      return rows[0] ?? null;
    },
    async getAdminSession(sessionId) {
      const rows = await sql<ApiIdentityRecord[]>`
        select admin_sessions.user_id as "userId", admin_sessions.expires, users.authorization_version as "authorizationVersion"
        from admin_sessions join users on users.id = admin_sessions.user_id
        where admin_sessions.session_lookup_hash = ${lookupHash(sessionId)} and admin_sessions.revoked_at is null
        limit 1
      `;
      return rows[0] ?? null;
    },
    async resolveAdminHandoff(sessionId, subject) {
      const rows = await sql<Array<{ userId: string; expires: Date; authorizationVersion: number; role: RequestRole }>>`
        select admin_sessions.user_id as "userId", admin_sessions.expires, users.authorization_version as "authorizationVersion", user_roles.role
        from admin_sessions join users on users.id = admin_sessions.user_id join user_roles on user_roles.user_id = users.id
        where admin_sessions.session_lookup_hash = ${lookupHash(sessionId)} and admin_sessions.revoked_at is null
      `;
      if (!rows.length || rows[0]!.expires <= new Date() || subject !== undefined && rows[0]!.userId !== subject) return null;
      const roles = [...new Set(rows.map((row) => row.role))].sort();
      if (!roles.includes("operator") && !roles.includes("admin")) return null;
      return { subject: rows[0]!.userId, sessionId, authorizationVersion: rows[0]!.authorizationVersion, roles };
    },
    async revokeAdminSession(sessionId) { await sql`update admin_sessions set revoked_at = now() where session_lookup_hash = ${lookupHash(sessionId)} and revoked_at is null`; },
    async purgeExpiredAdminOAuthTransactions(limit) {
      await sql`delete from admin_oauth_transactions where id in (select id from admin_oauth_transactions where expires <= now() order by expires asc limit ${limit})`;
    },
    async createAdminOAuthTransaction(transaction) {
      await sql`insert into admin_oauth_transactions (id, state, code_verifier, callback_url, expires) values (${transaction.id}, ${transaction.state}, ${transaction.codeVerifier}, ${transaction.callbackUrl}, ${transaction.expires})`;
    },
    async consumeAdminOAuthTransaction(id, state) {
      const rows = await sql<AdminOAuthTransaction[]>`delete from admin_oauth_transactions where id = ${id} and state = ${state} and expires > now() returning id, state, code_verifier as "codeVerifier", callback_url as "callbackUrl", expires`;
      return rows[0] ?? null;
    },
    async provisionConfiguredAdminRoleForGoogleAccount(providerAccountId, email) {
      await sql.begin(async (transaction) => {
        const accounts = await transaction<{ userId: string }[]>`
          select users.id as "userId"
          from accounts join users on users.id = accounts.user_id
          where accounts.provider = 'google' and accounts.provider_account_id = ${providerAccountId}
          limit 1
          for update
        `;
        let userId = accounts[0]?.userId;
        if (!userId) {
          const users = await transaction<{ id: string }[]>`insert into users (id, email) values (${randomUUID()}, ${email}) on conflict (email) do update set email = excluded.email returning id`;
          userId = users[0]?.id;
          if (!userId) throw new Error("Google account user could not be created.");
          await transaction`insert into accounts (user_id, type, provider, provider_account_id) values (${userId}, 'oauth', 'google', ${providerAccountId}) on conflict do nothing`;
        }
        const users = await transaction<{ email: string | null }[]>`select email from users where id = ${userId} for update`;
        if (users[0]?.email?.trim().toLowerCase() !== email) return;
        const granted = await transaction`insert into user_roles (user_id, role) values (${userId}, 'admin') on conflict do nothing returning user_id`;
        if (granted.length) await transaction`update users set authorization_version = authorization_version + 1 where id = ${userId}`;
      });
    },
    async resolveAdminRolesForGoogleAccount(providerAccountId) {
      const rows = await sql<{ role: RequestRole }[]>`
        select user_roles.role
        from accounts join user_roles on user_roles.user_id = accounts.user_id
        where accounts.provider = 'google' and accounts.provider_account_id = ${providerAccountId}
      `;
      return rows.length ? [...new Set(rows.map((row) => row.role))].sort() : null;
    },
    async createAdminSessionForGoogleAccount(providerAccountId, expires) {
      const users = await sql<{ userId: string }[]>`select user_id as "userId" from accounts where provider = 'google' and provider_account_id = ${providerAccountId} limit 1`;
      const userId = users[0]?.userId;
      if (!userId) return null;
      const sessionId = randomUUID();
      await sql`insert into admin_sessions (session_lookup_hash, user_id, expires) values (${lookupHash(sessionId)}, ${userId}, ${expires})`;
      return sessionId;
    },
    async purgeExpiredBrowserOAuthTransactions(limit) {
      await sql`delete from browser_oauth_transactions where id in (select id from browser_oauth_transactions where expires <= now() order by expires asc limit ${limit})`;
    },
    async createBrowserOAuthTransaction(transaction) {
      if (!oauthTransactionProtection) throw new Error("Browser OAuth transaction protection is unavailable.");
      await sql`insert into browser_oauth_transactions (id, state_hash, code_verifier_ciphertext, return_url, referral_code, expires) values (${transaction.id}, ${oauthTransactionProtection.stateHash(transaction.state)}, ${oauthTransactionProtection.encrypt(transaction.id, transaction.codeVerifier)}, ${transaction.returnUrl}, ${transaction.referralCode ?? null}, ${transaction.expires})`;
    },
    async consumeBrowserOAuthTransaction(id, state) {
      if (!oauthTransactionProtection) throw new Error("Browser OAuth transaction protection is unavailable.");
      const rows = await sql<Array<Omit<BrowserOAuthTransaction, "state" | "codeVerifier"> & { codeVerifierCiphertext: string }>>`delete from browser_oauth_transactions where id = ${id} and state_hash = ${oauthTransactionProtection.stateHash(state)} and expires > now() returning id, code_verifier_ciphertext as "codeVerifierCiphertext", return_url as "returnUrl", referral_code as "referralCode", expires`;
      const row = rows[0];
      return row ? { ...row, referralCode: row.referralCode ?? null, state, codeVerifier: oauthTransactionProtection.decrypt(row.id, row.codeVerifierCiphertext) } : null;
    },
    async resolveOrCreateBrowserGoogleUser(subject, email, name, image, referralCode) {
      const rows = await sql.begin(async (transaction) => {
        const existing = await transaction<{ userId: string; authorizationVersion: number }[]>`select users.id as "userId", users.authorization_version as "authorizationVersion" from accounts join users on users.id = accounts.user_id where accounts.provider = 'google' and accounts.provider_account_id = ${subject} limit 1 for update`;
        if (existing[0]) {
          const roles = await transaction`select role from user_roles where user_id = ${existing[0].userId} for update`;
          if (roles.length) {
            await captureReferralAttribution(transaction, existing[0].userId, referralCode);
            return existing;
          }
          const granted = await transaction`insert into user_roles (user_id, role) values (${existing[0].userId}, 'traveler') on conflict do nothing returning user_id`;
          if (!granted.length) return existing;
          const resolved = await transaction<{ userId: string; authorizationVersion: number }[]>`update users set authorization_version = authorization_version + 1 where id = ${existing[0].userId} returning id as "userId", authorization_version as "authorizationVersion"`;
          await captureReferralAttribution(transaction, resolved[0]!.userId, referralCode);
          return resolved;
        }
        const users = await transaction<{ id: string; authorizationVersion: number }[]>`insert into users (id, email, name, image, email_verified) values (${randomUUID()}, ${email}, ${name}, ${image}, now()) on conflict (email) do update set name = coalesce(excluded.name, users.name), image = coalesce(excluded.image, users.image) returning id, authorization_version as "authorizationVersion"`;
        const userId = users[0]!.id;
        const linkedGoogleAccount = await transaction<{ providerAccountId: string }[]>`select provider_account_id as "providerAccountId" from accounts where user_id = ${userId} and provider = 'google' limit 1 for update`;
        if (linkedGoogleAccount[0] && linkedGoogleAccount[0].providerAccountId !== subject) throw new BrowserGoogleAccountConflictError();
        if (!linkedGoogleAccount[0]) await transaction`insert into accounts (user_id, type, provider, provider_account_id) values (${userId}, 'oauth', 'google', ${subject})`;
        await transaction`insert into user_roles (user_id, role) values (${userId}, 'traveler') on conflict do nothing`;
        await captureReferralAttribution(transaction, userId, referralCode);
        return [{ userId, authorizationVersion: users[0]!.authorizationVersion }];
      });
      return rows[0]!;
    },
    async createBrowserSession(userId, sessionId, csrfHash, authorizationVersion, expires) { await sql`insert into browser_sessions (session_lookup_hash, user_id, csrf_hash, authorization_version, expires) values (${browserLookupHash(sessionId)}, ${userId}, ${csrfHash}, ${authorizationVersion}, ${expires})`; },
    async getBrowserSession(sessionId) {
      const rows = await sql<Array<BrowserIdentity>>`select browser_sessions.user_id as "userId", browser_sessions.csrf_hash as "csrfHash", browser_sessions.expires, browser_sessions.authorization_version as "authorizationVersion", coalesce(array_agg(user_roles.role order by user_roles.role) filter (where user_roles.role is not null), '{}') as roles from browser_sessions join users on users.id = browser_sessions.user_id left join user_roles on user_roles.user_id = users.id where browser_sessions.session_lookup_hash = ${browserLookupHash(sessionId)} and browser_sessions.revoked_at is null and browser_sessions.authorization_version = users.authorization_version group by browser_sessions.user_id, browser_sessions.csrf_hash, browser_sessions.expires, browser_sessions.authorization_version`;
      return rows[0] ? { ...rows[0], sessionId } : null;
    },
    async getBrowserLogoutCsrfHash(sessionId) {
      const rows = await sql<{ csrfHash: string }[]>`select csrf_hash as "csrfHash" from browser_sessions where session_lookup_hash = ${browserLookupHash(sessionId)} limit 1`;
      return rows[0]?.csrfHash ?? null;
    },
    async renewBrowserSession(sessionId, expires) { return (await sql`update browser_sessions set expires = ${expires} where session_lookup_hash = ${browserLookupHash(sessionId)} and revoked_at is null and expires > now() returning session_lookup_hash`).length === 1; },
    async revokeBrowserSession(sessionId) { await sql`update browser_sessions set revoked_at = now() where session_lookup_hash = ${browserLookupHash(sessionId)} and revoked_at is null`; },
  };
}

async function captureReferralAttribution(transaction: postgres.TransactionSql, userId: string, referralCode: string | null) {
  if (!referralCode) return;
  const codes = await transaction<{ id: string; referrerUserId: string | null }[]>`select id, referrer_user_id as "referrerUserId" from referral_codes where code = ${referralCode} and active = true limit 1 for key share`;
  const code = codes[0];
  if (!code || code.referrerUserId === userId) return;
  await transaction`insert into referral_attributions (id, user_id, referral_code_id, referrer_user_id) values (${randomUUID()}, ${userId}, ${code.id}, ${code.referrerUserId}) on conflict (user_id) do nothing`;
}

function createBrowserOAuthTransactionProtection(secret: string) {
  const encryptionKey = createHash("sha256").update(`browser-oauth-transaction-encryption.${secret}`).digest();
  const stateKey = createHash("sha256").update(`browser-oauth-transaction-state.${secret}`).digest();
  return {
    stateHash(state: string) { return createHmac("sha256", stateKey).update(state).digest("base64url"); },
    encrypt(id: string, value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
      cipher.setAAD(Buffer.from(id));
      return Buffer.concat([iv, cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]).toString("base64url");
    },
    decrypt(id: string, value: string) {
      const bytes = Buffer.from(value, "base64url");
      if (bytes.length < 29) throw new Error("Browser OAuth transaction ciphertext is invalid.");
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8");
    },
  };
}

export function createPostgresAiAskStreamExecutionPort(_databaseUrl: string, telemetry?: import("@xuyenviet/contracts").OperationalTelemetrySink): AiAskStreamExecutionPort {
  return createAiAskStreamExecutionPort(telemetry);
}

export function createPostgresUserRoleGovernancePort(databaseUrl: string): UserRoleGovernancePort {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async listUsers({ cursor, search }) {
      const pattern = `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      const rows = await sql<Array<{ id: string; name: string | null; email: string | null; image: string | null; emailVerified: Date | null; roles: RequestRole[]; aiRequestCount: string; inputTokens: string; outputTokens: string }>>`
        select u.id, u.name, u.email, u.image, u.email_verified as "emailVerified", roles.roles,
          usage."aiRequestCount", usage."inputTokens", usage."outputTokens"
        from users u
        cross join lateral (select coalesce(array_agg(role order by role), '{}') as roles from user_roles where user_id = u.id) roles
        cross join lateral (select count(id)::text as "aiRequestCount", coalesce(sum(prompt_tokens), 0)::text as "inputTokens", coalesce(sum(completion_tokens), 0)::text as "outputTokens" from ai_usage_events where initiated_by_user_id = u.id) usage
        where (${search} = '' or u.name ilike ${pattern} escape '\\' or u.email ilike ${pattern} escape '\\')
          and (${cursor?.id ?? null}::text is null or (${cursor?.name ?? null}::text is null and u.name is not null) or (u.name is not distinct from ${cursor?.name ?? null}::text and ((${cursor?.email ?? null}::text is null and u.email is not null) or (u.email is not distinct from ${cursor?.email ?? null}::text and u.id > ${cursor?.id ?? ''}) or (${cursor?.email ?? null}::text is not null and u.email is not null and u.email > ${cursor?.email ?? null}::text))) or (${cursor?.name ?? null}::text is not null and u.name is not null and u.name > ${cursor?.name ?? null}::text))
        order by u.name nulls first, u.email nulls first, u.id limit ${adminUserRosterPageSize + 1}
      `;
      const page = rows.slice(0, adminUserRosterPageSize);
      const next = rows.length > adminUserRosterPageSize ? page.at(-1) : undefined;
      return { items: page.map((row) => ({ id: row.id, name: row.name, email: row.email, image: row.image, emailVerified: row.emailVerified?.toISOString() ?? null, roles: row.roles, usage: { aiRequestCount: row.aiRequestCount, inputTokens: row.inputTokens, outputTokens: row.outputTokens } })), nextCursor: next ? encodeAdminUserRosterCursor({ id: next.id, name: next.name, email: next.email }) : null, search };
    },
    async withinRoleGovernanceTransaction(operation) {
      return sql.begin(async (transaction) => operation(createPostgresUserRoleGovernanceTransactionPort(transaction))) as Promise<Awaited<ReturnType<typeof operation>>>;
    },
  };
}

function createPostgresUserRoleGovernanceTransactionPort(transaction: postgres.TransactionSql): UserRoleGovernanceTransactionPort {
  return {
    async lockRoleGovernance() { await transaction`select pg_advisory_xact_lock(727556452)`; },
    async loadLiveExactAdmin(principal) {
      const actors = await transaction<Array<{ id: string; email: string | null; authorizationVersion: number }>>`select id, email, authorization_version as "authorizationVersion" from users where id = ${principal.userId} for update`;
      const actor = actors[0];
      const roles = await transaction`select 1 from user_roles where user_id = ${principal.userId} and role = 'admin' for update`;
      if (!actor?.email || !roles.length) throw new UserRoleGovernancePolicyError("Exact administrator access is required for role changes.");
      if (actor.authorizationVersion !== principal.authorizationVersion) throw new UserRoleGovernancePolicyError("Request principal is stale.");
      return { userId: actor.id, email: actor.email };
    },
    async requireTargetUser(userId) {
      const targets = await transaction`select id from users where id = ${userId} for update`;
      if (!targets.length) throw new UserRoleGovernancePolicyError("User not found.");
    },
    async lockTargetRoles(userId) { await transaction`select role from user_roles where user_id = ${userId} for update`; },
    async listAdministratorUserIds() { return (await transaction<Array<{ user_id: string }>>`select user_id from user_roles where role = 'admin' for update`).map((row) => row.user_id); },
    async grantRole(userId, role) { return (await transaction`insert into user_roles (user_id, role) values (${userId}, ${role}) on conflict do nothing returning user_id`).length > 0; },
    async revokeRole(userId, role) { return (await transaction`delete from user_roles where user_id = ${userId} and role = ${role} returning user_id`).length > 0; },
    async incrementAuthorizationVersion(userId) { await transaction`update users set authorization_version = authorization_version + 1 where id = ${userId}`; },
    async recordRoleAudit({ actorUserId, actorEmail, targetUserId, role, operation }) {
      await transaction`insert into audit_events (id, actor_user_id, actor_email, actor_class, operation, target_type, target_id, before_summary, after_summary) values (${randomUUID()}, ${actorUserId}, ${actorEmail}, 'user', 'update', 'user_role', ${targetUserId}, ${operation === "revoke" ? JSON.stringify({ role }) : null}, ${operation === "grant" ? JSON.stringify({ role }) : null})`;
    },
  };
}

export function createPostgresPlanningReadRepository(): PlanningReadRepository {
  return {
    async loadOwnedPlanningContext(userId, tripProjectId) {
      const db = (await import("./client")).getDb();
      const [project] = await db.select({ id: tripProjects.id, primaryConversationId: tripProjects.primaryConversationId }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1);
      if (!project?.primaryConversationId) return null;
      const context = await loadAnswerContext({ userId, conversationId: project.primaryConversationId, tripProjectId });
      if (context.tripProjectId !== tripProjectId) return null;
      return serializeTripAnswerContext(context);
    },
    async loadOwnedAnswerDetail(userId, conversationId, assistantMessageId) {
      const db = (await import("./client")).getDb();
      const [message] = await db.select({ id: messages.id, content: messages.content, answerAnnotations: messages.answerAnnotations }).from(messages)
        .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.userId, userId)))
        .where(and(eq(messages.id, assistantMessageId), eq(messages.conversationId, conversationId), eq(messages.userId, userId), eq(messages.role, "assistant"))).limit(1);
      if (!message) return null;
      const safeAnswer = parsePlanningAnswerDetailResponse({ detail: { conversationId, assistantMessageId: message.id, content: message.content, provenance: [], annotations: [] } });
      if (!safeAnswer?.detail) throw new Error("Planning detail serialization exceeded the safe response contract.");
      try {
        const rows = await db.select({ id: assistantResponseProvenance.id, sourceCategory: assistantResponseProvenance.sourceCategory, rank: assistantResponseProvenance.rank, retrievalScore: assistantResponseProvenance.retrievalScore, sourceType: assistantResponseProvenance.sourceType, verificationStatus: assistantResponseProvenance.verificationStatus, availability: assistantResponseProvenance.availability, usedInPrompt: assistantResponseProvenance.usedInPrompt, citedInAnswer: assistantResponseProvenance.citedInAnswer, sourceSnapshot: assistantResponseProvenance.sourceSnapshot })
          .from(assistantResponseProvenance).where(and(eq(assistantResponseProvenance.userId, userId), eq(assistantResponseProvenance.conversationId, conversationId), eq(assistantResponseProvenance.assistantMessageId, assistantMessageId))).orderBy(asc(assistantResponseProvenance.rank), asc(assistantResponseProvenance.id));
        // Normalize the historical collection before the contract boundary. This
        // prevents an overlong legacy result from discarding all safe enrichment.
        const provenance = formatAssistantMessageProvenance(rows)
          .map(serializePlanningProvenance)
          .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
          .filter((item, index, all) => index === 0 || all[index - 1]!.rank !== item.rank)
          .slice(0, planningDetailProvenanceLimit);
        const annotations = await resolvePlanningAnnotationCapabilities({
          annotations: sanitizeStoredPlanningAnnotations({ answerText: message.content, annotations: message.answerAnnotations, provenance }),
          hasCurrentPendingProposal: async () => {
            const proposals = await db.select({ id: tripChangeProposals.id, expiresAt: tripChangeProposals.expiresAt })
              .from(tripChangeProposals)
              .innerJoin(conversations, and(eq(conversations.tripProjectId, tripChangeProposals.tripProjectId), eq(conversations.id, conversationId), eq(conversations.userId, userId)))
              .where(and(eq(tripChangeProposals.userId, userId), eq(tripChangeProposals.status, "pending"), eq(tripChangeProposals.sourceAssistantMessageId, assistantMessageId)));
            return proposals.length === 1 && (!proposals[0].expiresAt || proposals[0].expiresAt.getTime() > Date.now());
          },
        });
        return parsePlanningAnswerDetailResponse({ detail: { conversationId, assistantMessageId: message.id, content: message.content, provenance, annotations } })?.detail ?? safeAnswer.detail;
      } catch {
        return safeAnswer.detail;
      }
    },
  };
}

export function serializeTripAnswerContext(context: Awaited<ReturnType<typeof loadAnswerContext>>): TripAnswerContextResponse {
  const { version, tripProjectId, aggregateVersion, primaryConversationId, anchors, planItems, constraints, currentConversationFacts } = context;
  if (version !== 1 || tripProjectId === undefined || aggregateVersion === undefined || primaryConversationId === undefined || !anchors || !planItems || constraints === undefined || !currentConversationFacts) throw new Error("Canonical planning context metadata is unavailable.");
  return { version, hasProjectScope: context.hasProjectScope, tripProjectId, aggregateVersion, primaryConversationId, anchors, planItems, constraints: constraints ? { version: constraints.version, values: serializePlanningJsonObject(constraints.values) } : null, currentConversationFacts, conflicts: context.conflicts.map((item) => ({ field: item.field, canonicalValue: item.canonicalValue ?? item.projectValue, lowerPriorityValue: item.lowerPriorityValue ?? item.conversationValue, source: item.source ?? "conversation_chat", priority: "lower" as const, material: true as const })) };
}

function serializePlanningProvenance(item: ReturnType<typeof formatAssistantMessageProvenance>[number]): PlanningProvenance {
  if (item.availability === "withdrawn") {
    return { id: item.id, rank: item.rank, availability: item.availability, unavailableLabel: item.unavailableLabel, usedInPrompt: item.usedInPrompt, citedInAnswer: item.citedInAnswer } as const;
  }
  return { id: item.id, rank: item.rank, availability: "available", sourceCategory: item.sourceCategory, title: bounded(item.title, 500), sourceType: item.sourceType && item.sourceType.length <= 160 ? item.sourceType : null, url: item.url && item.url.length <= 2_000 ? item.url : null, checkedAt: canonicalUtcTimestamp(item.checkedAt), confidenceLabel: bounded(item.confidenceLabel, 160), verificationStatus: item.verificationStatus, usedInPrompt: item.usedInPrompt, citedInAnswer: item.citedInAnswer, retrievalScore: item.retrievalScore, freshnessSensitive: item.freshnessSensitive };
}

function bounded(value: string, maximum: number) { return value.length <= maximum ? value : value.slice(0, maximum).trimEnd() || "Không có thông tin"; }

function canonicalUtcTimestamp(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function serializePlanningJsonObject(value: Record<string, unknown>, depth = 0): Record<string, PlanningJsonValue> {
  if (depth > 4 || Object.keys(value).length > 24) throw new Error("Canonical planning constraints exceed the safe response bounds.");
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializePlanningJsonValue(item, depth + 1)]));
}
function serializePlanningJsonValue(value: unknown, depth: number): PlanningJsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 500) return value;
  if (depth > 4) throw new Error("Canonical planning constraints exceed the safe response bounds.");
  if (Array.isArray(value) && value.length <= 12) return value.map((item) => serializePlanningJsonValue(item, depth + 1));
  if (value && typeof value === "object" && !Array.isArray(value)) return serializePlanningJsonObject(value as Record<string, unknown>, depth);
  throw new Error("Canonical planning constraints contain an unsafe response value.");
}
