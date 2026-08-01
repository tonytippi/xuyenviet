import postgres from "postgres";
import { createHmac, randomUUID } from "node:crypto";
import { resolvePlanningAnnotationCapabilities, sanitizeStoredPlanningAnnotations, type AiAskStreamExecutionPort, type PlanningReadRepository, type UserRoleGovernancePort, type UserRoleGovernanceTransactionPort, UserRoleGovernancePolicyError } from "@xuyenviet/domain";
import { and, asc, eq } from "drizzle-orm";
import { loadAnswerContext } from "./answer-context";
import { formatAssistantMessageProvenance } from "./provenance";
import { assistantResponseProvenance, conversations, messages, tripChangeProposals, tripProjects } from "./schema";
import { adminUserRosterPageSize, encodeAdminUserRosterCursor, evaluateSchemaAdmission, parsePlanningAnswerDetailResponse, planningDetailProvenanceLimit, type AdminIdentityHandoff, type PlanningJsonValue, type PlanningProvenance, type RequestRole, type SchemaCompatibilityDeclaration, type TripAnswerContextResponse } from "@xuyenviet/contracts";
import { createAiAskStreamExecutionPort } from "./ai-ask-stream-execution";

export * from "./ai-ask-commands";
export * from "./ai-ask-stream-execution";
export * from "./answer-context";
export * from "./answer-freshness";
export * from "./approved-knowledge";
export * from "./assistant-provenance-withdrawal";
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

export type ApiIdentityRecord = {
  userId: string;
  expires: Date;
  authorizationVersion: number;
};

export interface ApiIdentityRepository {
  getSession(sessionId: string): Promise<ApiIdentityRecord | null>;
  getAdminSession?(sessionId: string): Promise<ApiIdentityRecord | null>;
}

export interface AdminIdentityRepository extends ApiIdentityRepository {
  resolveAdminHandoff(sessionId: string, subject?: string): Promise<AdminIdentityHandoff | null>;
  revokeAdminSession(sessionId: string): Promise<void>;
  purgeExpiredAdminOAuthTransactions(limit: number): Promise<void>;
  createAdminOAuthTransaction(transaction: AdminOAuthTransaction): Promise<void>;
  consumeAdminOAuthTransaction(id: string, state: string): Promise<AdminOAuthTransaction | null>;
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

export function createPostgresApiIdentityRepository(databaseUrl: string, adminSessionLookupKey: string): AdminIdentityRepository {
  if (adminSessionLookupKey.length < 32) throw new Error("Admin session lookup key is invalid.");
  const sql = postgres(databaseUrl, { max: 1 });
  const lookupHash = (sessionId: string) => createHmac("sha256", adminSessionLookupKey).update(sessionId).digest("base64url");
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
