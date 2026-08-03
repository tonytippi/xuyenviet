export const bffIssuers = ["xuyenviet-web-bff", "xuyenviet-admin-bff"] as const;
export type BffIssuer = (typeof bffIssuers)[number];

export const apiAudience = "api.railway.internal" as const;
export const requestRoles = ["traveler", "operator", "admin"] as const;
export type RequestRole = (typeof requestRoles)[number];

export type InternalCredentialClaims = {
  sub: string;
  sid: string;
  roles: RequestRole[];
  rv: number;
  jti: string;
  iss: BffIssuer;
  aud: typeof apiAudience;
  iat: number;
  nbf: number;
  exp: number;
};

export type RequestPrincipal = {
  userId: string;
  sessionId: string;
  roles: RequestRole[];
  authorizationVersion: number;
  /** Set only by an admission boundary; legacy domain callers remain BFF-shaped. */
  transport?: "bff_bearer" | "browser_session";
  issuer?: BffIssuer;
  tokenId?: string;
};

export const adminCapabilities = ["admin.workspace.read", "admin.role.governance", "admin.ai-model-catalog.write"] as const;
export type AdminCapability = (typeof adminCapabilities)[number];

/** This declaration is shared by the BFF admission check and API controllers. */
export function permitsAdminCapability(roles: readonly RequestRole[], capability: AdminCapability): boolean {
  if (capability === "admin.workspace.read") return roles.includes("operator") || roles.includes("admin");
  return roles.includes("admin");
}

export type AdminIdentityHandoff = {
  subject: string;
  sessionId: string;
  authorizationVersion: number;
  roles: RequestRole[];
};

export type AdminIdentityHandoffRequest = { sessionId: string; subject?: string };
export type AdminIdentityHandoffResponse = { identity: AdminIdentityHandoff };
export type AdminReadinessRequest = { declaration: SchemaCompatibilityDeclaration };
export type AdminReadinessResponse = { ready: boolean };

export type SafeFieldViolation = { field: string; code: string; message: string };
export const safeApiErrorCodes = ["unauthorized", "forbidden", "validation_error", "csrf_invalid", "request_timeout", "internal_error"] as const;
export type SafeApiErrorCode = (typeof safeApiErrorCodes)[number];
export type SafeApiError = {
  code: SafeApiErrorCode;
  message: string;
  requestId: string;
  violations?: SafeFieldViolation[];
};

export const adminUserRosterPageSize = 25;
export const adminUserRosterSearchMaxLength = 120;
export const managedUserRoles = ["operator", "admin"] as const;
export type ManagedUserRole = (typeof managedUserRoles)[number];
export type UserRoleOperation = "grant" | "revoke";
export type AdminUserRosterCursor = { name: string | null; email: string | null; id: string };
export type AdminUserRosterItem = { id: string; name: string | null; email: string | null; image: string | null; emailVerified: string | null; roles: RequestRole[]; usage: { aiRequestCount: string; inputTokens: string; outputTokens: string } };
export type AdminUserRosterPage = { items: AdminUserRosterItem[]; nextCursor: string | null; search: string };
export type UserRoleCommandResult = { targetUserId: string; role: ManagedUserRole; operation: UserRoleOperation; changed: boolean };

export function parseAdminUserRosterQuery(value: unknown): { cursor: string | null; search: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => key !== "cursor" && key !== "search")) return null;
  const search = query.search === undefined ? "" : typeof query.search === "string" ? query.search.trim() : null;
  const cursor = query.cursor === undefined || query.cursor === "" ? null : typeof query.cursor === "string" ? query.cursor : null;
  return search === null || search.length > adminUserRosterSearchMaxLength || cursor !== null && !parseAdminUserRosterCursor(cursor) ? null : { cursor, search };
}

export function encodeAdminUserRosterCursor(cursor: AdminUserRosterCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function parseAdminUserRosterCursor(value: unknown): AdminUserRosterCursor | null {
  if (typeof value !== "string" || value.length < 4 || value.length > 512) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const cursor = parsed as Record<string, unknown>;
    return Object.keys(cursor).length === 3 && typeof cursor.id === "string" && cursor.id.length > 0 && cursor.id.length <= 128
      && (typeof cursor.name === "string" && cursor.name.length <= 512 || cursor.name === null)
      && (typeof cursor.email === "string" && cursor.email.length <= 512 || cursor.email === null)
      ? { id: cursor.id, name: cursor.name as string | null, email: cursor.email as string | null }
      : null;
  } catch { return null; }
}

export function parseUserRoleCommand(value: unknown): { targetUserId: string; role: ManagedUserRole; operation: UserRoleOperation } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return Object.keys(input).sort().join(",") === "operation,role,targetUserId" && typeof input.targetUserId === "string" && input.targetUserId.trim().length > 0 && input.targetUserId.trim().length <= 128
    && (managedUserRoles as readonly string[]).includes(input.role as string) && (input.operation === "grant" || input.operation === "revoke")
    ? { targetUserId: input.targetUserId.trim(), role: input.role as ManagedUserRole, operation: input.operation } : null;
}

export function parseUserRoleCommandResult(value: unknown): UserRoleCommandResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join(",") !== "changed,operation,role,targetUserId" || typeof result.changed !== "boolean") return null;
  const parsed = parseUserRoleCommand({ targetUserId: result.targetUserId, role: result.role, operation: result.operation });
  return parsed ? { ...parsed, changed: result.changed } : null;
}

export function parseAdminUserRosterPage(value: unknown): AdminUserRosterPage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = value as Record<string, unknown>;
  if (Object.keys(page).sort().join(",") !== "items,nextCursor,search" || !Array.isArray(page.items) || page.items.length > adminUserRosterPageSize || typeof page.search !== "string" || page.search.length > adminUserRosterSearchMaxLength || page.nextCursor !== null && !parseAdminUserRosterCursor(page.nextCursor)) return null;
  const items = page.items.map((item): AdminUserRosterItem | null => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const user = item as Record<string, unknown>;
    const usage = user.usage;
    return Object.keys(user).sort().join(",") === "email,emailVerified,id,image,name,roles,usage" && typeof user.id === "string" && user.id.length > 0 && user.id.length <= 128
      && (typeof user.name === "string" && user.name.length <= 512 || user.name === null) && (typeof user.email === "string" && user.email.length <= 512 || user.email === null)
      && (typeof user.image === "string" && user.image.length <= 2_000 || user.image === null) && (typeof user.emailVerified === "string" || user.emailVerified === null)
      && Array.isArray(user.roles) && user.roles.every(isRequestRole) && usage && typeof usage === "object" && !Array.isArray(usage)
      && typeof (usage as Record<string, unknown>).aiRequestCount === "string" && typeof (usage as Record<string, unknown>).inputTokens === "string" && typeof (usage as Record<string, unknown>).outputTokens === "string"
      ? user as AdminUserRosterItem : null;
  });
  return items.some((item) => item === null) ? null : { items: items as AdminUserRosterItem[], nextCursor: page.nextCursor as string | null, search: page.search };
}

export const conversationSummaryLimit = 100;
export type ConversationSummary = { id: string; updatedAt: string; preview: string };
export type ConversationSummaryListResponse = { summaries: ConversationSummary[] };
export type TravelerShellMessage = { id: string; role: "user" | "assistant"; content: string };
export type TravelerShellProjection = {
  conversation: { id: string; tripProjectId: string | null; messages: TravelerShellMessage[] } | null;
  tripProject: { id: string; title: string; origin: string | null; destination: string | null; startDate: string | null; endDate: string | null; travelers: string | null; primaryConversationId: string | null } | null;
  workspace: TravelerWorkspaceProjection | null;
};
export type TravelerWorkspaceProjection = { focus: { kind: "pending-proposal-with-expiry" | "pending-proposal" | "confirmed-item-gap" | "next-leg" | "preparation"; proposalId?: string; itemId?: string; reason: string; sortKey: string }; timelineGroups: Array<{ dateDivider: string | null; legId: string | null; entries: Array<{ id: string; kind: "anchor" | "leg" | "activity"; anchorRole: string | null; type: string | null; state: string; stateLabel: string; typeLabel: string; label: string; plannedAt: string | null; timeContext: string | null; placeContext: string | null; notesPreview: string | null; parentItemId: string | null; ordinal: number; depth: number }> }>; constraints: { adultCount: number | null; childCount: number | null; childrenSummary: Array<{ ageRange: string | null; comfortTags: string[]; preferenceTags: string[] }>; vehicleType: "car" | "motorcycle" | "ev" | null; evChargingNeed: "none" | "preferred" | "required" | null; drivingToleranceHours: number | null; budgetCurrency: "VND" | null; budgetMinVnd: number | null; budgetMaxVnd: number | null; preferenceTags: string[]; avoidItems: Array<{ category: "place" | "activity"; label: string }> } | null; planHistory: Array<{ proposalId: string | null; operationLabel: string; actorLabel: string; timestampLabel: string; affectedItemLabels: string[]; beforeAfter: Array<{ operation: string; before: string | null; after: string | null }> }>; pendingProposals: Array<{ id: string; expiresAt: string | null; createdAt: string; rationale: string | null; status: "pending"; affectedItems: Array<{ itemId: string; kind: "anchor" | "leg" | "activity"; label: string; change: "create" | "update" | "remove" | "reorder" | "change-state" | "upsert-constraints" }>; beforeAfter: Array<{ operation: string; before: string | null; after: string | null }>; alternatives: Array<{ summary: string }>; hasAlternatives: boolean }> };
export type TravelerShellResponse = { shell: TravelerShellProjection };
export type TravelerCommandFailure = "not_found" | "invalid_input" | "invalid_target" | "invalid_rating" | "comment_too_long" | "failed";
export type CreateTripProjectCommand = { title: string; origin?: string | null; destination?: string | null; startDate?: string | null; endDate?: string | null; travelers?: string | null; notes?: string | null };
export type DeleteOwnedResourceResult = { success: true } | { success: false; reason: "not_found" | "failed" };
export type CreateTripProjectResult = { success: true; project: { id: string; title: string; origin: string | null; destination: string | null; startDate: string | null; endDate: string | null; travelers: string | null; notes: string | null; updatedAt: string } } | { success: false; reason: "invalid_input" | "failed" };
export type SaveAnswerUsefulnessFeedbackCommand = { assistantMessageId: string; rating: "useful" | "not_useful"; comment?: string | null };
export type SaveAnswerUsefulnessFeedbackResult = { success: true; feedback: { rating: "useful" | "not_useful"; comment: string | null; updatedAt: string } } | { success: false; reason: TravelerCommandFailure };
export type TripChangeProposalCommand = { tripProjectId: string; proposalId: string; requiredSourceAssistantMessageId?: string; annotationBinding?: { conversationId: string; assistantMessageId: string; annotationId: "trip-change-proposal-apply" | "trip-change-proposal-dismiss"; command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss" } };
export type ApplyTripChangeProposalResult = { success: true; aggregateVersion: number; proposalStatus: "applied" } | { success: false; reason: "not_found" | "refresh_required" | "expired" | "failed" };
export type DismissTripChangeProposalResult = { success: true; proposalStatus: "dismissed" } | { success: false; reason: "not_found" | "expired" | "failed" };
export type AnnotationProposalActionCommand = { conversationId: string; assistantMessageId: string; annotationId: "trip-change-proposal-apply" | "trip-change-proposal-dismiss"; command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss" };
export type AnnotationProposalActionResult = ApplyTripChangeProposalResult | DismissTripChangeProposalResult;
export function parseCreateTripProjectResult(value: unknown): CreateTripProjectResult | null { if (!isRecord(value)) return null; if (value.success === false && (value.reason === "invalid_input" || value.reason === "failed") && hasExactKeys(value, ["success", "reason"])) return value as CreateTripProjectResult; if (!isRecord(value.project) || value.success !== true || !hasExactKeys(value, ["success", "project"])) return null; const project = value.project; return typeof project.id === "string" && typeof project.title === "string" && ["origin", "destination", "startDate", "endDate", "travelers", "notes"].every((key) => typeof project[key] === "string" || project[key] === null) && typeof project.updatedAt === "string" ? value as CreateTripProjectResult : null; }
export function parseDeleteOwnedResourceResult(value: unknown): DeleteOwnedResourceResult | null { if (!isRecord(value)) return null; if (value.success === true && hasExactKeys(value, ["success"])) return value as DeleteOwnedResourceResult; return value.success === false && (value.reason === "not_found" || value.reason === "failed") && hasExactKeys(value, ["success", "reason"]) ? value as DeleteOwnedResourceResult : null; }
export function parseSaveAnswerUsefulnessFeedbackResult(value: unknown): SaveAnswerUsefulnessFeedbackResult | null { return isRecord(value) && value.success === false && ["not_found", "invalid_input", "invalid_target", "invalid_rating", "comment_too_long", "failed"].includes(value.reason as string) && hasExactKeys(value, ["success", "reason"]) ? value as SaveAnswerUsefulnessFeedbackResult : isRecord(value) && value.success === true && isRecord(value.feedback) && hasExactKeys(value, ["success", "feedback"]) && (value.feedback.rating === "useful" || value.feedback.rating === "not_useful") && (typeof value.feedback.comment === "string" || value.feedback.comment === null) && typeof value.feedback.updatedAt === "string" ? value as SaveAnswerUsefulnessFeedbackResult : null; }
export function parseApplyTripChangeProposalResult(value: unknown): ApplyTripChangeProposalResult | null { return isRecord(value) && value.success === true && value.proposalStatus === "applied" && Number.isInteger(value.aggregateVersion) && (value.aggregateVersion as number) >= 1 && hasExactKeys(value, ["success", "aggregateVersion", "proposalStatus"]) ? value as ApplyTripChangeProposalResult : isRecord(value) && value.success === false && ["not_found", "refresh_required", "expired", "failed"].includes(value.reason as string) && hasExactKeys(value, ["success", "reason"]) ? value as ApplyTripChangeProposalResult : null; }
export function parseDismissTripChangeProposalResult(value: unknown): DismissTripChangeProposalResult | null { return isRecord(value) && value.success === true && value.proposalStatus === "dismissed" && hasExactKeys(value, ["success", "proposalStatus"]) ? value as DismissTripChangeProposalResult : isRecord(value) && value.success === false && ["not_found", "expired", "failed"].includes(value.reason as string) && hasExactKeys(value, ["success", "reason"]) ? value as DismissTripChangeProposalResult : null; }
export function parseAnnotationProposalActionResult(value: unknown): AnnotationProposalActionResult | null { return parseApplyTripChangeProposalResult(value) ?? parseDismissTripChangeProposalResult(value); }
export function parseCreateTripProjectCommand(value: unknown): CreateTripProjectCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).every((key) => ["title", "origin", "destination", "startDate", "endDate", "travelers", "notes"].includes(key)) || typeof input.title !== "string") return null;
  const optional = ["origin", "destination", "startDate", "endDate", "travelers", "notes"] as const;
  if (optional.some((key) => input[key] !== undefined && input[key] !== null && typeof input[key] !== "string")) return null;
  return { title: input.title, ...Object.fromEntries(optional.filter((key) => input[key] !== undefined).map((key) => [key, input[key] as string | null])) };
}

export function parseSaveAnswerUsefulnessFeedbackCommand(value: unknown): SaveAnswerUsefulnessFeedbackCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return Object.keys(input).every((key) => ["assistantMessageId", "rating", "comment"].includes(key)) && typeof input.assistantMessageId === "string" && input.assistantMessageId.trim().length > 0 && input.assistantMessageId.length <= 128 && (input.rating === "useful" || input.rating === "not_useful") && (input.comment === undefined || input.comment === null || typeof input.comment === "string")
    ? { assistantMessageId: input.assistantMessageId, rating: input.rating, ...(input.comment === undefined ? {} : { comment: input.comment }) } : null;
}

export function parseTripChangeProposalCommand(value: unknown): TripChangeProposalCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).every((key) => ["tripProjectId", "proposalId", "requiredSourceAssistantMessageId", "annotationBinding"].includes(key)) || !identifier(input.tripProjectId) || !identifier(input.proposalId) || input.requiredSourceAssistantMessageId !== undefined && !identifier(input.requiredSourceAssistantMessageId)) return null;
  if (input.annotationBinding === undefined) return { tripProjectId: input.tripProjectId, proposalId: input.proposalId, ...(input.requiredSourceAssistantMessageId === undefined ? {} : { requiredSourceAssistantMessageId: input.requiredSourceAssistantMessageId }) };
  const binding = input.annotationBinding;
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return null;
  const item = binding as Record<string, unknown>;
  if (!isAnnotationProposalActionCommand(item)) return null;
  return { tripProjectId: input.tripProjectId, proposalId: input.proposalId, ...(input.requiredSourceAssistantMessageId === undefined ? {} : { requiredSourceAssistantMessageId: input.requiredSourceAssistantMessageId }), annotationBinding: item as TripChangeProposalCommand["annotationBinding"] };
}

export function parseAnnotationProposalActionCommand(value: unknown): AnnotationProposalActionCommand | null { return isAnnotationProposalActionCommand(value) ? value : null; }
function isAnnotationProposalActionCommand(value: unknown): value is AnnotationProposalActionCommand { if (!value || typeof value !== "object" || Array.isArray(value)) return false; const item = value as Record<string, unknown>; return Object.keys(item).sort().join(",") === "annotationId,assistantMessageId,command,conversationId" && identifier(item.conversationId) && identifier(item.assistantMessageId) && (item.annotationId === "trip-change-proposal-apply" && item.command === "trip_change_proposal.apply" || item.annotationId === "trip-change-proposal-dismiss" && item.command === "trip_change_proposal.dismiss"); }

function identifier(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 128; }

export type ApiVersionResponse = { version: "v1"; conversationSummaryLimit: number };
export type HealthResponse = { status: "ok" };

export type SchemaWorkload = "web" | "api" | "worker" | "migration" | "admin";
export type SchemaCompatibilityDeclaration = { workload: SchemaWorkload; minimumVersion: string; maximumVersion: string };
export type ParsedSchemaVersion = { year: number; month: number; day: number; revision: bigint };

const schemaWorkloads = new Set<SchemaWorkload>(["web", "api", "worker", "migration", "admin"]);
const currentReleaseSchemaVersion = "20260728.1";
const overlappingReleaseSchemaVersion = "20260729.1";

// Ranges are intentionally declared outside any application runtime so every
// deployable workload applies the same release-recorded schema policy.
export const schemaCompatibilityDeclarations: Record<SchemaWorkload, SchemaCompatibilityDeclaration> = {
  web: { workload: "web", minimumVersion: currentReleaseSchemaVersion, maximumVersion: overlappingReleaseSchemaVersion },
  api: { workload: "api", minimumVersion: currentReleaseSchemaVersion, maximumVersion: overlappingReleaseSchemaVersion },
  worker: { workload: "worker", minimumVersion: currentReleaseSchemaVersion, maximumVersion: overlappingReleaseSchemaVersion },
  migration: { workload: "migration", minimumVersion: currentReleaseSchemaVersion, maximumVersion: overlappingReleaseSchemaVersion },
  admin: { workload: "admin", minimumVersion: currentReleaseSchemaVersion, maximumVersion: overlappingReleaseSchemaVersion },
};

export type SchemaAdmission = { compatible: true } | { compatible: false };

// This is a reviewed release artifact projection, supplied at deployment as
// process configuration. It is intentionally not the raw matrix: approval and
// target information never enter workload processes or health output.
// This is a deployment projection of one reviewed, checked-in matrix.  The
// digest prevents a release ID from being reused with changed matrix content.
export type SchemaReleasePhasePolicy = {
  releaseId: string;
  matrixPath: string;
  matrixDigest: string;
  target: SchemaReleaseMatrix["target"];
  phase: SchemaReleasePhase;
  workloads: Record<SchemaWorkload, SchemaCompatibilityDeclaration>;
};

export function parseSchemaReleasePhasePolicy(value: unknown): SchemaReleasePhasePolicy | null {
  if (!isRecord(value) || !hasExactKeys(value, ["releaseId", "matrixPath", "matrixDigest", "target", "phase", "workloads"]) || !isBoundedReleaseText(value.releaseId, 128) || !/^[A-Za-z0-9._-]{1,255}\.json$/.test(value.matrixPath as string) || !/^[a-f0-9]{64}$/.test(value.matrixDigest as string) || !isReleaseTarget(value.target) || !["expand", "migrate", "contract"].includes(value.phase as string) || !isRecord(value.workloads) || Object.keys(value.workloads).length !== schemaWorkloads.size) return null;
  const workloads = value.workloads;
  return [...schemaWorkloads].every((workload) => isSchemaCompatibilityDeclaration(workloads[workload], workload))
    ? value as SchemaReleasePhasePolicy
    : null;
}

/**
 * Runtime workloads resolve release artifacts only from this explicit deployment
 * path. This deliberately avoids source-tree and process-working-directory
 * assumptions after application bundles have been produced.
 */

export function admitsSchemaReleasePhasePolicy(policy: SchemaReleasePhasePolicy | null | undefined, workload: SchemaWorkload, rows: readonly { version: unknown }[], resolvedTargetIdentity?: unknown): boolean {
  // A pre-overlap binary is the only deliberately policy-free admission path.
  // Once the persisted record reaches the overlap target, a bound projection is
  // mandatory for every traffic and worker boundary.
  if (policy === undefined) return rows.length === 1 && rows[0]?.version === currentReleaseSchemaVersion;
  return policy !== null && policy.target.resolvedIdentity === resolvedTargetIdentity
    && evaluateSchemaAdmission(policy.workloads[workload], rows).compatible;
}

export const schemaReleaseDispositions = ["clean_break_disposable", "expand_migrate_contract"] as const;
export type SchemaReleaseDisposition = (typeof schemaReleaseDispositions)[number];
export type SchemaReleasePhase = "expand" | "migrate" | "contract";
export type SchemaReleaseMatrix = {
  releaseId: string;
  disposition: "expand_migrate_contract";
  target: { environment: "test" | "staging" | "production"; identityClass: "test" | "durable" | "protected" | "operational"; resolvedIdentity: string };
  approval: { approved: true; reference: string };
  currentVersion: string;
  targetVersion: string;
  // Parsing is intentionally broader than execution: db:migrate selects only
  // migrate operations, while a separately approved contract can be reviewed.
  operation: { phase: SchemaReleasePhase; durableRewrite: boolean };
  persistentObjects: Array<{ name: string; interpretation: string }>;
  phases: Record<SchemaReleasePhase, { workloads: Record<SchemaWorkload, SchemaCompatibilityDeclaration> }>;
  // Static declarations describe all runtime schemas. This separately attested
  // inventory describes only owners that can actually overlap this release.
  activeOwnerInventory: { attested: true; owners: Array<{ id: string; ownerType: "workload" | "capability"; workload?: SchemaWorkload; capability?: string; runtimeWorkload?: SchemaWorkload; role: "reader" | "writer"; oldRepresentation: string; schemaVersion: string; effectiveState: "active" | "deployable"; deploymentEvidence: string; declaration: SchemaCompatibilityDeclaration }> };
  expandEvidence: Record<string, string>;
  rolloutOrder: Array<string | "verify-expand" | "migrate">;
  migrationJob: { version: string; lock: "918_040_004" };
  migrationPlan: { disposition: "forward_only"; pending: Array<{ id: string; digest: string }> };
  traffic: { writerOwnerId: string; dualWrite: false; readOnlyShadow: boolean };
  rollback: { legacyOwnerId: string; legacyBinaryRelease: string };
  verification: string[];
  contract: { destructiveCleanup: boolean; oldOwners: Array<{ id: string; oldRepresentation: string; schemaVersion: string; retired: boolean; retirementEvidence?: string }>; cleanupConstraints?: { expandedSchemaRetainedUntilRetirement: true; noDestructiveRollback: true; forwardOnly: true } };
  dataRewrite?: { approvedRunbook: string; idempotent: true; batchingAndResumption: true; validation: string; failureHandling: string; nonDestructiveRecovery: string };
};

export type SchemaReleaseGateInput = {
  disposition: SchemaReleaseDisposition;
  matrix: unknown;
  phase: SchemaReleasePhase;
  migrationVersion: string;
  persistedRows: readonly { version: unknown }[];
  target: { environment: unknown; identityClass: unknown; resolvedIdentity: unknown };
};

// Workloads receive persisted rows, not a locally inferred migration version.
// Cardinality is part of admission so every deployment boundary fails closed alike.
export function evaluateSchemaAdmission(declaration: SchemaCompatibilityDeclaration, persistedRows: readonly { version: unknown }[]): SchemaAdmission {
  return persistedRows.length === 1 && isSchemaCompatible(declaration, persistedRows[0]?.version)
    ? { compatible: true }
    : { compatible: false };
}

export type SchemaCompatibilityConsumer = { declaration: SchemaCompatibilityDeclaration; admits(rows: readonly { version: unknown }[]): boolean };

export function createSchemaCompatibilityConsumer(declaration: SchemaCompatibilityDeclaration): SchemaCompatibilityConsumer {
  return { declaration, admits: (rows) => evaluateSchemaAdmission(declaration, rows).compatible };
}

// Story 13.1 imports this boundary into its own runtime rather than duplicating
// release-record evaluation or implying that an admin deployment exists today.
export const futureAdminSchemaCompatibilityConsumer = createSchemaCompatibilityConsumer(schemaCompatibilityDeclarations.admin);

export function parseSchemaVersion(value: unknown): ParsedSchemaVersion | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})(\d{2})(\d{2})\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, revisionText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const revision = BigInt(revisionText);
  return isGregorianDate(year, month, day)
    ? { year, month, day, revision }
    : null;
}

export function compareSchemaVersions(left: ParsedSchemaVersion, right: ParsedSchemaVersion): number {
  for (const key of ["year", "month", "day"] as const) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  if (left.revision !== right.revision) return left.revision < right.revision ? -1 : 1;
  return 0;
}

export function isSchemaCompatible(declaration: SchemaCompatibilityDeclaration, persistedVersion: unknown): boolean {
  if (!declaration || typeof declaration !== "object" || !schemaWorkloads.has(declaration.workload)) return false;
  const minimum = parseSchemaVersion(declaration.minimumVersion);
  const maximum = parseSchemaVersion(declaration.maximumVersion);
  const current = parseSchemaVersion(persistedVersion);
  return Boolean(minimum && maximum && current && compareSchemaVersions(minimum, maximum) <= 0 && compareSchemaVersions(current, minimum) >= 0 && compareSchemaVersions(current, maximum) <= 0);
}


// This parser is the single release-plan boundary. It deliberately returns no
// diagnostics because callers must not expose target or approval details.
export function parseSchemaReleaseMatrix(value: unknown): SchemaReleaseMatrix | null {
  if (!isRecord(value) || !hasOnlyReleaseKeys(value, ["releaseId", "disposition", "target", "approval", "currentVersion", "targetVersion", "operation", "persistentObjects", "phases", "activeOwnerInventory", "expandEvidence", "rolloutOrder", "migrationJob", "migrationPlan", "traffic", "rollback", "verification", "contract", "dataRewrite"], ["dataRewrite"])) return null;
  if (!isBoundedReleaseText(value.releaseId, 128) || value.disposition !== "expand_migrate_contract" || !isReleaseTarget(value.target) || !isReleaseApproval(value.approval) || !isSchemaVersion(value.currentVersion) || !isSchemaVersion(value.targetVersion) || compareSchemaVersions(parseSchemaVersion(value.currentVersion)!, parseSchemaVersion(value.targetVersion)!) >= 0) return null;
  if (!isOperation(value.operation) || !Array.isArray(value.persistentObjects) || value.persistentObjects.length === 0 || !value.persistentObjects.every((item) => isRecord(item) && hasExactKeys(item, ["name", "interpretation"]) && isBoundedReleaseText(item.name, 160) && isBoundedReleaseText(item.interpretation, 500))) return null;
  if (!isReleasePhases(value.phases) || !isActiveOwnerInventory(value.activeOwnerInventory, value.currentVersion, value.targetVersion) || !hasExpandEvidence(value.expandEvidence, value.activeOwnerInventory) || !hasFullRolloutOrder(value.rolloutOrder, value.activeOwnerInventory)) return null;
  if (!isRecord(value.migrationJob) || !hasExactKeys(value.migrationJob, ["version", "lock"]) || value.migrationJob.version !== value.targetVersion || value.migrationJob.lock !== "918_040_004") return null;
  if (!isMigrationPlan(value.migrationPlan)) return null;
  if (!isTraffic(value.traffic) || !isRollback(value.rollback)) return null;
  if (!Array.isArray(value.verification) || value.verification.length === 0 || !value.verification.every((item) => isBoundedReleaseText(item, 500))) return null;
  if (!isContract(value.contract) || !hasCompleteRetirementEvidence(value.contract, value.activeOwnerInventory)) return null;
  const operation = value.operation as { phase: SchemaReleasePhase; durableRewrite: boolean };
  if ((operation.durableRewrite && !isDataRewritePlan(value.dataRewrite)) || (!operation.durableRewrite && value.dataRewrite !== undefined)) return null;
  if (!hasPhaseCompatibleOverlap(value as SchemaReleaseMatrix) || !hasAd32Ownership(value as SchemaReleaseMatrix) || !hasDeployedMigrationDeclaration(value as SchemaReleaseMatrix) || !hasExpandBeforeMigration(value as SchemaReleaseMatrix) || !hasSafeContractCleanup(value as SchemaReleaseMatrix)) return null;
  return value as SchemaReleaseMatrix;
}

export function validatesSchemaReleasePhasePolicy(policy: SchemaReleasePhasePolicy | null, matrix: unknown, matrixDigest: string): policy is SchemaReleasePhasePolicy {
  const approved = parseSchemaReleaseMatrix(matrix);
  return Boolean(policy && approved && policy.matrixDigest === matrixDigest && policy.releaseId === approved.releaseId
    && policy.matrixPath.endsWith(".json") && policy.phase === approved.operation.phase
    && policy.target.environment === approved.target.environment && policy.target.identityClass === approved.target.identityClass && policy.target.resolvedIdentity === approved.target.resolvedIdentity
    && hasSameSchemaCompatibilityDeclarations(policy.workloads, approved.phases[policy.phase].workloads));
}

export function admitsSchemaReleaseGate(input: SchemaReleaseGateInput): boolean {
  if (input.disposition !== "expand_migrate_contract") return false;
  const matrix = parseSchemaReleaseMatrix(input.matrix);
  if (!matrix || input.phase !== "migrate" || matrix.operation.phase !== "migrate" || matrix.contract.destructiveCleanup || input.migrationVersion !== matrix.targetVersion) return false;
  if (matrix.target.environment !== input.target.environment || matrix.target.identityClass !== input.target.identityClass || matrix.target.resolvedIdentity !== input.target.resolvedIdentity) return false;
  const hasRecordedCurrentVersion = input.persistedRows.length === 1 && input.persistedRows[0]?.version === matrix.currentVersion;
  // The test-only initial proof starts before migration 0003 creates the sole
  // release ledger. Production-like targets retain the strict one-row gate.
  const isApprovedTestBootstrap = matrix.target.environment === "test" && matrix.target.identityClass === "test"
    && input.persistedRows.length === 0 && matrix.migrationPlan.pending.some((entry) => entry.id === "0003_release_schema_versions");
  if (!hasRecordedCurrentVersion && !isApprovedTestBootstrap) return false;
  const migration = matrix.phases.migrate.workloads.migration;
  return isSchemaCompatible(migration, matrix.currentVersion) && matrix.migrationJob.version === matrix.targetVersion;
}

function isSchemaVersion(value: unknown): value is string { return parseSchemaVersion(value) !== null; }
function isBoundedReleaseText(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum; }
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value); }
function hasOnlyReleaseKeys(value: Record<string, unknown>, keys: string[], optional: string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)) && keys.filter((key) => !optional.includes(key)).every((key) => key in value); }
function isReleaseTarget(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["environment", "identityClass", "resolvedIdentity"]) && ["test", "staging", "production"].includes(value.environment as string) && ["test", "durable", "protected", "operational"].includes(value.identityClass as string) && /^database=[A-Za-z0-9_-]{1,128};host=[A-Za-z0-9:.\[\]-]{1,255};port=[0-9]{1,5}$/.test(value.resolvedIdentity as string); }
function isReleaseApproval(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["approved", "reference"]) && value.approved === true && isBoundedReleaseText(value.reference, 160); }
function isReleasePhases(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["expand", "migrate", "contract"]) && (["expand", "migrate", "contract"] as const).every((phase) => isReleasePhase(value[phase])); }
function isReleasePhase(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ["workloads"]) || !isRecord(value.workloads) || schemaWorkloads.size !== Object.keys(value.workloads).length) return false;
  const workloads = value.workloads;
  return [...schemaWorkloads].every((workload) => isSchemaCompatibilityDeclaration(workloads[workload], workload));
}
function isOperation(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["phase", "durableRewrite"]) && ["expand", "migrate", "contract"].includes(value.phase as string) && typeof value.durableRewrite === "boolean"; }
function isMigrationPlan(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["disposition", "pending"]) && value.disposition === "forward_only" && Array.isArray(value.pending) && value.pending.every((entry) => isRecord(entry) && hasExactKeys(entry, ["id", "digest"]) && /^[0-9]{4}_[A-Za-z0-9_]+$/.test(entry.id as string) && /^[a-f0-9]{64}$/.test(entry.digest as string)) && new Set(value.pending.map((entry) => (entry as { id: string }).id)).size === value.pending.length; }
function isSchemaCompatibilityDeclaration(value: unknown, workload: SchemaWorkload): boolean { return isRecord(value) && hasExactKeys(value, ["workload", "minimumVersion", "maximumVersion"]) && value.workload === workload && isSchemaCompatible(value as SchemaCompatibilityDeclaration, value.minimumVersion); }
function hasSameSchemaCompatibilityDeclarations(left: Record<SchemaWorkload, SchemaCompatibilityDeclaration>, right: Record<SchemaWorkload, SchemaCompatibilityDeclaration>): boolean {
  return [...schemaWorkloads].every((workload) => {
    const leftDeclaration = left[workload];
    const rightDeclaration = right[workload];
    return leftDeclaration.workload === rightDeclaration.workload
      && leftDeclaration.minimumVersion === rightDeclaration.minimumVersion
      && leftDeclaration.maximumVersion === rightDeclaration.maximumVersion;
  });
}
function isActiveOwnerInventory(value: unknown, currentVersion: string, targetVersion: string): value is SchemaReleaseMatrix["activeOwnerInventory"] {
  if (!isRecord(value) || !hasExactKeys(value, ["attested", "owners"]) || value.attested !== true || !Array.isArray(value.owners) || value.owners.length === 0) return false;
  const owners = value.owners;
  return new Set(owners.map((owner) => isRecord(owner) ? owner.id : "")).size === owners.length && owners.some((owner) => isRecord(owner) && owner.ownerType === "workload" && owner.workload === "migration") && owners.every((owner) => isActiveOwner(owner, currentVersion, targetVersion));
}
function isActiveOwner(value: unknown, currentVersion: string, targetVersion: string): boolean {
  if (!isRecord(value) || !hasOnlyReleaseKeys(value, ["id", "ownerType", "workload", "capability", "runtimeWorkload", "role", "oldRepresentation", "schemaVersion", "effectiveState", "deploymentEvidence", "declaration"], ["workload", "capability", "runtimeWorkload"]) || !isBoundedReleaseText(value.id, 160) || !["reader", "writer"].includes(value.role as string) || !isBoundedReleaseText(value.oldRepresentation, 500) || !isSchemaVersion(value.schemaVersion) || !["active", "deployable"].includes(value.effectiveState as string) || !isBoundedReleaseText(value.deploymentEvidence, 500)) return false;
  const ownerType = value.ownerType;
  if (ownerType === "workload" && (!schemaWorkloads.has(value.workload as SchemaWorkload) || value.capability !== undefined || value.runtimeWorkload !== undefined)) return false;
  if (ownerType === "capability" && (value.workload !== undefined || !isBoundedReleaseText(value.capability, 160) || !schemaWorkloads.has(value.runtimeWorkload as SchemaWorkload))) return false;
  const workload = ownerType === "workload" ? value.workload as SchemaWorkload : value.runtimeWorkload as SchemaWorkload;
  return isSchemaCompatibilityDeclaration(value.declaration, workload) && value.schemaVersion === currentVersion && isSchemaCompatible(value.declaration as SchemaCompatibilityDeclaration, currentVersion) && isSchemaCompatible(value.declaration as SchemaCompatibilityDeclaration, targetVersion);
}
function activeOwnerIds(inventory: SchemaReleaseMatrix["activeOwnerInventory"]): string[] { return inventory.owners.map((owner) => owner.id); }
function hasFullRolloutOrder(value: unknown, inventory: SchemaReleaseMatrix["activeOwnerInventory"]): value is SchemaReleaseMatrix["rolloutOrder"] {
  const ownerIds = activeOwnerIds(inventory);
  if (!Array.isArray(value) || value.length !== ownerIds.length + 2 || value[value.length - 1] !== "migrate" || value[value.length - 2] !== "verify-expand") return false;
  const ordered = value.slice(0, -2);
  return ordered.every((ownerId) => ownerIds.includes(ownerId as string)) && new Set(ordered).size === ownerIds.length;
}
function hasPhaseCompatibleOverlap(matrix: SchemaReleaseMatrix): boolean {
  return [...schemaWorkloads].every((workload) => {
    const expand = matrix.phases.expand.workloads[workload];
    const migrate = matrix.phases.migrate.workloads[workload];
    const contract = matrix.phases.contract.workloads[workload];
    return isSchemaCompatible(expand, matrix.currentVersion) && isSchemaCompatible(expand, matrix.targetVersion)
      && isSchemaCompatible(migrate, matrix.currentVersion) && isSchemaCompatible(migrate, matrix.targetVersion)
      && isSchemaCompatible(contract, matrix.targetVersion)
      && (!matrix.contract.destructiveCleanup || !isSchemaCompatible(contract, matrix.currentVersion));
  });
}
function isTraffic(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["writerOwnerId", "dualWrite", "readOnlyShadow"]) && isBoundedReleaseText(value.writerOwnerId, 160) && value.dualWrite === false && typeof value.readOnlyShadow === "boolean"; }
function isRollback(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["legacyOwnerId", "legacyBinaryRelease"]) && isBoundedReleaseText(value.legacyOwnerId, 160) && isBoundedReleaseText(value.legacyBinaryRelease, 160); }
function isContract(value: unknown): value is SchemaReleaseMatrix["contract"] { return isRecord(value) && hasOnlyReleaseKeys(value, ["destructiveCleanup", "oldOwners", "cleanupConstraints"], ["cleanupConstraints"]) && typeof value.destructiveCleanup === "boolean" && Array.isArray(value.oldOwners) && value.oldOwners.length > 0 && value.oldOwners.every((owner) => isOldOwner(owner)) && (value.cleanupConstraints === undefined || isCleanupConstraints(value.cleanupConstraints)); }
function hasCompleteRetirementEvidence(contract: SchemaReleaseMatrix["contract"], inventory: SchemaReleaseMatrix["activeOwnerInventory"]): boolean {
  if (contract.oldOwners.length !== inventory.owners.length || new Set(contract.oldOwners.map((owner) => owner.id)).size !== inventory.owners.length) return false;
  return inventory.owners.every((activeOwner) => {
    const owner = contract.oldOwners.find((item) => item.id === activeOwner.id);
    return owner?.oldRepresentation === activeOwner.oldRepresentation && owner.schemaVersion === activeOwner.schemaVersion
      && (!contract.destructiveCleanup || owner.retired === true && isBoundedReleaseText(owner.retirementEvidence, 500));
  });
}
function isOldOwner(value: unknown): boolean {
  return isRecord(value)
    && hasOnlyReleaseKeys(value, ["id", "oldRepresentation", "schemaVersion", "retired", "retirementEvidence"], ["retirementEvidence"])
    && isBoundedReleaseText(value.id, 160)
    && isBoundedReleaseText(value.oldRepresentation, 500)
    && isSchemaVersion(value.schemaVersion)
    && typeof value.retired === "boolean"
    && (value.retirementEvidence === undefined || isBoundedReleaseText(value.retirementEvidence, 500));
}
function hasAd32Ownership(matrix: SchemaReleaseMatrix): boolean {
  const writer = matrix.activeOwnerInventory.owners.find((owner) => owner.id === matrix.traffic.writerOwnerId);
  const legacy = matrix.activeOwnerInventory.owners.find((owner) => owner.id === matrix.rollback.legacyOwnerId);
  const selectedWriters = matrix.activeOwnerInventory.owners.filter((owner) => owner.role === "writer" && owner.effectiveState === "active" && isCutoverWriter(owner));
  return selectedWriters.length === 1
    && writer === selectedWriters[0]
    && Boolean(legacy && legacy.role === "writer" && legacy.effectiveState === "active" && isCutoverWriter(legacy) && legacy.oldRepresentation === matrix.rollback.legacyBinaryRelease && isSchemaCompatible(legacy.declaration, matrix.targetVersion));
}
function effectiveOwnerWorkload(owner: SchemaReleaseMatrix["activeOwnerInventory"]["owners"][number]): SchemaWorkload { return owner.ownerType === "workload" ? owner.workload! : owner.runtimeWorkload!; }
function isCutoverWriter(owner: SchemaReleaseMatrix["activeOwnerInventory"]["owners"][number]): boolean { const workload = effectiveOwnerWorkload(owner); return workload !== "worker" && workload !== "migration"; }
function hasExpandBeforeMigration(matrix: SchemaReleaseMatrix): boolean {
  const verificationIndex = matrix.rolloutOrder.indexOf("verify-expand");
  const migrationIndex = matrix.rolloutOrder.indexOf("migrate");
  const owners = matrix.activeOwnerInventory.owners;
  return verificationIndex === owners.length && migrationIndex === verificationIndex + 1
    && owners.every((owner) => {
      const declaration = matrix.phases.expand.workloads[effectiveOwnerWorkload(owner)];
      return isBoundedReleaseText(matrix.expandEvidence[owner.id], 500)
        && isSchemaCompatible(declaration, owner.schemaVersion)
        && isSchemaCompatible(declaration, matrix.targetVersion);
    });
}
function hasExpandEvidence(value: unknown, inventory: SchemaReleaseMatrix["activeOwnerInventory"]): value is SchemaReleaseMatrix["expandEvidence"] { const ownerIds = activeOwnerIds(inventory); return isRecord(value) && ownerIds.length === Object.keys(value).length && ownerIds.every((ownerId) => isBoundedReleaseText(value[ownerId], 500)); }
function hasSafeContractCleanup(matrix: SchemaReleaseMatrix): boolean {
  if (matrix.operation.phase !== "contract") return !matrix.contract.destructiveCleanup;
  if (!matrix.contract.destructiveCleanup) return true;
  const constraints = matrix.contract.cleanupConstraints;
  return hasCompleteRetirementEvidence(matrix.contract, matrix.activeOwnerInventory)
    && Boolean(constraints?.expandedSchemaRetainedUntilRetirement && constraints.noDestructiveRollback && constraints.forwardOnly);
}
function isCleanupConstraints(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["expandedSchemaRetainedUntilRetirement", "noDestructiveRollback", "forwardOnly"]) && value.expandedSchemaRetainedUntilRetirement === true && value.noDestructiveRollback === true && value.forwardOnly === true; }
function hasDeployedMigrationDeclaration(matrix: SchemaReleaseMatrix): boolean {
  const declared = matrix.phases.migrate.workloads.migration;
  const deployed = schemaCompatibilityDeclarations.migration;
  return declared.workload === deployed.workload && declared.minimumVersion === deployed.minimumVersion && declared.maximumVersion === deployed.maximumVersion;
}
function isDataRewritePlan(value: unknown): boolean { return isRecord(value) && hasExactKeys(value, ["approvedRunbook", "idempotent", "batchingAndResumption", "validation", "failureHandling", "nonDestructiveRecovery"]) && isBoundedReleaseText(value.approvedRunbook, 500) && value.idempotent === true && value.batchingAndResumption === true && [value.validation, value.failureHandling, value.nonDestructiveRecovery].every((item) => isBoundedReleaseText(item, 500)); }

export function correlationId(value?: string | null): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : crypto.randomUUID();
}

export type OperationalTelemetryEvent = {
  correlationId: string;
  capability: string;
  principalClass: "user" | "system" | "anonymous";
  resultCode: string;
  latencyMs: number;
  durableId?: string;
  jobLagMs?: number;
  retryCount?: number;
  leaseRecovery?: "none" | "recovered" | "contended";
  leaseRecoveryCount?: number;
  providerRequestId?: string;
};
export type OperationalTelemetrySink = { emit(event: OperationalTelemetryEvent): void | Promise<void> };

export type WorkerPollObservation = {
  capability: "knowledge.extraction" | "knowledge.ingestion" | "knowledge.indexing" | "ai_ask.outbox";
  resultCode: "success" | "no_work" | "retry" | "failure" | "contended";
  durableId?: string;
  jobLagMs?: number;
  retryCount?: number;
  leaseRecovery?: "none" | "recovered" | "contended";
  leaseRecoveryCount?: number;
};

const telemetryCapabilities = new Set(["ai_ask.stream", "ai_ask.provider", "knowledge.extraction", "knowledge.ingestion", "knowledge.indexing", "ai_ask.outbox", "worker.startup", "worker.schema", "worker.drain", "worker.restart"]);
const telemetryResultCodes = new Set(["success", "failure", "no_work", "retry", "schema_incompatible", "draining", "restarted", "recovered", "contended"]);

export function emitOperationalTelemetry(sink: OperationalTelemetrySink | undefined, event: OperationalTelemetryEvent): void {
  try {
    const normalized = normalizeOperationalTelemetryEvent(event);
    if (!sink || !normalized) return;
    Promise.resolve(sink.emit(normalized)).catch(() => undefined);
  } catch { /* Telemetry must not change the operation result. */ }
}

export function isOperationalTelemetryEvent(event: unknown): event is OperationalTelemetryEvent {
  try { return normalizeOperationalTelemetryEvent(event) !== null; } catch { return false; }
}

function normalizeOperationalTelemetryEvent(event: unknown): OperationalTelemetryEvent | null {
  if (!event || typeof event !== "object") return null;
  const descriptors = Object.getOwnPropertyDescriptors(event);
  const allowedKeys = new Set(["correlationId", "capability", "principalClass", "resultCode", "latencyMs", "durableId", "jobLagMs", "retryCount", "leaseRecovery", "leaseRecoveryCount", "providerRequestId"]);
  if (!Object.keys(descriptors).every((key) => allowedKeys.has(key))) return null;
  const values = Object.assign(Object.create(null), ...Object.entries(descriptors).map(([key, descriptor]) => ({ [key]: "value" in descriptor ? descriptor.value : undefined })));
  const candidateCorrelationId = values.correlationId;
  const capability = values.capability;
  const principalClass = values.principalClass;
  const resultCode = values.resultCode;
  const latencyMs = values.latencyMs;
  const durableId = values.durableId;
  const jobLagMs = values.jobLagMs;
  const retryCount = values.retryCount;
  const leaseRecovery = values.leaseRecovery;
  const leaseRecoveryCount = values.leaseRecoveryCount;
  const providerRequestId = values.providerRequestId;
  const userCapability = capability === "ai_ask.stream" || capability === "ai_ask.provider";
  const valid = Object.values(descriptors).every((descriptor) => "value" in descriptor)
    && isTelemetryText(candidateCorrelationId)
    && typeof capability === "string" && telemetryCapabilities.has(capability)
    && typeof resultCode === "string" && telemetryResultCodes.has(resultCode)
    && (principalClass === "user" ? userCapability : principalClass === "system" && !userCapability)
    && Number.isInteger(latencyMs) && latencyMs >= 0 && latencyMs <= 86_400_000
    && (durableId === undefined || isTelemetryText(durableId))
    && (jobLagMs === undefined || Number.isInteger(jobLagMs) && jobLagMs >= 0 && jobLagMs <= 31_536_000_000)
    && (retryCount === undefined || Number.isInteger(retryCount) && retryCount >= 0 && retryCount <= 10_000)
    && (leaseRecovery === undefined || ["none", "recovered", "contended"].includes(leaseRecovery))
    && (leaseRecoveryCount === undefined || Number.isInteger(leaseRecoveryCount) && leaseRecoveryCount >= 0 && leaseRecoveryCount <= 10_000)
    && (leaseRecoveryCount === undefined || leaseRecovery === "recovered")
    && (providerRequestId === undefined || isTelemetryText(providerRequestId));
  if (!valid) return null;
  // Do not pass caller-owned objects to a sink. A prototype toJSON or later
  // mutation must not influence the bounded object that is serialized.
  return Object.assign(Object.create(null), { correlationId: candidateCorrelationId, capability, principalClass, resultCode, latencyMs },
    durableId === undefined ? {} : { durableId }, jobLagMs === undefined ? {} : { jobLagMs }, retryCount === undefined ? {} : { retryCount },
    leaseRecovery === undefined ? {} : { leaseRecovery }, leaseRecoveryCount === undefined ? {} : { leaseRecoveryCount }, providerRequestId === undefined ? {} : { providerRequestId },
  ) as OperationalTelemetryEvent;
}

function isTelemetryText(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

let consoleTelemetryBlocked = false;
// stdout reports async write failures as stream errors even when a write
// callback receives the error. Console telemetry is strictly best-effort.
process.stdout.on("error", () => process.emitWarning("Operational telemetry stdout is unavailable."));

export const consoleOperationalTelemetrySink: OperationalTelemetrySink = {
  emit(event) {
    let normalized: OperationalTelemetryEvent | null;
    try { normalized = normalizeOperationalTelemetryEvent(event); } catch { return; }
    if (!normalized) return;
    // Never queue telemetry behind a blocked stdout consumer. Dropping these
    // best-effort events preserves the domain operation and bounds memory use.
    if (consoleTelemetryBlocked) return;
    try {
      if (!process.stdout.write(`operational_telemetry ${JSON.stringify(normalized)}\n`, () => undefined)) {
        consoleTelemetryBlocked = true;
        process.stdout.once("drain", () => { consoleTelemetryBlocked = false; });
      }
    } catch { /* Telemetry must not change the operation result. */ }
  },
};

function isGregorianDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1) return false;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

export const planningContextPlanItemLimit = 60;
export const planningDetailProvenanceLimit = 100;
export const planningDetailAnnotationLimit = 20;
export const planningDetailQuickFactLimit = 6;
export type PlanningJsonValue = null | boolean | number | string | PlanningJsonValue[] | { [key: string]: PlanningJsonValue };
export type PlanningSourceCategory = "knowledge" | "web" | "trip_context" | "chat_context" | "general";
export type PlanningAnnotationType = "source" | "warning" | "trip_fact" | "action" | "place" | "hotel_area" | "route_segment" | "cost";
export type PlanningProvenance =
  | { id: string; rank: number; availability: "withdrawn"; unavailableLabel: "Nguồn này không còn khả dụng."; usedInPrompt: boolean; citedInAnswer: boolean }
  | { id: string; rank: number; availability: "available"; sourceCategory: PlanningSourceCategory; title: string; sourceType: string | null; url: string | null; checkedAt: string | null; confidenceLabel: string; verificationStatus: "verified" | "unverified"; usedInPrompt: boolean; citedInAnswer: boolean; retrievalScore: number | null; freshnessSensitive: boolean };
export type PlanningAnnotation = {
  id: string;
  start: number;
  end: number;
  text: string;
  type: PlanningAnnotationType;
  detail: {
    type: PlanningAnnotationType;
    label: string;
    section?: string;
    summary?: string;
    sourceCategory?: PlanningSourceCategory;
    owner?: { table: "assistant_response_provenance"; id: string };
    detail?: Record<string, string>;
    quickFacts?: Array<{ label: string; value: string }>;
    provenanceIds?: string[];
    action?: { command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss"; label: string; arguments: Record<string, never>; anchor: "trip-change-proposal-action.v1" };
    capability?: { command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss"; label: string; available: true };
  };
};
export type PlanningContextResponse = { context: TripAnswerContextResponse | null };
export type TripAnswerContextResponse = {
  version: 1; hasProjectScope: boolean; tripProjectId: string | null; aggregateVersion: number | null; primaryConversationId: string | null;
  anchors: Array<{ field: string; value: string; source: "conversation" | "trip_project" }>;
  planItems: Array<{ id: string; version: number; kind: string; anchorRole: string | null; type: string | null; state: string; label: string; ordinal: number; parentItemId: string | null }>;
  constraints: { version: number; values: Record<string, PlanningJsonValue> } | null;
  currentConversationFacts: Array<{ field: string; value: string; source: "conversation" | "trip_project" }>;
  conflicts: Array<{ field: string; canonicalValue: string; lowerPriorityValue: string; source: string; priority: "lower"; material: true }>;
};
export type PlanningAnswerDetailResponse = { detail: { conversationId: string; assistantMessageId: string; content: string; provenance: PlanningProvenance[]; annotations: PlanningAnnotation[] } | null };

export const aiAskMaxQuestionLength = 2_000;
export const aiAskMaxImageByteSize = 5 * 1024 * 1024;
export const aiAskMaxMultipartBodySize = 6 * 1024 * 1024;
export const aiAskAcceptedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type AiAskImageMimeType = (typeof aiAskAcceptedImageTypes)[number];

// This is deliberately the existing browser protocol. Correlation is a header,
// so adding a request identifier here would change the legacy NDJSON bytes.
export type AiAskStreamEvent =
  | { type: "preparing" }
  | { type: "delta"; content: string }
  | { type: "in_progress"; conversationId?: string; userMessage?: { id: string; content: string } }
  | { type: "done"; conversationId: string; userMessage: { id: string; content: string }; assistantMessage: { id: string; content: string; provenance?: unknown[] } }
  | { type: "error"; code?: "refresh_required"; conversationId?: string; userMessage?: { id: string; content: string }; errorMessage: string };

export type AiAskStreamInput = {
  question: string;
  conversationId?: string;
  tripProjectId?: string;
  idempotencyKey: string;
  image?: { fileName: string | null; mimeType: AiAskImageMimeType; byteSize: number; bytes: Uint8Array };
};

export function parseAiAskIdempotencyKey(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value) ? value : null;
}

export function parseAiAskStreamInput(value: {
  question: unknown;
  conversationId?: unknown;
  tripProjectId?: unknown;
  idempotencyKey: unknown;
  image?: { fileName: unknown; mimeType: unknown; byteSize: unknown; bytes: unknown } | undefined;
}): AiAskStreamInput | null {
  const question = typeof value.question === "string" ? value.question.trim() : "";
  const conversationId = optionalIdentifier(value.conversationId);
  const tripProjectId = optionalIdentifier(value.tripProjectId);
  const idempotencyKey = parseAiAskIdempotencyKey(value.idempotencyKey);
  if (!question || question.length > aiAskMaxQuestionLength || !idempotencyKey || (value.conversationId !== undefined && !conversationId) || (value.tripProjectId !== undefined && !tripProjectId)) return null;
  if (!value.image) return { question, ...(conversationId ? { conversationId } : {}), ...(tripProjectId ? { tripProjectId } : {}), idempotencyKey };
  const { fileName, mimeType, byteSize, bytes } = value.image;
  if (typeof fileName !== "string" && fileName !== null || !isAiAskImageMimeType(mimeType) || !Number.isInteger(byteSize) || typeof byteSize !== "number" || byteSize <= 0 || byteSize > aiAskMaxImageByteSize || !(bytes instanceof Uint8Array) || bytes.byteLength !== byteSize || !hasAiAskImageSignature(bytes, mimeType)) return null;
  const boundedName = fileName?.replace(/[\u0000-\u001f\u007f\\/]+/g, " ").trim().slice(0, 120) || null;
  return { question, ...(conversationId ? { conversationId } : {}), ...(tripProjectId ? { tripProjectId } : {}), idempotencyKey, image: { fileName: boundedName, mimeType, byteSize, bytes } };
}

export function isAiAskImageMimeType(value: unknown): value is AiAskImageMimeType {
  return typeof value === "string" && (aiAskAcceptedImageTypes as readonly string[]).includes(value);
}

export function hasAiAskImageSignature(bytes: Uint8Array, mimeType: AiAskImageMimeType): boolean {
  if (mimeType === "image/png") {
    return bytes.byteLength >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/jpeg") {
    return bytes.byteLength >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && (bytes[3] === 0xe0 || bytes[3] === 0xe1);
  }
  return bytes.byteLength >= 12
    && new TextDecoder("ascii").decode(bytes.subarray(0, 4)) === "RIFF"
    && new TextDecoder("ascii").decode(bytes.subarray(8, 12)) === "WEBP";
}

function optionalIdentifier(value: unknown): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" && value.length <= 128 && value.trim() === value ? value : null;
}

export function parseConversationSummaryListResponse(value: unknown): ConversationSummaryListResponse | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { summaries?: unknown }).summaries)) return null;
  const summaries = (value as { summaries: unknown[] }).summaries;
  if (summaries.length > conversationSummaryLimit || !summaries.every(isConversationSummary)) return null;
  return { summaries: summaries as ConversationSummary[] };
}

export function parseTravelerShellResponse(value: unknown): TravelerShellResponse | null {
  if (!hasOnlyKeys(value, ["shell"]) || !hasOnlyKeys(value.shell, ["conversation", "tripProject", "workspace"])) return null;
  const shell = value.shell;
  const conversation = shell.conversation;
  const tripProject = shell.tripProject;
  const workspace = shell.workspace;
  if (conversation !== null && (!hasOnlyKeys(conversation, ["id", "tripProjectId", "messages"]) || !isIdentifier(conversation.id) || !isNullableIdentifier(conversation.tripProjectId) || !Array.isArray(conversation.messages) || conversation.messages.length > 200 || !conversation.messages.every((message) => hasOnlyKeys(message, ["id", "role", "content"]) && isIdentifier(message.id) && (message.role === "user" || message.role === "assistant") && typeof message.content === "string" && message.content.length <= 20_000))) return null;
  if (tripProject !== null && (!hasOnlyKeys(tripProject, ["id", "title", "origin", "destination", "startDate", "endDate", "travelers", "primaryConversationId"]) || !isIdentifier(tripProject.id) || !isBoundedString(tripProject.title, 200) || ![tripProject.origin, tripProject.destination, tripProject.startDate, tripProject.endDate, tripProject.travelers].every((item) => item === null || typeof item === "string" && item.length <= 500) || !isNullableIdentifier(tripProject.primaryConversationId))) return null;
  if (workspace !== null && !isTravelerWorkspace(workspace)) return null;
  return { shell: { conversation: conversation as TravelerShellProjection["conversation"], tripProject: tripProject as TravelerShellProjection["tripProject"], workspace: workspace as TravelerShellProjection["workspace"] } };
}

export function parsePlanningContextResponse(value: unknown): PlanningContextResponse | null {
  if (!hasOnlyKeys(value, ["context"])) return null;
  if (value.context === null) return { context: null };
  const context = value.context;
  if (!hasOnlyKeys(context, ["version", "hasProjectScope", "tripProjectId", "aggregateVersion", "primaryConversationId", "anchors", "planItems", "constraints", "currentConversationFacts", "conflicts"]) || context.version !== 1 || typeof context.hasProjectScope !== "boolean" || !isNullableIdentifier(context.tripProjectId) || !isNullableInteger(context.aggregateVersion) || !isNullableIdentifier(context.primaryConversationId)) return null;
  const anchors = parseFactList(context.anchors, planningContextPlanItemLimit);
  const planItems = parsePlanItemList(context.planItems);
  const constraints = parseConstraints(context.constraints);
  const currentConversationFacts = parseFactList(context.currentConversationFacts, 18);
  const conflicts = parseConflictList(context.conflicts);
  if (!anchors || !planItems || constraints === undefined || !currentConversationFacts || !conflicts) return null;
  return { context: { version: 1, hasProjectScope: context.hasProjectScope, tripProjectId: context.tripProjectId, aggregateVersion: context.aggregateVersion, primaryConversationId: context.primaryConversationId, anchors, planItems, constraints, currentConversationFacts, conflicts } };
}

export function parsePlanningAnswerDetailResponse(value: unknown): PlanningAnswerDetailResponse | null {
  if (!hasOnlyKeys(value, ["detail"])) return null;
  if (value.detail === null) return { detail: null };
  const detail = value.detail;
  if (!hasOnlyKeys(detail, ["conversationId", "assistantMessageId", "content", "provenance", "annotations"]) || !isIdentifier(detail.conversationId) || !isIdentifier(detail.assistantMessageId) || typeof detail.content !== "string" || detail.content.length > 20_000) return null;
  const provenance = parsePlanningProvenance(detail.provenance);
  if (!provenance) return null;
  const annotations = parsePlanningAnnotations(detail.annotations, detail.content, new Set(provenance.filter((item): item is Extract<PlanningProvenance, { availability: "available" }> => item.availability === "available").map((item) => item.id)));
  if (!annotations) return null;
  return { detail: { conversationId: detail.conversationId, assistantMessageId: detail.assistantMessageId, content: detail.content, provenance, annotations } };
}

function isConversationSummary(value: unknown): value is ConversationSummary {
  if (!value || typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.id === "string" && summary.id.length > 0 && summary.id.length <= 128
    && typeof summary.updatedAt === "string" && isUtcIsoTimestamp(summary.updatedAt)
    && typeof summary.preview === "string" && summary.preview.length <= 61;
}

function isTravelerWorkspace(value: unknown): value is TravelerWorkspaceProjection { return hasOnlyKeys(value, ["focus", "timelineGroups", "constraints", "planHistory", "pendingProposals"]) && isWorkspaceFocus(value.focus) && Array.isArray(value.timelineGroups) && value.timelineGroups.length <= 60 && value.timelineGroups.every(isTimelineGroup) && (value.constraints === null || isWorkspaceConstraints(value.constraints)) && Array.isArray(value.planHistory) && value.planHistory.length <= 20 && value.planHistory.every(isHistoryEntry) && Array.isArray(value.pendingProposals) && value.pendingProposals.length <= 20 && value.pendingProposals.every(isPendingProposal); }
function isWorkspaceFocus(value: unknown) { if (!isRecord(value) || !isBoundedString(value.reason, 500) || !isBoundedString(value.sortKey, 500)) return false; if (value.kind === "preparation") return hasOnlyKeys(value, ["kind", "reason", "sortKey"]); if (value.kind === "pending-proposal" || value.kind === "pending-proposal-with-expiry") return hasOnlyKeys(value, ["kind", "proposalId", "reason", "sortKey"]) && isIdentifier(value.proposalId); return (value.kind === "confirmed-item-gap" || value.kind === "next-leg") && hasOnlyKeys(value, ["kind", "itemId", "reason", "sortKey"]) && isIdentifier(value.itemId); }
function isTimelineGroup(value: unknown) { return hasOnlyKeys(value, ["dateDivider", "legId", "entries"]) && (value.dateDivider === null || typeof value.dateDivider === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.dateDivider)) && isNullableIdentifier(value.legId) && Array.isArray(value.entries) && value.entries.length <= 60 && value.entries.every(isTimelineEntry); }
function isTimelineEntry(value: unknown) { return hasOnlyKeys(value, ["id", "kind", "anchorRole", "type", "state", "stateLabel", "typeLabel", "label", "plannedAt", "timeContext", "placeContext", "notesPreview", "parentItemId", "ordinal", "depth"]) && isIdentifier(value.id) && isOneOf(value.kind, ["anchor", "leg", "activity"]) && isNullableOneOf(value.anchorRole, ["origin", "destination", "region", "required_stop", "accommodation"]) && isNullableOneOf(value.type, ["transport", "visit", "food", "rest", "accommodation"]) && isOneOf(value.state, ["idea", "planned", "confirmed", "backup"]) && isBoundedString(value.stateLabel, 160) && isBoundedString(value.typeLabel, 160) && isBoundedString(value.label, 160) && isNullableUtcTimestamp(value.plannedAt) && isNullableBoundedString(value.timeContext, 160) && isNullableBoundedString(value.placeContext, 500) && isNullableBoundedString(value.notesPreview, 80) && isNullableIdentifier(value.parentItemId) && isNonnegativeInteger(value.ordinal) && isNonnegativeInteger(value.depth) && value.depth <= 1; }
function isWorkspaceConstraints(value: unknown) { return hasOnlyKeys(value, ["adultCount", "childCount", "childrenSummary", "vehicleType", "evChargingNeed", "drivingToleranceHours", "budgetCurrency", "budgetMinVnd", "budgetMaxVnd", "preferenceTags", "avoidItems"]) && isNullableIntegerInRange(value.adultCount, 20) && isNullableIntegerInRange(value.childCount, 20) && (value.adultCount !== null || value.childCount !== null) && (value.adultCount ?? 0) + (value.childCount ?? 0) >= 1 && (value.adultCount ?? 0) + (value.childCount ?? 0) <= 20 && Array.isArray(value.childrenSummary) && value.childrenSummary.length <= 10 && value.childrenSummary.every((child) => hasOnlyKeys(child, ["ageRange", "comfortTags", "preferenceTags"]) && isNullableBoundedString(child.ageRange, 32) && isBoundedStringArray(child.comfortTags, 6, 160) && isBoundedStringArray(child.preferenceTags, 6, 160)) && isNullableOneOf(value.vehicleType, ["car", "motorcycle", "ev"]) && isNullableOneOf(value.evChargingNeed, ["none", "preferred", "required"]) && (value.evChargingNeed === null || value.vehicleType === "ev") && isNullableIntegerInRange(value.drivingToleranceHours, 12) && (value.budgetCurrency === null || value.budgetCurrency === "VND") && isNullableIntegerInRange(value.budgetMinVnd, 1_000_000_000) && isNullableIntegerInRange(value.budgetMaxVnd, 1_000_000_000) && (value.budgetCurrency === null ? value.budgetMinVnd === null && value.budgetMaxVnd === null : value.budgetMinVnd !== null && value.budgetMaxVnd !== null && value.budgetMinVnd <= value.budgetMaxVnd) && isBoundedStringArray(value.preferenceTags, 20, 160) && Array.isArray(value.avoidItems) && value.avoidItems.length <= 20 && value.avoidItems.every((item) => hasOnlyKeys(item, ["category", "label"]) && (item.category === "place" || item.category === "activity") && isBoundedString(item.label, 120)); }
function isHistoryEntry(value: unknown) { return hasOnlyKeys(value, ["proposalId", "operationLabel", "actorLabel", "timestampLabel", "affectedItemLabels", "beforeAfter"]) && isNullableIdentifier(value.proposalId) && isBoundedString(value.operationLabel, 160) && isBoundedString(value.actorLabel, 160) && isBoundedString(value.timestampLabel, 160) && isBoundedStringArray(value.affectedItemLabels, 20, 160) && isBeforeAfterList(value.beforeAfter); }
function isPendingProposal(value: unknown) { return hasOnlyKeys(value, ["id", "expiresAt", "createdAt", "rationale", "status", "affectedItems", "beforeAfter", "alternatives", "hasAlternatives"]) && isIdentifier(value.id) && isNullableUtcTimestamp(value.expiresAt) && typeof value.createdAt === "string" && isUtcIsoTimestamp(value.createdAt) && isNullableBoundedString(value.rationale, 500) && value.status === "pending" && Array.isArray(value.affectedItems) && value.affectedItems.length <= 20 && value.affectedItems.every(isPendingProposalAffectedItem) && isBeforeAfterList(value.beforeAfter) && Array.isArray(value.alternatives) && value.alternatives.length <= 5 && value.alternatives.every((item) => hasOnlyKeys(item, ["summary"]) && isBoundedString(item.summary, 280)) && typeof value.hasAlternatives === "boolean"; }
function isPendingProposalAffectedItem(value: unknown) { return hasOnlyKeys(value, ["itemId", "kind", "label", "change"]) && isOneOf(value.kind, ["anchor", "leg", "activity"]) && isBoundedString(value.label, 160) && isOneOf(value.change, ["create", "update", "remove", "reorder", "change-state", "upsert-constraints"]) && (value.change === "create" ? isIdentifier(value.itemId) || value.itemId === "(mới)" : isIdentifier(value.itemId) && value.itemId !== "(mới)"); }
function isBeforeAfterList(value: unknown) { return Array.isArray(value) && value.length <= 20 && value.every((item) => hasOnlyKeys(item, ["operation", "before", "after"]) && isBoundedString(item.operation, 500) && isNullableBoundedString(item.before, 1_000) && isNullableBoundedString(item.after, 1_000)); }
function isBoundedStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] { return Array.isArray(value) && value.length <= maxItems && value.every((item) => isBoundedString(item, maxLength)); }

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function hasOnlyKeys(value: unknown, keys: string[]): value is Record<string, unknown> { return isRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function isIdentifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value; }
function isNullableIdentifier(value: unknown): value is string | null { return value === null || isIdentifier(value); }
function isNullableInteger(value: unknown): value is number | null { return value === null || typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isNullableIntegerInRange(value: unknown, maximum: number): value is number | null { return value === null || typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum; }
function isBoundedString(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value; }
function parseFactList(value: unknown, limit: number): TripAnswerContextResponse["anchors"] | null { return Array.isArray(value) && value.length <= limit && value.every((item) => hasOnlyKeys(item, ["field", "value", "source"]) && isBoundedString(item.field, 128) && isBoundedString(item.value, 500) && (item.source === "conversation" || item.source === "trip_project")) ? value.map((item) => ({ field: item.field as string, value: item.value as string, source: item.source as "conversation" | "trip_project" })) : null; }
function parsePlanItemList(value: unknown): TripAnswerContextResponse["planItems"] | null { return Array.isArray(value) && value.length <= planningContextPlanItemLimit && value.every((item) => hasOnlyKeys(item, ["id", "version", "kind", "anchorRole", "type", "state", "label", "ordinal", "parentItemId"]) && isIdentifier(item.id) && isPositiveInteger(item.version) && isOneOf(item.kind, ["anchor", "leg", "activity"]) && isNullableOneOf(item.anchorRole, ["origin", "destination", "region", "required_stop", "accommodation"]) && isNullableOneOf(item.type, ["transport", "visit", "food", "rest", "accommodation"]) && isOneOf(item.state, ["idea", "planned", "confirmed", "backup"]) && isBoundedString(item.label, 160) && isNonnegativeInteger(item.ordinal) && isNullableIdentifier(item.parentItemId)) ? value as TripAnswerContextResponse["planItems"] : null; }
function parseConstraints(value: unknown): TripAnswerContextResponse["constraints"] | undefined { if (value === null) return null; if (!hasOnlyKeys(value, ["version", "values"]) || !isPositiveInteger(value.version) || !isPlanningJsonObject(value.values, 0)) return undefined; return { version: value.version, values: value.values }; }
function parseConflictList(value: unknown): TripAnswerContextResponse["conflicts"] | null { return Array.isArray(value) && value.length <= 32 && value.every((item) => hasOnlyKeys(item, ["field", "canonicalValue", "lowerPriorityValue", "source", "priority", "material"]) && isBoundedString(item.field, 128) && isBoundedString(item.canonicalValue, 500) && isBoundedString(item.lowerPriorityValue, 500) && isOneOf(item.source, ["legacy_project", "project_chat", "conversation_chat"]) && item.priority === "lower" && item.material === true) ? value as TripAnswerContextResponse["conflicts"] : null; }
function parsePlanningProvenance(value: unknown): PlanningProvenance[] | null {
  if (!Array.isArray(value) || value.length > planningDetailProvenanceLimit || !value.every(isPlanningProvenance)) return null;
  const provenance = value as PlanningProvenance[];
  return new Set(provenance.map((item) => item.id)).size === provenance.length && provenance.every((item, index) => index === 0 || provenance[index - 1]!.rank < item.rank) ? provenance : null;
}
function isPlanningProvenance(value: unknown): value is PlanningProvenance { if (!isRecord(value) || !isIdentifier(value.id) || !isPositiveInteger(value.rank) || typeof value.usedInPrompt !== "boolean" || typeof value.citedInAnswer !== "boolean") return false; if (value.availability === "withdrawn") return hasOnlyKeys(value, ["id", "rank", "availability", "unavailableLabel", "usedInPrompt", "citedInAnswer"]) && value.unavailableLabel === "Nguồn này không còn khả dụng."; return hasOnlyKeys(value, ["id", "rank", "availability", "sourceCategory", "title", "sourceType", "url", "checkedAt", "confidenceLabel", "verificationStatus", "usedInPrompt", "citedInAnswer", "retrievalScore", "freshnessSensitive"]) && value.availability === "available" && isSourceCategory(value.sourceCategory) && isBoundedString(value.title, 500) && isNullableBoundedString(value.sourceType, 160) && isNullableUrl(value.url) && isNullableUtcTimestamp(value.checkedAt) && isBoundedString(value.confidenceLabel, 160) && (value.verificationStatus === "verified" || value.verificationStatus === "unverified") && (value.retrievalScore === null || typeof value.retrievalScore === "number" && Number.isFinite(value.retrievalScore)) && typeof value.freshnessSensitive === "boolean"; }
function parsePlanningAnnotations(value: unknown, content: string, availableProvenanceIds: Set<string>): PlanningAnnotation[] | null {
  if (!Array.isArray(value) || value.length > planningDetailAnnotationLimit || !value.every((item) => isPlanningAnnotation(item, content, availableProvenanceIds))) return null;
  const annotations = value as PlanningAnnotation[];
  return new Set(annotations.map((item) => item.id)).size === annotations.length && annotations.every((item, index) => index === 0 || annotations[index - 1]!.end <= item.start) ? annotations : null;
}
function isPlanningAnnotation(value: unknown, content: string, availableProvenanceIds: Set<string>): value is PlanningAnnotation { return hasOnlyKeys(value, ["id", "start", "end", "text", "type", "detail"]) && isIdentifier(value.id) && isNonnegativeInteger(value.start) && isPositiveInteger(value.end) && value.end > value.start && value.end <= content.length && content.slice(value.start, value.end) === value.text && isBoundedString(value.text, 2_000) && isAnnotationType(value.type) && isPlanningAnnotationDetail(value.detail, value.type, value.text, availableProvenanceIds, value.id); }
function isPlanningAnnotationDetail(value: unknown, type: PlanningAnnotationType, text: string, availableProvenanceIds: Set<string>, annotationId: string): boolean { if (!isRecord(value) || !isAnnotationType(value.type) || value.type !== type || value.label !== text || Object.keys(value).some((key) => !["type", "label", "section", "summary", "sourceCategory", "owner", "detail", "quickFacts", "provenanceIds", "action", "capability"].includes(key)) || !isBoundedString(value.label, 2_000) || (value.section !== undefined && !isBoundedString(value.section, 160)) || (value.summary !== undefined && !isBoundedString(value.summary, 500)) || (value.sourceCategory !== undefined && !isSourceCategory(value.sourceCategory)) || (value.owner !== undefined && (!hasOnlyKeys(value.owner, ["table", "id"]) || value.owner.table !== "assistant_response_provenance" || !isIdentifier(value.owner.id))) || (value.detail !== undefined && !isSafeDetail(value.detail)) || (value.quickFacts !== undefined && !isQuickFacts(value.quickFacts)) || (value.provenanceIds !== undefined && !isProvenanceIds(value.provenanceIds))) return false; const provenanceIds = Array.isArray(value.provenanceIds) ? value.provenanceIds as string[] : undefined; const ownerId = isRecord(value.owner) && typeof value.owner.id === "string" ? value.owner.id : undefined; if (provenanceIds && !provenanceIds.every((id) => availableProvenanceIds.has(id))) return false; if (type !== "warning" && type !== "trip_fact" && type !== "action" && (!provenanceIds || provenanceIds.length === 0)) return false; if (ownerId !== undefined && (!provenanceIds || !provenanceIds.includes(ownerId))) return false; if ((value.action !== undefined || value.capability !== undefined) && type !== "action") return false; if (value.action !== undefined && (!isAction(value.action, text) || !isExpectedAction(annotationId, value.action))) return false; if (value.capability !== undefined && (!isCapability(value.capability, text) || !isExpectedAction(annotationId, value.capability))) return false; return value.capability === undefined || value.action !== undefined && sameActionCommand(value.capability, value.action); }
function isSafeDetail(value: unknown): boolean { return isRecord(value) && Object.keys(value).length <= planningDetailQuickFactLimit && Object.entries(value).every(([key, item]) => ["Loại", "Độ tin cậy", "Trạng thái", "URL", "Ngày kiểm tra", "Độ mới", "Nhãn nguồn"].includes(key) && isBoundedString(item, 160)); }
function isQuickFacts(value: unknown): boolean { return Array.isArray(value) && value.length <= planningDetailQuickFactLimit && value.every((item) => hasOnlyKeys(item, ["label", "value"]) && isBoundedString(item.label, 160) && isBoundedString(item.value, 160)); }
function isProvenanceIds(value: unknown): boolean { return Array.isArray(value) && value.length <= planningDetailQuickFactLimit && value.every(isIdentifier) && new Set(value).size === value.length; }
function isAction(value: unknown, text: string): boolean { return hasOnlyKeys(value, ["command", "label", "arguments", "anchor"]) && isActionCommand(value.command) && value.label === text && hasOnlyKeys(value.arguments, []) && value.anchor === "trip-change-proposal-action.v1"; }
function isCapability(value: unknown, text: string): boolean { return hasOnlyKeys(value, ["command", "label", "available"]) && isActionCommand(value.command) && value.label === text && value.available === true; }
function sameActionCommand(capability: unknown, action: unknown): boolean { return isRecord(capability) && isRecord(action) && capability.command === action.command; }
function isExpectedAction(annotationId: string, action: unknown): boolean { return isRecord(action) && (annotationId === "trip-change-proposal-apply" && action.command === "trip_change_proposal.apply" || annotationId === "trip-change-proposal-dismiss" && action.command === "trip_change_proposal.dismiss"); }
function isActionCommand(value: unknown): boolean { return value === "trip_change_proposal.apply" || value === "trip_change_proposal.dismiss"; }
function isSourceCategory(value: unknown): value is PlanningSourceCategory { return isOneOf(value, ["knowledge", "web", "trip_context", "chat_context", "general"]); }
function isAnnotationType(value: unknown): value is PlanningAnnotationType { return isOneOf(value, ["source", "warning", "trip_fact", "action", "place", "hotel_area", "route_segment", "cost"]); }
function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T { return typeof value === "string" && choices.includes(value as T); }
function isNullableOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T | null { return value === null || isOneOf(value, choices); }
function isPositiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 1; }
function isNonnegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isNullableBoundedString(value: unknown, maximum: number): boolean { return value === null || isBoundedString(value, maximum); }
function isNullableUrl(value: unknown): boolean { if (value === null) return true; if (!isBoundedString(value, 2_000)) return false; try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }
function isNullableUtcTimestamp(value: unknown): boolean { return value === null || typeof value === "string" && isUtcIsoTimestamp(value); }
function isPlanningJsonObject(value: unknown, depth: number): value is Record<string, PlanningJsonValue> { return isRecord(value) && Object.keys(value).length <= 24 && Object.entries(value).every(([key, item]) => isBoundedString(key, 128) && isPlanningJsonValue(item, depth + 1)); }
function isPlanningJsonValue(value: unknown, depth: number): value is PlanningJsonValue { if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value) || typeof value === "string" && value.length <= 500) return true; if (depth > 4) return false; return Array.isArray(value) ? value.length <= 12 && value.every((item) => isPlanningJsonValue(item, depth + 1)) : isPlanningJsonObject(value, depth); }

function isUtcIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function isBffIssuer(value: unknown): value is BffIssuer {
  return typeof value === "string" && (bffIssuers as readonly string[]).includes(value);
}

export function isRequestRole(value: unknown): value is RequestRole {
  return typeof value === "string" && (requestRoles as readonly string[]).includes(value);
}

export function parseSafeApiError(value: unknown): SafeApiError | null {
  if (!value || typeof value !== "object") return null;
  const error = value as Record<string, unknown>;
  if (!isSafeApiErrorCode(error.code) || typeof error.message !== "string" || !isRequestId(error.requestId)) return null;
  if (error.violations === undefined) return { code: error.code, message: error.message, requestId: error.requestId };
  if (!Array.isArray(error.violations) || error.violations.length > 20 || !error.violations.every(isSafeFieldViolation)) return null;
  return { code: error.code, message: error.message, requestId: error.requestId, violations: error.violations };
}

function isSafeApiErrorCode(value: unknown): value is SafeApiErrorCode {
  return typeof value === "string" && (safeApiErrorCodes as readonly string[]).includes(value);
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isSafeFieldViolation(value: unknown): value is SafeFieldViolation {
  if (!value || typeof value !== "object") return false;
  const violation = value as Record<string, unknown>;
  return typeof violation.field === "string" && violation.field.length > 0 && violation.field.length <= 128
    && typeof violation.code === "string" && violation.code.length > 0 && violation.code.length <= 64
    && typeof violation.message === "string" && violation.message.length > 0 && violation.message.length <= 256;
}
