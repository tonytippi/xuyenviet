import { asc, eq, sql } from "drizzle-orm";
import type { AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import type { RequestPrincipal } from "@xuyenviet/contracts";
import { getDb } from "./client";
import { createUserAuditActor } from "./actors";
import { recordAuditEvent } from "./audit-writers";
import { youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals } from "./schema";

const validText = (value: unknown) => typeof value === "string" && value.trim() === value && /^[\p{L}\p{N} '-]{1,240}$/u.test(value);
const validPriority = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 100;
const validCadence = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 15 && (value as number) <= 10_080;

export function createPostgresAdminYoutubeDiscoveryPort(): AdminYoutubeDiscoveryPort {
  return {
    async list() {
      const db = getDb();
      const rows = await db.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin, queryText: youtubeDiscoveryQueryProposals.queryText, reason: youtubeDiscoveryQueryProposals.reason, priority: youtubeDiscoveryQueryProposals.priority, enabled: youtubeDiscoveryQueryProposals.enabled, cadenceMinutes: youtubeDiscoveryQueryProposals.cadenceMinutes, nextDueAt: youtubeDiscoveryQueryProposals.nextDueAt, policyEnabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryQueryProposals).leftJoin(youtubeDiscoveryPolicyVersions, eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).orderBy(asc(youtubeDiscoveryQueryProposals.createdAt)).limit(200);
      return { items: rows.map((row) => ({ id: row.id, origin: row.origin, queryText: row.queryText, reason: row.reason, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes, nextRunAt: row.enabled && row.policyEnabled ? row.nextDueAt?.toISOString() ?? null : null, pausedReason: !row.enabled ? "operator" : !row.policyEnabled ? "global" : null })) };
    },
    async create(principal, input) {
      if (!validText(input.queryText) || !validPriority(input.priority) || !validCadence(input.cadenceMinutes)) throw new Error("Invalid YouTube Discovery query proposal.");
      const db = getDb(); const actor = actorFor(principal);
      return db.transaction(async (transaction) => {
        const [policy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
        if (!policy) throw new Error("YouTube Discovery policy is unavailable.");
        const [row] = await transaction.insert(youtubeDiscoveryQueryProposals).values({ origin: "operator", reason: "operator_request", queryText: input.queryText, priority: input.priority, cadenceMinutes: input.cadenceMinutes, enabled: true, scheduleAnchorAt: sql`clock_timestamp()`, nextDueAt: policy.enabled ? sql`clock_timestamp() + ${input.cadenceMinutes} * interval '1 minute'` : null }).returning();
        if (!row) throw new Error("YouTube Discovery query proposal creation failed.");
        await audit(transaction, actor, "create", row.id, row);
        return projection(row, policy.enabled);
      });
    },
    async edit(principal, id, queryText) {
      return mutate(principal, id, { queryText }, validText(queryText), "operator");
    },
    async reprioritize(principal, id, priority) { return mutate(principal, id, { priority, operatorPriorityOverride: sql`case when ${youtubeDiscoveryQueryProposals.origin} = 'system' then ${priority} else ${youtubeDiscoveryQueryProposals.operatorPriorityOverride} end` }, validPriority(priority)); },
    async pause(principal, id) { return mutate(principal, id, { enabled: false, nextDueAt: null }, true); },
    async resume(principal, id) { return mutate(principal, id, { enabled: true, scheduleAnchorAt: sql`coalesce(${youtubeDiscoveryQueryProposals.scheduleAnchorAt}, clock_timestamp())`, nextDueAt: sql`case when (select enabled from youtube_discovery_policy_versions where is_current = true) then coalesce(${youtubeDiscoveryQueryProposals.scheduleAnchorAt}, clock_timestamp()) + (floor(extract(epoch from (clock_timestamp() - coalesce(${youtubeDiscoveryQueryProposals.scheduleAnchorAt}, clock_timestamp()))) / 60 / ${youtubeDiscoveryQueryProposals.cadenceMinutes})::integer + 1) * ${youtubeDiscoveryQueryProposals.cadenceMinutes} * interval '1 minute' else null end` }, true); },
  };
}
async function mutate(principal: RequestPrincipal, id: string, values: Record<string, unknown>, valid: boolean, origin?: "operator") {
  if (!valid || !id.trim() || id.length > 128) throw new Error("Invalid YouTube Discovery query proposal.");
  const db = getDb(); const actor = actorFor(principal);
  return db.transaction(async (transaction) => {
    // Policy transitions lock this row before proposal rows. Keep operator
    // commands in the same order to prevent a transition/command lock cycle.
    const [policy] = await transaction.select({ enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (origin) {
      const [existing] = await transaction.select({ id: youtubeDiscoveryQueryProposals.id, origin: youtubeDiscoveryQueryProposals.origin }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, id)).limit(1).for("update");
      if (existing?.origin === "system") {
        await recordAuditEvent({ actor, operation: "update", targetType: "youtube_discovery_query_proposal", targetId: existing.id, afterSummary: JSON.stringify({ action: "edit_rejected", reason: "system_origin_immutable" }) }, transaction);
        return null;
      }
    }
    const [row] = await transaction.update(youtubeDiscoveryQueryProposals).set(values).where(origin ? sql`${youtubeDiscoveryQueryProposals.id} = ${id} and ${youtubeDiscoveryQueryProposals.origin} = ${origin}` : eq(youtubeDiscoveryQueryProposals.id, id)).returning();
    if (!row) return null;
    await audit(transaction, actor, "update", row.id, row);
    return projection(row, policy?.enabled ?? false);
  });
}
function actorFor(principal: RequestPrincipal) { if (!principal.email) throw new Error("Audit actor unavailable."); return createUserAuditActor({ userId: principal.userId, email: principal.email }); }
async function audit(transaction: Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (arg: infer T) => unknown ? T : never, actor: ReturnType<typeof createUserAuditActor>, operation: "create" | "update", id: string, row: typeof youtubeDiscoveryQueryProposals.$inferSelect) { await recordAuditEvent({ actor, operation, targetType: "youtube_discovery_query_proposal", targetId: id, afterSummary: JSON.stringify({ origin: row.origin, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes }) }, transaction); }
function projection(row: typeof youtubeDiscoveryQueryProposals.$inferSelect, policyEnabled: boolean) { return { id: row.id, origin: row.origin, queryText: row.queryText, reason: row.reason, priority: row.priority, enabled: row.enabled, cadenceMinutes: row.cadenceMinutes, nextRunAt: row.enabled && policyEnabled ? row.nextDueAt?.toISOString() ?? null : null, pausedReason: !row.enabled ? "operator" as const : !policyEnabled ? "global" as const : null }; }
