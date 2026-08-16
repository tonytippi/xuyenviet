import { and, eq } from "drizzle-orm";
import { parsePlanningContextSession, type PlanningContextSession } from "@xuyenviet/contracts";

import { getDb } from "./client";
import { conversations, planningContextSessions } from "./schema";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

export type PlanningContextSaveResult =
  | { status: "saved"; session: PlanningContextSession }
  | { status: "stale" }
  | { status: "not_found" }
  | { status: "invalid" };

export async function loadOwnedPlanningContextSession(userId: string, conversationId: string): Promise<PlanningContextSession | null> {
  const [row] = await getDb().select({ payload: planningContextSessions.payload }).from(planningContextSessions).where(and(eq(planningContextSessions.userId, userId), eq(planningContextSessions.conversationId, conversationId))).limit(1);
  return row ? parsePlanningContextSession(row.payload) : null;
}

export async function saveOwnedPlanningContextSession(userId: string, conversationId: string, expectedRevision: number | null, payload: unknown): Promise<PlanningContextSaveResult> {
  const session = parsePlanningContextSession(payload);
  if (!session || (expectedRevision === null ? session.revision !== 1 : !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || session.revision !== expectedRevision + 1)) return { status: "invalid" };
  return getDb().transaction((transaction) => saveInTransaction(transaction, userId, conversationId, expectedRevision, session));
}

async function saveInTransaction(transaction: Transaction, userId: string, conversationId: string, expectedRevision: number | null, session: PlanningContextSession): Promise<PlanningContextSaveResult> {
  const [conversation] = await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1).for("update");
  if (!conversation) return { status: "not_found" };
  if (expectedRevision === null) {
    const [created] = await transaction.insert(planningContextSessions).values({ userId, conversationId, payload: session, revision: session.revision }).onConflictDoNothing().returning({ conversationId: planningContextSessions.conversationId });
    return created ? { status: "saved", session } : { status: "stale" };
  }
  const [updated] = await transaction.update(planningContextSessions).set({ payload: session, revision: session.revision, updatedAt: new Date() }).where(and(eq(planningContextSessions.userId, userId), eq(planningContextSessions.conversationId, conversationId), eq(planningContextSessions.revision, expectedRevision))).returning({ conversationId: planningContextSessions.conversationId });
  return updated ? { status: "saved", session } : { status: "stale" };
}
