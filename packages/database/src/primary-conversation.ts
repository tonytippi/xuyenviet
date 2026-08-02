import { and, desc, eq, sql } from "drizzle-orm";

import type { getDb } from "./client";
import { conversations, tripProjects } from "./schema";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

export async function resolveOwnedPrimaryConversationInTransaction(transaction: Transaction, userId: string, tripProjectId: string) {
  const [project] = await transaction.select({ id: tripProjects.id, userId: tripProjects.userId, primaryConversationId: tripProjects.primaryConversationId, aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1).for("update");
  if (!project) return null;
  if (project.primaryConversationId) {
    const [primary] = await transaction.select({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt }).from(conversations).where(and(eq(conversations.id, project.primaryConversationId), eq(conversations.userId, userId), eq(conversations.tripProjectId, tripProjectId))).limit(1).for("update");
    if (primary) return primary;
  }
  const [existing] = await transaction.select({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt }).from(conversations).where(and(eq(conversations.userId, userId), eq(conversations.tripProjectId, tripProjectId))).orderBy(desc(conversations.updatedAt), desc(conversations.id)).limit(1).for("update");
  const [primary] = existing ? [existing] : await transaction.insert(conversations).values({ userId, tripProjectId }).returning({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt });
  if (project.primaryConversationId !== primary.id) {
    await transaction.update(conversations).set({ lifecycleVersion: sql`${conversations.lifecycleVersion} + 1`, updatedAt: new Date() }).where(and(eq(conversations.id, primary.id), eq(conversations.userId, userId)));
    await transaction.update(tripProjects).set({ primaryConversationId: primary.id, aggregateVersion: project.aggregateVersion + 1, updatedAt: new Date() }).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId)));
    return { ...primary, lifecycleVersion: primary.lifecycleVersion + 1 };
  }
  return primary;
}
