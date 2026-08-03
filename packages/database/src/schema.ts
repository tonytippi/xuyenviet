import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleValues = ["traveler", "operator", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const auditOperationValues = ["access_check", "create", "update", "delete", "archive", "approve", "apply", "dismiss", "expire"] as const;
export type AuditOperation = (typeof auditOperationValues)[number];

export const auditActorClassValues = ["user", "system"] as const;
export type AuditActorClass = (typeof auditActorClassValues)[number];

export const tripChangeProposalCreatorClassValues = ["ai_orchestration", "owner_command"] as const;
export type TripChangeProposalCreatorClass = (typeof tripChangeProposalCreatorClassValues)[number];

export const tripChangeProposalStatusValues = ["pending", "applied", "dismissed", "expired"] as const;
export type TripChangeProposalStatus = (typeof tripChangeProposalStatusValues)[number];

export const tripPlanChangeHistoryActorClassValues = ["user", "system"] as const;
export type TripPlanChangeHistoryActorClass = (typeof tripPlanChangeHistoryActorClassValues)[number];

export const tripPlanChangeHistoryOperationClassValues = ["apply", "dismiss", "expire"] as const;
export type TripPlanChangeHistoryOperationClass = (typeof tripPlanChangeHistoryOperationClassValues)[number];

export const messageRoleValues = ["user", "assistant"] as const;
export type MessageRole = (typeof messageRoleValues)[number];

export const aiUsageStatusValues = ["success", "failure"] as const;
export type AiUsageStatus = (typeof aiUsageStatusValues)[number];

export const aiAskCommandStatusValues = ["pending", "completed", "failed", "aborted", "discarded"] as const;
export type AiAskCommandStatus = (typeof aiAskCommandStatusValues)[number];

export const domainOutboxStatusValues = ["pending", "processing", "completed", "failed"] as const;
export type DomainOutboxStatus = (typeof domainOutboxStatusValues)[number];

export const aiAskDomainOutboxEventTypeValues = ["ai_ask.context_extraction.v1", "ai_ask.answer_annotation.v1", "ai_ask.trip_proposal_draft.v1"] as const;
export type AiAskDomainOutboxEventType = (typeof aiAskDomainOutboxEventTypeValues)[number];

export const aiGatewayModelPurposeValues = ["ai_ask_initial_answer", "extraction", "embeddings", "evaluation"] as const;
export type AiGatewayModelPurpose = (typeof aiGatewayModelPurposeValues)[number];

export const sourceKindValues = ["url", "facebook", "youtube", "copied_post", "pasted_text", "screenshot"] as const;
export type SourceKind = (typeof sourceKindValues)[number];

export const sourceTypeValues = ["curated", "community"] as const;
export type SourceType = (typeof sourceTypeValues)[number];

export const sourceVerificationStatusValues = ["unverified", "verified"] as const;
export type SourceVerificationStatus = (typeof sourceVerificationStatusValues)[number];

export const sourceEligibilityValues = ["eligible", "withdrawn"] as const;
export type SourceEligibility = (typeof sourceEligibilityValues)[number];

export const sourceRemovalReasonValues = ["withdrawn", "inaccessible", "removed"] as const;
export type SourceRemovalReason = (typeof sourceRemovalReasonValues)[number];

export const knowledgeCardStatusValues = ["draft", "approved", "archived", "rejected", "duplicate", "no_action"] as const;
export type KnowledgeCardStatus = (typeof knowledgeCardStatusValues)[number];

export const knowledgePublicationStateValues = ["active", "suppressed", "archived"] as const;
export type KnowledgePublicationState = (typeof knowledgePublicationStateValues)[number];

export const knowledgeStateValues = ["community_observation", "community_pattern", "conditional", "uncertain", "conflicted", "confirmed", "superseded"] as const;
export type KnowledgeState = (typeof knowledgeStateValues)[number];

export const knowledgeReviewStateValues = ["none", "ai_recommended", "in_review", "reviewed"] as const;
export type KnowledgeReviewState = (typeof knowledgeReviewStateValues)[number];

export const knowledgeVerificationStateValues = ["not_required", "required", "corroborated", "failed"] as const;
export type KnowledgeVerificationState = (typeof knowledgeVerificationStateValues)[number];

export const knowledgeCardTypeValues = [
  "place",
  "food",
  "hotel_area",
  "activity",
  "service",
  "route_note",
  "warning",
  "cost_note",
  "parking",
  "ev_charging",
  "kid_friendly_tip",
  "discount_promotion",
  "general_travel_tip",
] as const;
export type KnowledgeCardType = (typeof knowledgeCardTypeValues)[number];

export const knowledgeConfidenceValues = ["unverified", "community", "curated", "partner", "official"] as const;
export type KnowledgeConfidence = (typeof knowledgeConfidenceValues)[number];

export const knowledgeSourceSupportValues = ["primary", "supporting", "conflicting"] as const;
export type KnowledgeSourceSupport = (typeof knowledgeSourceSupportValues)[number];

export const knowledgeEvidenceDisplayPolicyValues = ["fact_only", "traveler_visible", "operator_only"] as const;
export type KnowledgeEvidenceDisplayPolicy = (typeof knowledgeEvidenceDisplayPolicyValues)[number];

export const knowledgeEvidenceStateValues = ["active", "removed"] as const;
export type KnowledgeEvidenceState = (typeof knowledgeEvidenceStateValues)[number];

export const knowledgeSearchDocumentStatusValues = ["active", "disabled", "stale"] as const;
export type KnowledgeSearchDocumentStatus = (typeof knowledgeSearchDocumentStatusValues)[number];

export const knowledgeIndexDirtyMarkerStatusValues = ["pending", "claimed", "completed", "failed", "superseded"] as const;
export type KnowledgeIndexDirtyMarkerStatus = (typeof knowledgeIndexDirtyMarkerStatusValues)[number];

export const webSearchResultSourceTypeValues = ["official", "provider", "community", "general"] as const;
export type WebSearchResultSourceType = (typeof webSearchResultSourceTypeValues)[number];

export const webSearchResultConfidenceValues = ["unverified"] as const;
export type WebSearchResultConfidence = (typeof webSearchResultConfidenceValues)[number];

export const assistantProvenanceSourceCategoryValues = ["trip_context", "chat_context", "knowledge", "web", "general"] as const;
export type AssistantProvenanceSourceCategory = (typeof assistantProvenanceSourceCategoryValues)[number];

export const assistantProvenanceVerificationStatusValues = ["unverified", "verified"] as const;
export type AssistantProvenanceVerificationStatus = (typeof assistantProvenanceVerificationStatusValues)[number];

export const assistantProvenanceAvailabilityValues = ["available", "withdrawn"] as const;
export type AssistantProvenanceAvailability = (typeof assistantProvenanceAvailabilityValues)[number];

export const answerUsefulnessRatingValues = ["useful", "not_useful"] as const;
export type AnswerUsefulnessRating = (typeof answerUsefulnessRatingValues)[number];

export const publicMvpEvaluationPromptTypeValues = ["magic_moment_family_trip", "sparse_data", "freshness_sensitive", "service_activity", "route_logistics"] as const;
export type PublicMvpEvaluationPromptType = (typeof publicMvpEvaluationPromptTypeValues)[number];

export const publicMvpEvaluationRunStatusValues = ["running", "completed", "partial_failed", "failed"] as const;
export type PublicMvpEvaluationRunStatus = (typeof publicMvpEvaluationRunStatusValues)[number];

export const publicMvpEvaluationResultStatusValues = ["scored", "failed", "unscored"] as const;
export type PublicMvpEvaluationResultStatus = (typeof publicMvpEvaluationResultStatusValues)[number];

export const publicMvpEvaluationScoreDimensionValues = ["user_context_use", "practical_specificity", "source_grounding", "uncertainty_handling", "family_awareness", "vietnamese_clarity"] as const;
export type PublicMvpEvaluationScoreDimension = (typeof publicMvpEvaluationScoreDimensionValues)[number];

export const publicMvpEvaluationScenarioIdValues = ["community_observation", "independent_community_pattern", "conditional_high_risk_claim", "conflict_exclusion", "source_withdrawal", "web_fallback_unavailable"] as const;
export type PublicMvpEvaluationScenarioId = (typeof publicMvpEvaluationScenarioIdValues)[number];

export const knowledgeSuggestionActionValues = ["create", "update", "conflict", "duplicate", "no_action"] as const;
export type KnowledgeSuggestionAction = (typeof knowledgeSuggestionActionValues)[number];

export const knowledgeSeedBatchItemStatusValues = ["pending", "reading", "extracted", "needs_review", "approved", "failed", "duplicate", "rejected"] as const;
export type KnowledgeSeedBatchItemStatus = (typeof knowledgeSeedBatchItemStatusValues)[number];

export const facebookCaptureReviewStatusValues = ["needs_review", "rejected", "extracted", "extracted_approved", "extraction_failed"] as const;
export type FacebookCaptureReviewStatus = (typeof facebookCaptureReviewStatusValues)[number];

export const knowledgeExtractionJobModeValues = ["extract_only", "extract_and_approve_all"] as const;
export type KnowledgeExtractionJobMode = (typeof knowledgeExtractionJobModeValues)[number];

export const knowledgeExtractionJobStatusValues = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type KnowledgeExtractionJobStatus = (typeof knowledgeExtractionJobStatusValues)[number];

export const knowledgeIngestionStageValues = ["queued", "triaging", "extracting", "judging", "relating", "published", "suppressed", "review_recommended", "verify_first", "failed"] as const;
export type KnowledgeIngestionStage = (typeof knowledgeIngestionStageValues)[number];

export const knowledgeIngestionCandidateStageValues = ["queued", "judging", "relating", "published", "suppressed", "review_recommended", "verify_first", "failed"] as const;
export type KnowledgeIngestionCandidateStage = (typeof knowledgeIngestionCandidateStageValues)[number];

export const knowledgeRecommendationStatusValues = ["open", "in_review", "resolved", "superseded"] as const;
export type KnowledgeRecommendationStatus = (typeof knowledgeRecommendationStatusValues)[number];

export const knowledgeRecommendationReasonValues = ["risk", "weak_evidence", "freshness", "conflict", "duplicate_risk", "missing_context", "verification", "relation", "sampling"] as const;
export type KnowledgeRecommendationReason = (typeof knowledgeRecommendationReasonValues)[number];

export const knowledgeRecommendationActionValues = ["accept_wording", "edit", "promote", "suppress", "restore", "verify", "resolve_relation", "sampling_pass", "sampling_fail"] as const;
export type KnowledgeRecommendationAction = (typeof knowledgeRecommendationActionValues)[number];

export const knowledgeRecommendationResolutionValues = ["accepted", "edited", "suppressed", "restored", "verified", "relation_resolved", "sampling_passed", "sampling_failed"] as const;
export type KnowledgeRecommendationResolution = (typeof knowledgeRecommendationResolutionValues)[number];

export const knowledgeSamplingDispositionReasonValues = ["confirmed", "minor_issue", "insufficient_evidence", "stale_or_changed", "material_error", "safety_risk"] as const;
export type KnowledgeSamplingDispositionReason = (typeof knowledgeSamplingDispositionReasonValues)[number];

export const chatContextFieldValues = [
  "origin",
  "destination",
  "start_date",
  "end_date",
  "duration",
  "adults",
  "children",
  "children_ages",
  "budget",
  "hotel_style",
  "driving_tolerance",
  "vehicle_needs",
  "food_preferences",
  "activity_preferences",
  "itinerary_constraints",
  "avoid_places",
  "prior_trips",
  "notes",
] as const;
export type ChatContextField = (typeof chatContextFieldValues)[number];

export const chatContextScopeValues = ["conversation", "trip_project"] as const;
export type ChatContextScope = (typeof chatContextScopeValues)[number];

export const chatContextStatusValues = ["active", "deleted"] as const;
export type ChatContextStatus = (typeof chatContextStatusValues)[number];

export const tripPlanItemKindValues = ["anchor", "leg", "activity"] as const;
export type TripPlanItemKind = (typeof tripPlanItemKindValues)[number];
export const tripPlanAnchorRoleValues = ["origin", "destination", "region", "required_stop", "accommodation"] as const;
export type TripPlanAnchorRole = (typeof tripPlanAnchorRoleValues)[number];
export const tripPlanItemTypeValues = ["transport", "visit", "food", "rest", "accommodation"] as const;
export type TripPlanItemType = (typeof tripPlanItemTypeValues)[number];
export const tripPlanItemStateValues = ["idea", "planned", "confirmed", "backup"] as const;
export type TripPlanItemState = (typeof tripPlanItemStateValues)[number];
export const childComfortTagValues = ["car_seat", "stroller", "nap_breaks", "short_drive_blocks", "quiet_time"] as const;
export const childPreferenceTagValues = ["animals", "beach", "culture", "food", "nature", "outdoor", "playground"] as const;
export const tripPreferenceTagValues = ["beach", "culture", "family_friendly", "food", "nature", "quiet", "road_trip", "scenic_route"] as const;

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  authorizationVersion: integer("authorization_version").default(1).notNull(),
}, (user) => [
  check(
    "users_no_system_executor_id_check",
    sql`${user.id} not in ('system-ai-orchestration', 'system-knowledge-pipeline', 'system-trip-planning', 'system-facebook-capture', 'system-youtube-capture', 'system-admin-bootstrap')`,
  ),
]);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// Admin browser sessions are deliberately not Auth.js traveler sessions. The
// API Identity boundary owns this separate namespace and revocation lifecycle.
export const adminSessions = pgTable("admin_sessions", {
  // This is an HMAC lookup value, never the browser bearer session ID.
  sessionLookupHash: text("session_lookup_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
}, (session) => [index("admin_sessions_live_user_idx").on(session.userId, session.expires)]);

export const adminOAuthTransactions = pgTable("admin_oauth_transactions", {
  id: text("id").primaryKey(),
  state: text("state").notNull().unique(),
  codeVerifier: text("code_verifier").notNull(),
  callbackUrl: text("callback_url").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// This namespace is intentionally separate from Auth.js `sessions` and admin sessions.
export const browserSessions = pgTable("browser_sessions", {
  sessionLookupHash: text("session_lookup_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  csrfHash: text("csrf_hash").notNull(),
  authorizationVersion: integer("authorization_version").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
  revokedAt: timestamp("revoked_at", { mode: "date" }),
}, (session) => [index("browser_sessions_live_user_idx").on(session.userId, session.expires)]);

export const browserOAuthTransactions = pgTable("browser_oauth_transactions", {
  id: text("id").primaryKey(),
  stateHash: text("state_hash").notNull().unique(),
  codeVerifierCiphertext: text("code_verifier_ciphertext").notNull(),
  returnUrl: text("return_url").notNull(),
  referralCode: text("referral_code"),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (transaction) => [index("browser_oauth_transactions_expires_idx").on(transaction.expires)]);

export const releaseSchemaVersions = pgTable("release_schema_versions", {
  version: text("version").primaryKey(),
  recordedAt: timestamp("recorded_at", { mode: "date" }).defaultNow().notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<UserRole>().notNull(),
  },
  (userRole) => [
    primaryKey({ columns: [userRole.userId, userRole.role] }),
    index("user_roles_user_id_idx").on(userRole.userId),
    check("user_roles_role_check", sql`${userRole.role} in ('traveler', 'operator', 'admin')`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorUserId: text("actor_user_id")
      .references(() => users.id, { onDelete: "restrict" }),
    actorEmail: text("actor_email"),
    operation: text("operation").$type<AuditOperation>().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    beforeSummary: text("before_summary"),
    afterSummary: text("after_summary"),
    actorClass: text("actor_class").$type<AuditActorClass>().default("user").notNull(),
    actorSystem: text("actor_system"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (auditEvent) => [
    index("audit_events_actor_user_id_idx").on(auditEvent.actorUserId),
    index("audit_events_target_idx").on(auditEvent.targetType, auditEvent.targetId),
    index("audit_events_created_at_idx").on(auditEvent.createdAt),
    check(
      "audit_events_operation_check",
      sql`${auditEvent.operation} in ('access_check', 'create', 'update', 'delete', 'archive', 'approve', 'apply', 'dismiss', 'expire')`,
    ),
    check("audit_events_actor_class_check", sql`${auditEvent.actorClass} in ('user', 'system')`),
    check(
      "audit_events_actor_shape_check",
      sql`(${auditEvent.actorClass} = 'user' and ${auditEvent.actorUserId} is not null and ${auditEvent.actorEmail} is not null and length(btrim(${auditEvent.actorEmail})) > 0 and ${auditEvent.actorSystem} is null) or (${auditEvent.actorClass} = 'system' and ${auditEvent.actorUserId} is null and ${auditEvent.actorEmail} is null and ${auditEvent.actorSystem} is not null and length(btrim(${auditEvent.actorSystem})) > 0)`,
    ),
  ],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    kind: text("kind").$type<SourceKind>().notNull(),
    url: text("url"),
    canonicalUrl: text("canonical_url"),
    label: text("label").notNull(),
    publisher: text("publisher"),
    collectedDate: text("collected_date"),
    sourceType: text("source_type").$type<SourceType>().notNull(),
    verificationStatus: text("verification_status").$type<SourceVerificationStatus>().default("unverified").notNull(),
    official: boolean("official").default(false).notNull(),
    partner: boolean("partner").default(false).notNull(),
    eligibility: text("eligibility").$type<SourceEligibility>().default("eligible").notNull(),
    removalReason: text("removal_reason").$type<SourceRemovalReason>(),
    removedByUserId: text("removed_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    removalCompletedAt: timestamp("removal_completed_at", { mode: "date" }),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    currentCaptureVersionId: text("current_capture_version_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (source) => [
    index("sources_kind_created_at_idx").on(source.kind, source.createdAt),
    index("sources_canonical_url_idx").on(source.canonicalUrl),
    index("sources_submitted_by_user_id_idx").on(source.submittedByUserId),
    index("sources_current_capture_version_id_idx").on(source.currentCaptureVersionId),
    index("sources_eligibility_idx").on(source.eligibility, source.removalCompletedAt),
    uniqueIndex("sources_id_current_capture_version_id_idx").on(source.id, source.currentCaptureVersionId),
    check("sources_kind_check", sql`${source.kind} in ('url', 'facebook', 'youtube', 'copied_post', 'pasted_text', 'screenshot')`),
    check("sources_source_type_check", sql`${source.sourceType} in ('curated', 'community')`),
    check("sources_verification_status_check", sql`${source.verificationStatus} in ('unverified', 'verified')`),
    check("sources_eligibility_check", sql`${source.eligibility} in ('eligible', 'withdrawn')`),
    check("sources_removal_reason_check", sql`${source.removalReason} is null or ${source.removalReason} in ('withdrawn', 'inaccessible', 'removed')`),
    check("sources_removal_shape_check", sql`(${source.eligibility} = 'eligible' and ${source.removalReason} is null and ${source.removedByUserId} is null and ${source.removalCompletedAt} is null) or (${source.eligibility} = 'withdrawn' and ${source.removalReason} is not null and ${source.removedByUserId} is not null and ${source.removalCompletedAt} is not null)`),
    check("sources_label_safe_metadata_check", sql`length(btrim(${source.label})) between 1 and 200 and position(chr(10) in ${source.label}) = 0 and position(chr(13) in ${source.label}) = 0`),
    check("sources_publisher_safe_metadata_check", sql`${source.publisher} is null or (length(btrim(${source.publisher})) between 1 and 160 and position(chr(10) in ${source.publisher}) = 0 and position(chr(13) in ${source.publisher}) = 0)`),
    check("sources_collected_date_valid_check", sql`${source.collectedDate} is null or (${source.collectedDate} ~ '^\\d{4}-\\d{2}-\\d{2}$' and to_char(to_date(${source.collectedDate}, 'YYYY-MM-DD'), 'YYYY-MM-DD') = ${source.collectedDate})`),
    check("sources_url_kind_check", sql`${source.kind} not in ('url', 'facebook', 'youtube') or ${source.url} is not null`),
    check("sources_no_url_for_textual_kind_check", sql`${source.kind} not in ('copied_post', 'pasted_text', 'screenshot') or ${source.url} is null`),
    check("sources_community_defaults_check", sql`${source.sourceType} <> 'community' or (${source.verificationStatus} = 'unverified' and ${source.official} = false and ${source.partner} = false)`),
    check("sources_youtube_defaults_check", sql`${source.kind} <> 'youtube' or (${source.sourceType} = 'community' and ${source.verificationStatus} = 'unverified' and ${source.official} = false and ${source.partner} = false)`),
  ],
);

export const sourceCaptureVersions = pgTable(
  "source_capture_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    versionSequence: integer("version_sequence").notNull(),
    captureKind: text("capture_kind").$type<SourceKind>().notNull(),
    rawText: text("raw_text"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    storageKey: text("storage_key"),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>(),
    contentHash: text("content_hash").notNull(),
    executorSystem: text("executor_system"),
    capturedAt: timestamp("captured_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    payloadDeletedAt: timestamp("payload_deleted_at", { mode: "date" }),
  },
  (version) => [
    uniqueIndex("source_capture_versions_id_source_id_idx").on(version.id, version.sourceId),
    uniqueIndex("source_capture_versions_source_sequence_idx").on(version.sourceId, version.versionSequence),
    index("source_capture_versions_executor_system_captured_at_idx").on(version.executorSystem, version.capturedAt),
    index("source_capture_versions_source_captured_at_idx").on(version.sourceId, version.capturedAt),
    index("source_capture_versions_retention_idx").on(version.captureKind, version.capturedAt).where(sql`${version.payloadDeletedAt} is null`),
    check("source_capture_versions_sequence_check", sql`${version.versionSequence} >= 1`),
    check("source_capture_versions_hash_check", sql`${version.contentHash} ~ '^[a-f0-9]{64}$'`),
    check("source_capture_versions_kind_check", sql`${version.captureKind} in ('url', 'facebook', 'youtube', 'copied_post', 'pasted_text', 'screenshot')`),
    check("source_capture_versions_executor_system_check", sql`${version.executorSystem} is null or length(btrim(${version.executorSystem})) between 1 and 160`),
    check("source_capture_versions_text_length_check", sql`${version.rawText} is null or (length(btrim(${version.rawText})) > 0 and char_length(${version.rawText}) <= 120000)`),
    check("source_capture_versions_tombstone_shape_check", sql`${version.payloadDeletedAt} is null or (${version.rawText} is null and ${version.fileName} is null and ${version.mimeType} is null and ${version.byteSize} is null and ${version.storageKey} is null and ${version.rawMetadata} is null)`),
  ],
);

export const rawSourceMaterial = pgTable(
  "raw_source_material",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    rawText: text("raw_text"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    storageKey: text("storage_key"),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (material) => [
    uniqueIndex("raw_source_material_source_id_idx").on(material.sourceId),
    check("raw_source_material_text_length_check", sql`${material.rawText} is null or (length(btrim(${material.rawText})) > 0 and char_length(${material.rawText}) <= 120000)`),
    check("raw_source_material_file_name_check", sql`${material.fileName} is null or length(btrim(${material.fileName})) > 0`),
    check("raw_source_material_mime_type_check", sql`${material.mimeType} is null or ${material.mimeType} in ('image/jpeg', 'image/png', 'image/webp')`),
    check("raw_source_material_byte_size_check", sql`${material.byteSize} is null or (${material.byteSize} > 0 and ${material.byteSize} <= 5242880)`),
    check(
      "raw_source_material_file_metadata_complete_check",
      sql`(${material.fileName} is null and ${material.mimeType} is null and ${material.byteSize} is null) or (${material.fileName} is not null and ${material.mimeType} is not null and ${material.byteSize} is not null)`,
    ),
  ],
);

export const facebookCaptureReviews = pgTable(
  "facebook_capture_reviews",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    rawSourceMaterialId: text("raw_source_material_id").notNull(),
    captureVersionId: text("capture_version_id"),
    status: text("status").$type<FacebookCaptureReviewStatus>().default("needs_review").notNull(),
    reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    rejectionReason: text("rejection_reason"),
    extractionError: text("extraction_error"),
    forceLiveCapture: boolean("force_live_capture").default(false).notNull(),
    forceLiveCaptureGeneration: integer("force_live_capture_generation").default(0).notNull(),
    executorSystem: text("executor_system"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (review) => [
    uniqueIndex("facebook_capture_reviews_source_id_idx").on(review.sourceId),
    index("facebook_capture_reviews_raw_material_id_idx").on(review.rawSourceMaterialId),
    index("facebook_capture_reviews_capture_version_id_idx").on(review.captureVersionId),
    index("facebook_capture_reviews_status_updated_at_idx").on(review.status, review.updatedAt),
    index("facebook_capture_reviews_executor_system_updated_at_idx").on(review.executorSystem, review.updatedAt),
    foreignKey({
      columns: [review.rawSourceMaterialId],
      foreignColumns: [rawSourceMaterial.id],
      name: "facebook_capture_reviews_raw_material_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [review.captureVersionId, review.sourceId],
      foreignColumns: [sourceCaptureVersions.id, sourceCaptureVersions.sourceId],
      name: "facebook_capture_reviews_capture_version_source_fk",
    }).onDelete("restrict"),
    check("facebook_capture_reviews_status_check", sql`${review.status} in ('needs_review', 'rejected', 'extracted', 'extracted_approved', 'extraction_failed')`),
    check("facebook_capture_reviews_rejection_reason_check", sql`${review.rejectionReason} is null or (${review.status} = 'rejected' and length(btrim(${review.rejectionReason})) between 1 and 500 and position(chr(10) in ${review.rejectionReason}) = 0 and position(chr(13) in ${review.rejectionReason}) = 0)`),
    check("facebook_capture_reviews_extraction_error_check", sql`${review.extractionError} is null or (${review.status} = 'extraction_failed' and length(btrim(${review.extractionError})) between 1 and 500 and position(chr(10) in ${review.extractionError}) = 0 and position(chr(13) in ${review.extractionError}) = 0)`),
    check("facebook_capture_reviews_reviewer_shape_check", sql`${review.status} = 'needs_review' or (${review.reviewerUserId} is not null and ${review.executorSystem} is null and ${review.reviewedAt} is not null) or (${review.reviewerUserId} is null and ${review.executorSystem} is not null and length(btrim(${review.executorSystem})) between 1 and 160 and ${review.reviewedAt} is not null)`),
    check("facebook_capture_reviews_executor_system_check", sql`${review.executorSystem} is null or length(btrim(${review.executorSystem})) between 1 and 160`),
    check("facebook_capture_reviews_updated_after_created_check", sql`${review.updatedAt} >= ${review.createdAt}`),
  ],
);

export const knowledgeExtractionJobs = pgTable(
  "knowledge_extraction_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    facebookCaptureReviewId: text("facebook_capture_review_id").references(() => facebookCaptureReviews.id, { onDelete: "set null" }),
    captureVersionId: text("capture_version_id"),
    mode: text("mode").$type<KnowledgeExtractionJobMode>().notNull(),
    status: text("status").$type<KnowledgeExtractionJobStatus>().default("queued").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    nextRunAt: timestamp("next_run_at", { mode: "date" }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { mode: "date" }),
    lockedBy: text("locked_by"),
    startedAt: timestamp("started_at", { mode: "date" }),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    resultDraftIds: jsonb("result_draft_ids").$type<string[]>(),
    resultDraftCount: integer("result_draft_count"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (job) => [
    index("knowledge_extraction_jobs_queue_idx").on(job.status, job.nextRunAt, job.createdAt),
    index("knowledge_extraction_jobs_source_status_idx").on(job.sourceId, job.status),
    index("knowledge_extraction_jobs_review_status_idx").on(job.facebookCaptureReviewId, job.status),
    index("knowledge_extraction_jobs_capture_version_id_idx").on(job.captureVersionId),
    index("knowledge_extraction_jobs_stale_running_idx").on(job.status, job.lockedAt),
    foreignKey({
      columns: [job.captureVersionId, job.sourceId],
      foreignColumns: [sourceCaptureVersions.id, sourceCaptureVersions.sourceId],
      name: "knowledge_extraction_jobs_capture_version_source_fk",
    }).onDelete("restrict"),
    check("knowledge_extraction_jobs_mode_check", sql`${job.mode} in ('extract_only', 'extract_and_approve_all')`),
    check("knowledge_extraction_jobs_status_check", sql`${job.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`),
    check("knowledge_extraction_jobs_attempt_count_check", sql`${job.attemptCount} >= 0 and ${job.attemptCount} <= ${job.maxAttempts}`),
    check("knowledge_extraction_jobs_max_attempts_check", sql`${job.maxAttempts} between 1 and 10`),
    check("knowledge_extraction_jobs_lock_shape_check", sql`(${job.status} <> 'running') or (${job.lockedAt} is not null and ${job.lockedBy} is not null and ${job.startedAt} is not null)`),
    check("knowledge_extraction_jobs_finished_shape_check", sql`${job.status} not in ('succeeded', 'failed', 'cancelled') or ${job.finishedAt} is not null`),
    check("knowledge_extraction_jobs_error_message_check", sql`${job.lastErrorMessage} is null or (length(btrim(${job.lastErrorMessage})) between 1 and 500 and position(chr(10) in ${job.lastErrorMessage}) = 0 and position(chr(13) in ${job.lastErrorMessage}) = 0)`),
    check("knowledge_extraction_jobs_result_draft_ids_check", sql`${job.resultDraftIds} is null or jsonb_typeof(${job.resultDraftIds}) = 'array'`),
    check("knowledge_extraction_jobs_result_draft_count_check", sql`${job.resultDraftCount} is null or ${job.resultDraftCount} >= 0`),
    check("knowledge_extraction_jobs_created_by_email_check", sql`length(btrim(${job.createdByEmail})) > 0 and char_length(${job.createdByEmail}) <= 320`),
  ],
);

export const knowledgeIngestionJobs = pgTable(
  "knowledge_ingestion_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    captureVersionId: text("capture_version_id").notNull(),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    submittedByEmail: text("submitted_by_email").notNull(),
    stage: text("stage").$type<KnowledgeIngestionStage>().default("queued").notNull(),
    protocolVersion: integer("protocol_version").default(1).notNull(),
    rawDiscoveryResponse: text("raw_discovery_response"),
    discoveredCandidateCount: integer("discovered_candidate_count").default(0).notNull(),
    terminalCandidateCount: integer("terminal_candidate_count").default(0).notNull(),
    publishedCandidateCount: integer("published_candidate_count").default(0).notNull(),
    suppressedCandidateCount: integer("suppressed_candidate_count").default(0).notNull(),
    reviewRecommendedCandidateCount: integer("review_recommended_candidate_count").default(0).notNull(),
    verifyFirstCandidateCount: integer("verify_first_candidate_count").default(0).notNull(),
    failedCandidateCount: integer("failed_candidate_count").default(0).notNull(),
    invalidCandidateCount: integer("invalid_candidate_count").default(0).notNull(),
    stageVersion: integer("stage_version").default(1).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    nextRunAt: timestamp("next_run_at", { mode: "date" }).defaultNow().notNull(),
    lastErrorCode: text("last_error_code"),
    requeueReasonCode: text("requeue_reason_code"),
    checkpoint: jsonb("checkpoint").$type<Record<string, unknown>>(),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "date" }),
    fencingToken: text("fencing_token"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (job) => [
    uniqueIndex("knowledge_ingestion_jobs_capture_version_id_idx").on(job.captureVersionId),
    uniqueIndex("knowledge_ingestion_jobs_id_source_capture_idx").on(job.id, job.sourceId, job.captureVersionId),
    index("knowledge_ingestion_jobs_claim_queue_idx").on(job.stage, job.nextRunAt, job.createdAt),
    index("knowledge_ingestion_jobs_lease_expiry_idx").on(job.leaseExpiresAt).where(sql`${job.leaseExpiresAt} is not null`),
    index("knowledge_ingestion_jobs_source_id_idx").on(job.sourceId),
    foreignKey({
      columns: [job.captureVersionId, job.sourceId],
      foreignColumns: [sourceCaptureVersions.id, sourceCaptureVersions.sourceId],
      name: "knowledge_ingestion_jobs_capture_version_source_fk",
    }).onDelete("restrict"),
    check("knowledge_ingestion_jobs_stage_check", sql`${job.stage} in ('queued', 'triaging', 'extracting', 'judging', 'relating', 'published', 'suppressed', 'review_recommended', 'verify_first', 'failed')`),
    check("knowledge_ingestion_jobs_protocol_version_check", sql`${job.protocolVersion} in (1, 2)`),
    check("knowledge_ingestion_jobs_raw_discovery_response_check", sql`${job.rawDiscoveryResponse} is null or (octet_length(${job.rawDiscoveryResponse}) > 0 and octet_length(${job.rawDiscoveryResponse}) <= 1048576)`),
    check("knowledge_ingestion_jobs_candidate_counts_check", sql`${job.discoveredCandidateCount} >= 0 and ${job.terminalCandidateCount} >= 0 and ${job.terminalCandidateCount} <= ${job.discoveredCandidateCount} and ${job.publishedCandidateCount} >= 0 and ${job.suppressedCandidateCount} >= 0 and ${job.reviewRecommendedCandidateCount} >= 0 and ${job.verifyFirstCandidateCount} >= 0 and ${job.failedCandidateCount} >= 0 and ${job.invalidCandidateCount} >= 0 and ${job.publishedCandidateCount} + ${job.suppressedCandidateCount} + ${job.reviewRecommendedCandidateCount} + ${job.verifyFirstCandidateCount} + ${job.failedCandidateCount} = ${job.terminalCandidateCount}`),
    check("knowledge_ingestion_jobs_stage_version_check", sql`${job.stageVersion} >= 1`),
    check("knowledge_ingestion_jobs_attempt_count_check", sql`${job.attemptCount} >= 0 and ${job.attemptCount} <= ${job.maxAttempts}`),
    check("knowledge_ingestion_jobs_max_attempts_check", sql`${job.maxAttempts} between 1 and 10`),
    check("knowledge_ingestion_jobs_submitter_email_check", sql`length(btrim(${job.submittedByEmail})) between 1 and 320`),
    check("knowledge_ingestion_jobs_error_code_check", sql`${job.lastErrorCode} is null or ${job.lastErrorCode} ~ '^[a-z0-9_:-]{1,120}$'`),
    check("knowledge_ingestion_jobs_requeue_reason_code_check", sql`${job.requeueReasonCode} is null or ${job.requeueReasonCode} ~ '^[a-z0-9_:-]{1,120}$'`),
    check("knowledge_ingestion_jobs_checkpoint_shape_check", sql`${job.checkpoint} is null or (jsonb_typeof(${job.checkpoint}) = 'object' and octet_length(${job.checkpoint}::text) <= 8192)`),
    check("knowledge_ingestion_jobs_claim_shape_check", sql`(${job.claimedBy} is null and ${job.claimedAt} is null and ${job.leaseExpiresAt} is null and ${job.fencingToken} is null) or (${job.claimedBy} is not null and length(btrim(${job.claimedBy})) between 1 and 160 and ${job.claimedAt} is not null and ${job.leaseExpiresAt} > ${job.claimedAt} and ${job.fencingToken} ~ '^[a-f0-9]{64}$')`),
    check("knowledge_ingestion_jobs_terminal_claim_check", sql`${job.stage} not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed') or (${job.claimedBy} is null and ${job.claimedAt} is null and ${job.leaseExpiresAt} is null and ${job.fencingToken} is null)`),
    check("knowledge_ingestion_jobs_terminal_checkpoint_check", sql`${job.stage} not in ('published', 'suppressed', 'review_recommended', 'verify_first', 'failed') or ${job.checkpoint} is null`),
  ],
);

// Operational rows only: knowledge_cards remains the sole canonical fact aggregate.
export const knowledgeIngestionCandidates = pgTable(
  "knowledge_ingestion_candidates",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ingestionJobId: text("ingestion_job_id").notNull().references(() => knowledgeIngestionJobs.id, { onDelete: "cascade" }),
    sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "restrict" }),
    captureVersionId: text("capture_version_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    type: text("type").$type<KnowledgeCardType>().notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    locationName: text("location_name"),
    routeSegment: text("route_segment"),
    conditions: jsonb("conditions").$type<string[]>().default([]).notNull(),
    freshnessSensitive: boolean("freshness_sensitive").default(false).notNull(),
    practicalDetails: jsonb("practical_details").$type<Record<string, unknown>>().default({}).notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    spanStart: integer("span_start").notNull(),
    spanEnd: integer("span_end").notNull(),
    extractionModelId: text("extraction_model_id").references(() => aiGatewayModels.id, { onDelete: "set null" }),
    extractionPromptVersion: text("extraction_prompt_version").notNull(),
    stage: text("stage").$type<KnowledgeIngestionCandidateStage>().default("queued").notNull(),
    stageVersion: integer("stage_version").default(1).notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    nextRunAt: timestamp("next_run_at", { mode: "date" }).defaultNow().notNull(),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "date" }),
    fencingToken: text("fencing_token"),
    outcomeReasonCode: text("outcome_reason_code"),
    judgeDecision: text("judge_decision"),
    judgmentSummary: text("judgment_summary"),
    scores: jsonb("scores").$type<Record<string, number>>(),
    knowledgeCardId: text("knowledge_card_id").references(() => knowledgeCards.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (candidate) => [
    uniqueIndex("knowledge_ingestion_candidates_job_fingerprint_idx").on(candidate.ingestionJobId, candidate.fingerprint),
    index("knowledge_ingestion_candidates_claim_queue_idx").on(candidate.stage, candidate.nextRunAt, candidate.createdAt),
    index("knowledge_ingestion_candidates_parent_stage_idx").on(candidate.ingestionJobId, candidate.stage),
    index("knowledge_ingestion_candidates_capture_span_idx").on(candidate.captureVersionId, candidate.spanStart),
    foreignKey({ columns: [candidate.ingestionJobId, candidate.sourceId, candidate.captureVersionId], foreignColumns: [knowledgeIngestionJobs.id, knowledgeIngestionJobs.sourceId, knowledgeIngestionJobs.captureVersionId], name: "knowledge_ingestion_candidates_parent_capture_fk" }).onDelete("cascade"),
    check("knowledge_ingestion_candidates_stage_check", sql`${candidate.stage} in ('queued', 'judging', 'relating', 'published', 'suppressed', 'review_recommended', 'verify_first', 'failed')`),
    check("knowledge_ingestion_candidates_span_check", sql`${candidate.spanStart} >= 0 and ${candidate.spanEnd} > ${candidate.spanStart}`),
    check("knowledge_ingestion_candidates_safe_text_check", sql`length(btrim(${candidate.title})) between 1 and 160 and length(btrim(${candidate.summary})) between 1 and 1200 and length(btrim(${candidate.extractionPromptVersion})) between 1 and 160`),
    check("knowledge_ingestion_candidates_conditions_check", sql`jsonb_typeof(${candidate.conditions}) = 'array'`),
    check("knowledge_ingestion_candidates_practical_details_check", sql`jsonb_typeof(${candidate.practicalDetails}) = 'object'`),
    check("knowledge_ingestion_candidates_tags_check", sql`jsonb_typeof(${candidate.tags}) = 'array'`),
    check("knowledge_ingestion_candidates_attempt_check", sql`${candidate.attemptCount} >= 0 and ${candidate.attemptCount} <= ${candidate.maxAttempts} and ${candidate.maxAttempts} between 1 and 10`),
    check("knowledge_ingestion_candidates_claim_shape_check", sql`(${candidate.claimedBy} is null and ${candidate.claimedAt} is null and ${candidate.leaseExpiresAt} is null and ${candidate.fencingToken} is null) or (${candidate.claimedBy} is not null and ${candidate.claimedAt} is not null and ${candidate.leaseExpiresAt} > ${candidate.claimedAt} and ${candidate.fencingToken} ~ '^[a-f0-9]{64}$')`),
    check("knowledge_ingestion_candidates_outcome_reason_code_check", sql`${candidate.outcomeReasonCode} is null or ${candidate.outcomeReasonCode} in ('invalid_discovery_candidate', 'candidate_invalid_structure', 'candidate_missing_required_fields', 'candidate_sensitive_content', 'candidate_unsafe_raw_overlap', 'candidate_evidence_mismatch', 'candidate_insufficient_travel_context', 'judge_evidence_not_grounded', 'judge_suppressed', 'judge_below_quality_threshold', 'stale_or_deleted_capture', 'judge_model_unavailable', 'judge_model_not_independent', 'judge_provider_failed', 'relation_provider_failed', 'relation_ambiguous', 'relation_invalid', 'stale_relation_target', 'attach_condition_mismatch', 'conflict_condition_mismatch', 'retry_exhausted')`),
    check("knowledge_ingestion_candidates_judge_decision_check", sql`${candidate.judgeDecision} is null or ${candidate.judgeDecision} in ('publish', 'review_recommended', 'verify_first', 'suppress')`),
  ],
);

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull(),
    referrerUserId: text("referrer_user_id").references(() => users.id, { onDelete: "set null" }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (referralCode) => [
    uniqueIndex("referral_codes_code_idx").on(referralCode.code),
    index("referral_codes_active_idx").on(referralCode.active),
    index("referral_codes_referrer_user_id_idx").on(referralCode.referrerUserId),
    check("referral_codes_code_format_check", sql`${referralCode.code} ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'`),
  ],
);

export const referralAttributions = pgTable(
  "referral_attributions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referralCodeId: text("referral_code_id")
      .notNull()
      .references(() => referralCodes.id, { onDelete: "restrict" }),
    referrerUserId: text("referrer_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (referralAttribution) => [
    uniqueIndex("referral_attributions_user_id_idx").on(referralAttribution.userId),
    index("referral_attributions_referral_code_id_idx").on(referralAttribution.referralCodeId),
    index("referral_attributions_referrer_user_id_idx").on(referralAttribution.referrerUserId),
    index("referral_attributions_created_at_idx").on(referralAttribution.createdAt),
    check(
      "referral_attributions_no_self_referral_check",
      sql`${referralAttribution.referrerUserId} is null or ${referralAttribution.referrerUserId} <> ${referralAttribution.userId}`,
    ),
  ],
);

export const tripProjects = pgTable(
  "trip_projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    origin: text("origin"),
    destination: text("destination"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    travelers: text("travelers"),
    notes: text("notes"),
    // The reverse composite FK is baseline-owned to avoid a Drizzle declaration cycle.
    primaryConversationId: text("primary_conversation_id"),
    aggregateVersion: integer("aggregate_version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (tripProject) => [
    uniqueIndex("trip_projects_id_user_id_idx").on(tripProject.id, tripProject.userId),
    index("trip_projects_user_id_updated_at_idx").on(tripProject.userId, tripProject.updatedAt),
    check("trip_projects_title_not_empty_check", sql`length(btrim(${tripProject.title})) > 0`),
    check("trip_projects_aggregate_version_check", sql`${tripProject.aggregateVersion} >= 1`),
  ],
);

export const tripProjectConstraints = pgTable("trip_project_constraints", {
  tripProjectId: text("trip_project_id").primaryKey(), userId: text("user_id").notNull(), version: integer("version").default(1).notNull(),
  adultCount: integer("adult_count"), childCount: integer("child_count"), children: jsonb("children").$type<unknown[]>(), vehicleType: text("vehicle_type"), evChargingNeed: text("ev_charging_need"), drivingToleranceHours: integer("driving_tolerance_hours"), budgetCurrency: text("budget_currency"), budgetMinVnd: integer("budget_min_vnd"), budgetMaxVnd: integer("budget_max_vnd"), preferenceTags: jsonb("preference_tags").$type<string[]>(), avoidItems: jsonb("avoid_items").$type<unknown[]>(), createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (row) => [foreignKey({ columns: [row.tripProjectId, row.userId], foreignColumns: [tripProjects.id, tripProjects.userId], name: "trip_project_constraints_owner_fk" }).onDelete("cascade"), index("trip_project_constraints_owner_project_idx").on(row.userId, row.tripProjectId), check("trip_project_constraints_version_check", sql`${row.version} >= 1`), check("trip_project_constraints_counts_check", sql`(${row.adultCount} is not null or ${row.childCount} is not null) and coalesce(${row.adultCount}, 0) + coalesce(${row.childCount}, 0) between 1 and 20 and (${row.adultCount} is null or ${row.adultCount} between 0 and 20) and (${row.childCount} is null or ${row.childCount} between 0 and 20)`), check("trip_project_constraints_children_array_check", sql`${row.children} is null or (jsonb_typeof(${row.children}) = 'array' and jsonb_array_length(${row.children}) <= 10)`), check("trip_project_constraints_vehicle_check", sql`${row.vehicleType} is null or ${row.vehicleType} in ('car', 'motorcycle', 'ev')`), check("trip_project_constraints_ev_check", sql`${row.evChargingNeed} is null or (${row.vehicleType} = 'ev' and ${row.evChargingNeed} in ('none', 'preferred', 'required'))`), check("trip_project_constraints_driving_check", sql`${row.drivingToleranceHours} is null or ${row.drivingToleranceHours} between 1 and 12`), check("trip_project_constraints_budget_check", sql`(${row.budgetCurrency} is null and ${row.budgetMinVnd} is null and ${row.budgetMaxVnd} is null) or (${row.budgetCurrency} = 'VND' and ${row.budgetMinVnd} between 0 and 1000000000 and ${row.budgetMaxVnd} between 0 and 1000000000 and ${row.budgetMinVnd} <= ${row.budgetMaxVnd})`), check("trip_project_constraints_preferences_array_check", sql`${row.preferenceTags} is null or (jsonb_typeof(${row.preferenceTags}) = 'array' and jsonb_array_length(${row.preferenceTags}) <= 20)`), check("trip_project_constraints_avoid_items_array_check", sql`${row.avoidItems} is null or (jsonb_typeof(${row.avoidItems}) = 'array' and jsonb_array_length(${row.avoidItems}) <= 20)`)]);

// The self-reference constraints below are made DEFERRABLE INITIALLY DEFERRED by
// the baseline migration; Drizzle's PostgreSQL foreign-key API does not expose deferrability.
export const tripPlanItems = pgTable("trip_plan_items", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()), tripProjectId: text("trip_project_id").notNull(), userId: text("user_id").notNull(), kind: text("kind").$type<TripPlanItemKind>().notNull(), anchorRole: text("anchor_role").$type<TripPlanAnchorRole>(), type: text("type").$type<TripPlanItemType>(), state: text("state").$type<TripPlanItemState>().notNull(), label: text("label").notNull(), notes: text("notes"), plannedAt: timestamp("planned_at", { mode: "date" }), ordinal: integer("ordinal").notNull(), version: integer("version").default(1).notNull(), parentItemId: text("parent_item_id").references((): AnyPgColumn => tripPlanItems.id, { onDelete: "restrict" }), backupTargetItemId: text("backup_target_item_id").references((): AnyPgColumn => tripPlanItems.id, { onDelete: "restrict" }), transportOriginLabel: text("transport_origin_label"), transportDestinationLabel: text("transport_destination_label"), accommodationPlaceAreaLabel: text("accommodation_place_area_label"), createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
}, (row) => [foreignKey({ columns: [row.tripProjectId, row.userId], foreignColumns: [tripProjects.id, tripProjects.userId], name: "trip_plan_items_owner_fk" }).onDelete("cascade"), index("trip_plan_items_owner_project_order_idx").on(row.userId, row.tripProjectId, row.parentItemId, row.ordinal), uniqueIndex("trip_plan_items_root_ordinal_idx").on(row.tripProjectId, row.ordinal).where(sql`${row.parentItemId} is null`), uniqueIndex("trip_plan_items_child_ordinal_idx").on(row.tripProjectId, row.parentItemId, row.ordinal).where(sql`${row.parentItemId} is not null`), check("trip_plan_items_shape_check", sql`(${row.kind} = 'anchor' and ${row.anchorRole} in ('origin','destination','region','required_stop','accommodation') and ${row.type} is null) or (${row.kind} in ('leg','activity') and ${row.anchorRole} is null and ${row.type} in ('transport','visit','food','rest','accommodation'))`), check("trip_plan_items_state_check", sql`${row.state} in ('idea','planned','confirmed','backup')`), check("trip_plan_items_version_check", sql`${row.version} >= 1`), check("trip_plan_items_ordinal_check", sql`${row.ordinal} >= 0`), check("trip_plan_items_backup_check", sql`(${row.state} = 'backup' and ${row.backupTargetItemId} is not null) or (${row.state} <> 'backup' and ${row.backupTargetItemId} is null)`), check("trip_plan_items_label_check", sql`length(btrim(${row.label})) between 1 and 160 and position(chr(10) in ${row.label}) = 0 and position(chr(13) in ${row.label}) = 0`), check("trip_plan_items_notes_check", sql`${row.notes} is null or (length(btrim(${row.notes})) between 1 and 1000 and position(chr(10) in ${row.notes}) = 0 and position(chr(13) in ${row.notes}) = 0)`), check("trip_plan_items_location_check", sql`(${row.type} = 'transport' or (${row.transportOriginLabel} is null and ${row.transportDestinationLabel} is null)) and (${row.type} = 'accommodation' or ${row.accommodationPlaceAreaLabel} is null) and (${row.transportOriginLabel} is null or (length(btrim(${row.transportOriginLabel})) between 1 and 160 and position(chr(10) in ${row.transportOriginLabel}) = 0 and position(chr(13) in ${row.transportOriginLabel}) = 0)) and (${row.transportDestinationLabel} is null or (length(btrim(${row.transportDestinationLabel})) between 1 and 160 and position(chr(10) in ${row.transportDestinationLabel}) = 0 and position(chr(13) in ${row.transportDestinationLabel}) = 0)) and (${row.accommodationPlaceAreaLabel} is null or (length(btrim(${row.accommodationPlaceAreaLabel})) between 1 and 160 and position(chr(10) in ${row.accommodationPlaceAreaLabel}) = 0 and position(chr(13) in ${row.accommodationPlaceAreaLabel}) = 0))`)]);

// Story 7.4: Chat/Trips-owned Trip Change Proposals. Persisted AI-drafted plan
// adjustments that the owner reviews before any structured plan state changes.
// The AI Orchestration path writes nothing here directly; persistence goes
// through persistAiTripChangeProposalDraft.
export const tripChangeProposals = pgTable(
  "trip_change_proposals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tripProjectId: text("trip_project_id").notNull(),
    userId: text("user_id").notNull(),
    creatorClass: text("creator_class").$type<TripChangeProposalCreatorClass>().notNull(),
    status: text("status").$type<TripChangeProposalStatus>().default("pending").notNull(),
    rationale: text("rationale").notNull(),
    operations: jsonb("operations").$type<unknown>().notNull(),
    expectedAggregateVersion: integer("expected_aggregate_version").notNull(),
    expectedItemVersions: jsonb("expected_item_versions").$type<Record<string, number>>(),
    orderingPreconditions: jsonb("ordering_preconditions").$type<unknown>(),
    alternatives: jsonb("alternatives").$type<unknown>(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    terminalTimestamp: timestamp("terminal_timestamp", { mode: "date" }),
    sourceAssistantMessageId: text("source_assistant_message_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (row) => [
    foreignKey({
      columns: [row.tripProjectId, row.userId],
      foreignColumns: [tripProjects.id, tripProjects.userId],
      name: "trip_change_proposals_owner_fk",
    }).onDelete("cascade"),
    index("trip_change_proposals_owner_status_created_idx").on(row.userId, row.tripProjectId, row.status, row.createdAt),
    check("trip_change_proposals_creator_class_check", sql`${row.creatorClass} in ('ai_orchestration', 'owner_command')`),
    check("trip_change_proposals_status_check", sql`${row.status} in ('pending', 'applied', 'dismissed', 'expired')`),
    check("trip_change_proposals_expected_aggregate_version_check", sql`${row.expectedAggregateVersion} >= 1`),
    check("trip_change_proposals_rationale_check", sql`length(btrim(${row.rationale})) between 1 and 500 and position(chr(10) in ${row.rationale}) = 0 and position(chr(13) in ${row.rationale}) = 0`),
    check("trip_change_proposals_operations_array_check", sql`jsonb_typeof(${row.operations}) = 'array' and jsonb_array_length(${row.operations}) between 1 and 20`),
    check("trip_change_proposals_expected_item_versions_check", sql`${row.expectedItemVersions} is null or jsonb_typeof(${row.expectedItemVersions}) = 'object'`),
    check("trip_change_proposals_alternatives_check", sql`${row.alternatives} is null or (jsonb_typeof(${row.alternatives}) = 'array' and jsonb_array_length(${row.alternatives}) <= 5)`),
    check(
      "trip_change_proposals_status_terminal_shape_check",
      sql`(${row.status} = 'pending' and ${row.terminalTimestamp} is null) or (${row.status} in ('applied', 'dismissed', 'expired') and ${row.terminalTimestamp} is not null)`,
    ),
  ],
);

// Story 7.4 reserves the schema for Story 7.5's terminal-action history. No rows
// are written in 7.4; defining the table now means 7.5 needs no second migration.
export const tripPlanChangeHistory = pgTable(
  "trip_plan_change_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tripProjectId: text("trip_project_id").notNull(),
    userId: text("user_id").notNull(),
    proposalId: text("proposal_id"),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    actorClass: text("actor_class").$type<TripPlanChangeHistoryActorClass>().default("user").notNull(),
    actorSystem: text("actor_system"),
    operationClass: text("operation_class").$type<TripPlanChangeHistoryOperationClass>().notNull(),
    affectedItemReferences: jsonb("affected_item_references").$type<unknown>().notNull(),
    safeBeforeAfterSummary: jsonb("safe_before_after_summary").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (row) => [
    foreignKey({
      columns: [row.tripProjectId, row.userId],
      foreignColumns: [tripProjects.id, tripProjects.userId],
      name: "trip_plan_change_history_owner_fk",
    }).onDelete("cascade"),
    index("trip_plan_change_history_owner_created_idx").on(row.userId, row.tripProjectId, row.createdAt),
    check("trip_plan_change_history_actor_class_check", sql`${row.actorClass} in ('user', 'system')`),
    check(
      "trip_plan_change_history_actor_shape_check",
      sql`(${row.actorClass} = 'user' and ${row.actorUserId} is not null and ${row.actorSystem} is null) or (${row.actorClass} = 'system' and ${row.actorUserId} is null and ${row.actorSystem} is not null and length(btrim(${row.actorSystem})) > 0)`,
    ),
    check("trip_plan_change_history_operation_class_check", sql`${row.operationClass} in ('apply', 'dismiss', 'expire')`),
    check("trip_plan_change_history_affected_references_check", sql`jsonb_typeof(${row.affectedItemReferences}) = 'array'`),
    check("trip_plan_change_history_safe_summary_check", sql`jsonb_typeof(${row.safeBeforeAfterSummary}) = 'object' and octet_length(${row.safeBeforeAfterSummary}::text) <= 8192`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tripProjectId: text("trip_project_id"),
    lifecycleVersion: integer("lifecycle_version").default(1).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (conversation) => [
    // The migration scopes SET NULL to trip_project_id so the non-null owner remains intact.
    foreignKey({
      columns: [conversation.tripProjectId, conversation.userId],
      foreignColumns: [tripProjects.id, tripProjects.userId],
      name: "conversations_trip_project_owner_fk",
    }).onDelete("set null"),
    uniqueIndex("conversations_id_user_id_idx").on(conversation.id, conversation.userId),
    uniqueIndex("conversations_id_trip_project_user_id_idx").on(conversation.id, conversation.tripProjectId, conversation.userId),
    index("conversations_trip_project_id_idx").on(conversation.tripProjectId),
    index("conversations_user_id_trip_project_updated_at_idx").on(conversation.userId, conversation.tripProjectId, conversation.updatedAt),
    index("conversations_user_id_updated_at_idx").on(conversation.userId, conversation.updatedAt),
    index("conversations_user_id_created_at_idx").on(conversation.userId, conversation.createdAt),
    check("conversations_lifecycle_version_check", sql`${conversation.lifecycleVersion} >= 1`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MessageRole>().notNull(),
    content: text("content").notNull(),
    answerAnnotations: jsonb("answer_annotations").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (message) => [
    foreignKey({
      columns: [message.conversationId, message.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "messages_conversation_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("messages_id_user_id_idx").on(message.id, message.userId),
    uniqueIndex("messages_id_conversation_id_user_id_idx").on(message.id, message.conversationId, message.userId),
    uniqueIndex("messages_id_conversation_id_user_id_role_unique").on(message.id, message.conversationId, message.userId, message.role),
    index("messages_conversation_id_created_at_idx").on(message.conversationId, message.createdAt),
    index("messages_user_id_created_at_idx").on(message.userId, message.createdAt),
    check("messages_role_check", sql`${message.role} in ('user', 'assistant')`),
    check("messages_content_not_empty_check", sql`length(btrim(${message.content})) > 0`),
    check("messages_user_content_length_check", sql`${message.role} <> 'user' or char_length(${message.content}) <= 2000`),
    check("messages_answer_annotations_array_check", sql`jsonb_typeof(${message.answerAnnotations}) = 'array'`),
  ],
);

export const messageImageAttachments = pgTable(
  "message_image_attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalFileName: text("original_file_name"),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (attachment) => [
    foreignKey({
      columns: [attachment.conversationId, attachment.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "message_image_attachments_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [attachment.messageId, attachment.userId],
      foreignColumns: [messages.id, messages.userId],
      name: "message_image_attachments_message_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [attachment.messageId, attachment.conversationId, attachment.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "message_image_attachments_message_conversation_owner_fk",
    }).onDelete("cascade"),
    index("message_image_attachments_conversation_id_idx").on(attachment.conversationId),
    index("message_image_attachments_message_id_idx").on(attachment.messageId),
    index("message_image_attachments_user_id_idx").on(attachment.userId),
    check("message_image_attachments_mime_type_check", sql`${attachment.mimeType} in ('image/jpeg', 'image/png', 'image/webp')`),
    check("message_image_attachments_byte_size_check", sql`${attachment.byteSize} > 0 and ${attachment.byteSize} <= 5242880`),
  ],
);

export const aiAskCommands = pgTable(
  "ai_ask_commands",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scopeKind: text("scope_kind").notNull(),
    scopeId: text("scope_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    identityVersion: integer("identity_version").default(1).notNull(),
    requestDigest: text("request_digest").notNull(),
    normalizedQuestion: text("normalized_question").notNull(),
    attachmentMetadata: jsonb("attachment_metadata").$type<{ fileName: string | null; mimeType: string; byteSize: number; contentSha256: string } | null>(),
    selectedScopeDigest: text("selected_scope_digest").notNull(),
    status: text("status").$type<AiAskCommandStatus>().default("pending").notNull(),
    conversationId: text("conversation_id"),
    tripProjectId: text("trip_project_id"),
    conversationLifecycleVersion: integer("conversation_lifecycle_version"),
    tripProjectAggregateVersion: integer("trip_project_aggregate_version"),
    userMessageId: text("user_message_id"),
    assistantMessageId: text("assistant_message_id"),
    tripAnswerContextSnapshotId: text("trip_answer_context_snapshot_id"),
    terminalResult: jsonb("terminal_result").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    terminalAt: timestamp("terminal_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  // Retained-command scrub-on-delete is a PostgreSQL trigger declared in
  // migrations 0010 and 0013; Drizzle has no trigger declaration API.
  (command) => [
    foreignKey({
      columns: [command.conversationId, command.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "ai_ask_commands_conversation_owner_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [command.tripProjectId, command.userId],
      foreignColumns: [tripProjects.id, tripProjects.userId],
      name: "ai_ask_commands_trip_project_owner_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [command.userMessageId, command.conversationId, command.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "ai_ask_commands_user_message_conversation_owner_fk",
    }).onDelete("set null"),
    foreignKey({
      columns: [command.assistantMessageId, command.conversationId, command.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "ai_ask_commands_assistant_message_conversation_owner_fk",
    }).onDelete("set null"),
    uniqueIndex("ai_ask_commands_owner_scope_key_idx").on(command.userId, command.scopeKind, command.scopeId, command.idempotencyKey),
    uniqueIndex("ai_ask_commands_new_conversation_key_idx").on(command.userId, command.idempotencyKey).where(sql`${command.scopeKind} = 'new_conversation'`),
    index("ai_ask_commands_owner_conversation_idx").on(command.userId, command.conversationId),
    index("ai_ask_commands_owner_fence_finalization_idx").on(command.userId, command.tripProjectId, command.conversationId, command.status),
    index("ai_ask_commands_expiry_idx").on(command.expiresAt),
    check("ai_ask_commands_scope_kind_check", sql`${command.scopeKind} in ('conversation', 'trip_project', 'new_conversation')`),
    check("ai_ask_commands_key_check", sql`${command.idempotencyKey} ~ '^[A-Za-z0-9_-]{16,128}$'`),
    check("ai_ask_commands_digest_check", sql`${command.requestDigest} ~ '^[a-f0-9]{64}$' and ${command.selectedScopeDigest} ~ '^[a-f0-9]{64}$'`),
    check("ai_ask_commands_status_check", sql`${command.status} in ('pending', 'completed', 'failed', 'aborted', 'discarded')`),
    check("ai_ask_commands_question_check", sql`char_length(${command.normalizedQuestion}) between 1 and 2000`),
    check("ai_ask_commands_terminal_shape_check", sql`(${command.status} = 'pending' and ${command.terminalAt} is null and ${command.terminalResult} is null) or (${command.status} in ('completed', 'failed', 'aborted') and ${command.terminalResult} is not null and ${command.terminalAt} is not null) or (${command.status} = 'discarded' and ${command.terminalResult} is not null and ${command.terminalAt} is not null and ${command.assistantMessageId} is null)`),
    check("ai_ask_commands_fence_shape_check", sql`${command.conversationId} is null or ${command.conversationLifecycleVersion} >= 1`),
    check("ai_ask_commands_project_fence_shape_check", sql`${command.tripProjectId} is null or ${command.tripProjectAggregateVersion} >= 1`),
    check("ai_ask_commands_snapshot_terminal_check", sql`${command.tripAnswerContextSnapshotId} is null or (${command.status} = 'completed' and ${command.assistantMessageId} is not null)`),
  ],
);

// Immutable answer-generation evidence. It cascades with the answer/conversation so
// retained command metadata cannot reconstitute deleted project or chat content.
export const tripAnswerContextSnapshots = pgTable(
  "trip_answer_context_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    assistantMessageId: text("assistant_message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    tripProjectId: text("trip_project_id"),
    contextVersion: integer("context_version").notNull(),
    aggregateVersion: integer("aggregate_version"),
    includedReferences: jsonb("included_references").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    excludedReferences: jsonb("excluded_references").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    conflicts: jsonb("conflicts").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    serialization: text("serialization").notNull(),
    promptDigest: text("prompt_digest").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (snapshot) => [
    uniqueIndex("trip_answer_context_snapshots_assistant_message_idx").on(snapshot.assistantMessageId),
    uniqueIndex("trip_answer_context_snapshots_owner_message_idx").on(snapshot.id, snapshot.userId, snapshot.conversationId, snapshot.assistantMessageId),
    foreignKey({
      columns: [snapshot.conversationId, snapshot.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "trip_answer_context_snapshots_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [snapshot.tripProjectId, snapshot.userId],
      foreignColumns: [tripProjects.id, tripProjects.userId],
      name: "trip_answer_context_snapshots_project_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [snapshot.assistantMessageId, snapshot.conversationId, snapshot.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "trip_answer_context_snapshots_assistant_message_owner_fk",
    }).onDelete("cascade"),
    index("trip_answer_context_snapshots_conversation_created_idx").on(snapshot.conversationId, snapshot.createdAt),
    index("trip_answer_context_snapshots_project_created_idx").on(snapshot.tripProjectId, snapshot.createdAt),
    check("trip_answer_context_snapshots_version_check", sql`${snapshot.contextVersion} = 1 and (${snapshot.aggregateVersion} is null or ${snapshot.aggregateVersion} >= 1)`),
    check("trip_answer_context_snapshots_refs_check", sql`jsonb_typeof(${snapshot.includedReferences}) = 'array' and jsonb_typeof(${snapshot.excludedReferences}) = 'array' and jsonb_typeof(${snapshot.conflicts}) = 'array'`),
    check("trip_answer_context_snapshots_bounds_check", sql`octet_length(${snapshot.serialization}) <= 32768 and ${snapshot.promptDigest} ~ '^[a-f0-9]{64}$'`),
  ],
);

// AI Orchestration owns this operational handoff. Payloads intentionally mirror
// only IDs and fences; authoritative state remains in the feature aggregates.
export const domainOutbox = pgTable(
  "domain_outbox",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    originatingCommandId: text("originating_command_id").notNull().references(() => aiAskCommands.id, { onDelete: "cascade" }),
    eventType: text("event_type").$type<AiAskDomainOutboxEventType>().notNull(),
    eventVersion: integer("event_version").default(1).notNull(),
    aggregateType: text("aggregate_type").default("ai_ask_command").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    tripProjectId: text("trip_project_id").references(() => tripProjects.id, { onDelete: "cascade" }),
    userMessageId: text("user_message_id").references(() => messages.id, { onDelete: "cascade" }),
    assistantMessageId: text("assistant_message_id").references(() => messages.id, { onDelete: "cascade" }),
    conversationLifecycleVersion: integer("conversation_lifecycle_version").notNull(),
    tripProjectAggregateVersion: integer("trip_project_aggregate_version"),
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<DomainOutboxStatus>().default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    availableAt: timestamp("available_at", { mode: "date" }).defaultNow().notNull(),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "date" }),
    fencingToken: text("fencing_token"),
    lastErrorCode: text("last_error_code"),
    failureCode: text("failure_code"),
    completedAt: timestamp("completed_at", { mode: "date" }),
    failedAt: timestamp("failed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (event) => [
    uniqueIndex("domain_outbox_dedupe_key_idx").on(event.dedupeKey),
    index("domain_outbox_due_queue_idx").on(event.status, event.availableAt, event.createdAt, event.id),
    index("domain_outbox_expired_lease_idx").on(event.status, event.leaseExpiresAt).where(sql`${event.leaseExpiresAt} is not null`),
    check("domain_outbox_event_type_check", sql`${event.eventType} in ('ai_ask.context_extraction.v1', 'ai_ask.answer_annotation.v1', 'ai_ask.trip_proposal_draft.v1')`),
    check("domain_outbox_event_version_check", sql`${event.eventVersion} = 1 and ${event.aggregateType} = 'ai_ask_command' and ${event.aggregateId} = ${event.originatingCommandId}`),
    check("domain_outbox_attempts_check", sql`${event.attemptCount} between 0 and ${event.maxAttempts} and ${event.maxAttempts} between 1 and 10`),
    check("domain_outbox_payload_check", sql`jsonb_typeof(${event.payload}) = 'object' and octet_length(${event.payload}::text) <= 4096`),
    check("domain_outbox_safe_code_check", sql`(${event.lastErrorCode} is null or ${event.lastErrorCode} ~ '^[a-z0-9_:-]{1,120}$') and (${event.failureCode} is null or ${event.failureCode} ~ '^[a-z0-9_:-]{1,120}$')`),
    check("domain_outbox_status_check", sql`${event.status} in ('pending', 'processing', 'completed', 'failed')`),
    check("domain_outbox_processing_claim_check", sql`(${event.status} = 'processing') = (${event.claimedBy} is not null and ${event.claimedAt} is not null and ${event.leaseExpiresAt} > ${event.claimedAt} and ${event.fencingToken} ~ '^[a-f0-9]{64}$')`),
    check("domain_outbox_non_processing_claim_check", sql`${event.status} = 'processing' or (${event.claimedBy} is null and ${event.claimedAt} is null and ${event.leaseExpiresAt} is null and ${event.fencingToken} is null)`),
    check("domain_outbox_terminal_timestamp_check", sql`(${event.status} = 'completed' and ${event.completedAt} is not null) or (${event.status} = 'failed' and ${event.failedAt} is not null) or (${event.status} in ('pending', 'processing') and ${event.completedAt} is null and ${event.failedAt} is null)`),
    check("domain_outbox_failed_failure_code_check", sql`${event.status} <> 'failed' or ${event.failureCode} is not null`),
  ],
);

// The unique event reference is the durable idempotency guard for a completed
// consumer transaction that is redelivered before its acknowledgement is seen.
export const domainOutboxEffects = pgTable(
  "domain_outbox_effects",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    outboxEventId: text("outbox_event_id").notNull().references(() => domainOutbox.id, { onDelete: "cascade" }),
    effectType: text("effect_type").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (effect) => [
    uniqueIndex("domain_outbox_effects_event_idx").on(effect.outboxEventId),
    check("domain_outbox_effects_type_check", sql`${effect.effectType} in ('context_extraction', 'answer_annotation', 'trip_proposal_draft', 'fenced_out')`),
  ],
);

export const chatContext = pgTable(
  "chat_context",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    tripProjectId: text("trip_project_id"),
    sourceMessageId: text("source_message_id").notNull(),
    field: text("field").$type<ChatContextField>().notNull(),
    scope: text("scope").$type<ChatContextScope>().notNull(),
    value: text("value").notNull(),
    confidence: integer("confidence"),
    status: text("status").$type<ChatContextStatus>().default("active").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (context) => [
    foreignKey({
      columns: [context.conversationId, context.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "chat_context_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [context.sourceMessageId, context.conversationId, context.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "chat_context_source_message_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [context.tripProjectId, context.userId],
      foreignColumns: [tripProjects.id, tripProjects.userId],
      name: "chat_context_trip_project_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [context.conversationId, context.tripProjectId, context.userId],
      foreignColumns: [conversations.id, conversations.tripProjectId, conversations.userId],
      name: "chat_context_conversation_trip_project_owner_fk",
    }).onDelete("cascade"),
    index("chat_context_user_conversation_idx").on(context.userId, context.conversationId, context.createdAt),
    index("chat_context_user_trip_project_idx").on(context.userId, context.tripProjectId, context.createdAt),
    index("chat_context_source_message_id_idx").on(context.sourceMessageId),
    index("chat_context_field_idx").on(context.field),
    check(
      "chat_context_field_check",
      sql`${context.field} in ('origin', 'destination', 'start_date', 'end_date', 'duration', 'adults', 'children', 'children_ages', 'budget', 'hotel_style', 'driving_tolerance', 'vehicle_needs', 'food_preferences', 'activity_preferences', 'itinerary_constraints', 'avoid_places', 'prior_trips', 'notes')`,
    ),
    check("chat_context_scope_check", sql`${context.scope} in ('conversation', 'trip_project')`),
    check("chat_context_status_check", sql`${context.status} in ('active', 'deleted')`),
    check("chat_context_value_not_empty_check", sql`length(btrim(${context.value})) > 0`),
    check("chat_context_confidence_check", sql`${context.confidence} is null or (${context.confidence} >= 0 and ${context.confidence} <= 100)`),
    check(
      "chat_context_scope_trip_project_check",
      sql`(${context.scope} = 'conversation' and ${context.tripProjectId} is null) or (${context.scope} = 'trip_project' and ${context.tripProjectId} is not null)`,
    ),
  ],
);

export const aiGatewayModels = pgTable(
  "ai_gateway_models",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gatewayModelName: text("gateway_model_name").notNull(),
    displayLabel: text("display_label").notNull(),
    purpose: text("purpose").$type<AiGatewayModelPurpose>().notNull(),
    active: boolean("active").default(true).notNull(),
    defaultForPurpose: boolean("default_for_purpose").default(false).notNull(),
    supportsTextInput: boolean("supports_text_input").default(false).notNull(),
    supportsImageInput: boolean("supports_image_input").default(false).notNull(),
    supportsImageOutput: boolean("supports_image_output").default(false).notNull(),
    supportsEmbeddings: boolean("supports_embeddings").default(false).notNull(),
    supportsExtraction: boolean("supports_extraction").default(false).notNull(),
    supportsEvaluation: boolean("supports_evaluation").default(false).notNull(),
    supportsStreaming: boolean("supports_streaming").default(false).notNull(),
    supportsCachePricing: boolean("supports_cache_pricing").default(false).notNull(),
    pricingCurrency: text("pricing_currency"),
    inputTokenPriceMicros: integer("input_token_price_micros"),
    outputTokenPriceMicros: integer("output_token_price_micros"),
    cacheReadTokenPriceMicros: integer("cache_read_token_price_micros"),
    cacheWriteTokenPriceMicros: integer("cache_write_token_price_micros"),
    pricingUnitTokens: integer("pricing_unit_tokens").default(1_000_000).notNull(),
    pricingVersion: text("pricing_version"),
    pricingEffectiveAt: timestamp("pricing_effective_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (model) => [
    uniqueIndex("ai_gateway_models_gateway_model_purpose_idx").on(model.gatewayModelName, model.purpose),
    index("ai_gateway_models_purpose_active_idx").on(model.purpose, model.active),
    uniqueIndex("ai_gateway_models_one_default_per_purpose_idx").on(model.purpose).where(sql`${model.defaultForPurpose} = true`),
    index("ai_gateway_models_default_idx").on(model.purpose, model.defaultForPurpose),
    check(
      "ai_gateway_models_purpose_check",
      sql`${model.purpose} in ('ai_ask_initial_answer', 'extraction', 'embeddings', 'evaluation')`,
    ),
    check("ai_gateway_models_display_label_not_empty_check", sql`length(btrim(${model.displayLabel})) > 0`),
    check("ai_gateway_models_gateway_model_name_not_empty_check", sql`length(btrim(${model.gatewayModelName})) > 0`),
    check("ai_gateway_models_pricing_unit_positive_check", sql`${model.pricingUnitTokens} > 0`),
    check("ai_gateway_models_default_active_check", sql`${model.defaultForPurpose} = false or ${model.active} = true`),
    check(
      "ai_gateway_models_priced_currency_check",
      sql`(${model.inputTokenPriceMicros} is null and ${model.outputTokenPriceMicros} is null and ${model.cacheReadTokenPriceMicros} is null and ${model.cacheWriteTokenPriceMicros} is null) or ${model.pricingCurrency} is not null`,
    ),
    check("ai_gateway_models_input_price_non_negative_check", sql`${model.inputTokenPriceMicros} is null or ${model.inputTokenPriceMicros} >= 0`),
    check("ai_gateway_models_output_price_non_negative_check", sql`${model.outputTokenPriceMicros} is null or ${model.outputTokenPriceMicros} >= 0`),
    check(
      "ai_gateway_models_cache_read_price_non_negative_check",
      sql`${model.cacheReadTokenPriceMicros} is null or ${model.cacheReadTokenPriceMicros} >= 0`,
    ),
    check(
      "ai_gateway_models_cache_write_price_non_negative_check",
      sql`${model.cacheWriteTokenPriceMicros} is null or ${model.cacheWriteTokenPriceMicros} >= 0`,
    ),
  ],
);

export const knowledgeCards = pgTable(
  "knowledge_cards",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    status: text("status").$type<KnowledgeCardStatus>().default("draft").notNull(),
    publicationState: text("publication_state").$type<KnowledgePublicationState>().default("suppressed").notNull(),
    knowledgeState: text("knowledge_state").$type<KnowledgeState>().default("uncertain").notNull(),
    reviewState: text("review_state").$type<KnowledgeReviewState>().default("ai_recommended").notNull(),
    verificationState: text("verification_state").$type<KnowledgeVerificationState>().default("not_required").notNull(),
    contentVersion: integer("content_version").default(1).notNull(),
    evidenceSetRevision: integer("evidence_set_revision").default(1).notNull(),
    conditions: jsonb("conditions").$type<string[]>().default([]).notNull(),
    currentJudgeSummary: text("current_judge_summary").default("Current judgment has not been completed.").notNull(),
    type: text("type").$type<KnowledgeCardType>().notNull(),
    title: text("title").notNull(),
    locationName: text("location_name"),
    routeSegment: text("route_segment"),
    summary: text("summary").notNull(),
    practicalDetails: jsonb("practical_details").$type<Record<string, unknown>>().default({}).notNull(),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    confidence: text("confidence").$type<KnowledgeConfidence>().default("unverified").notNull(),
    freshnessSensitive: boolean("freshness_sensitive").default(false).notNull(),
    needsReview: boolean("needs_review").default(true).notNull(),
    aiPromptVersion: text("ai_prompt_version").notNull(),
    aiGatewayModelId: text("ai_gateway_model_id").references(() => aiGatewayModels.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    executorSystem: text("executor_system"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (card) => [
    index("knowledge_cards_status_created_at_idx").on(card.status, card.createdAt),
    index("knowledge_cards_publication_state_idx").on(card.publicationState, card.updatedAt),
    index("knowledge_cards_type_status_idx").on(card.type, card.status),
    index("knowledge_cards_confidence_idx").on(card.confidence),
    index("knowledge_cards_created_by_user_id_idx").on(card.createdByUserId),
    index("knowledge_cards_executor_system_updated_at_idx").on(card.executorSystem, card.updatedAt),
    check("knowledge_cards_status_check", sql`${card.status} in ('draft', 'approved', 'archived', 'rejected', 'duplicate', 'no_action')`),
    check("knowledge_cards_publication_state_check", sql`${card.publicationState} in ('active', 'suppressed', 'archived')`),
    check("knowledge_cards_knowledge_state_check", sql`${card.knowledgeState} in ('community_observation', 'community_pattern', 'conditional', 'uncertain', 'conflicted', 'confirmed', 'superseded')`),
    check("knowledge_cards_review_state_check", sql`${card.reviewState} in ('none', 'ai_recommended', 'in_review', 'reviewed')`),
    check("knowledge_cards_verification_state_check", sql`${card.verificationState} in ('not_required', 'required', 'corroborated', 'failed')`),
    check("knowledge_cards_content_version_check", sql`${card.contentVersion} >= 1`),
    check("knowledge_cards_evidence_set_revision_check", sql`${card.evidenceSetRevision} >= 1`),
    check("knowledge_cards_conditions_array_check", sql`jsonb_typeof(${card.conditions}) = 'array'`),
    check("knowledge_cards_judge_summary_check", sql`length(btrim(${card.currentJudgeSummary})) between 1 and 1000`),
    check(
      "knowledge_cards_type_check",
      sql`${card.type} in ('place', 'food', 'hotel_area', 'activity', 'service', 'route_note', 'warning', 'cost_note', 'parking', 'ev_charging', 'kid_friendly_tip', 'discount_promotion', 'general_travel_tip')`,
    ),
    check("knowledge_cards_confidence_check", sql`${card.confidence} in ('unverified', 'community', 'curated', 'partner', 'official')`),
    check("knowledge_cards_title_length_check", sql`length(btrim(${card.title})) between 1 and 160`),
    check("knowledge_cards_summary_length_check", sql`length(btrim(${card.summary})) between 1 and 1200`),
    check("knowledge_cards_location_length_check", sql`${card.locationName} is null or length(btrim(${card.locationName})) between 1 and 160`),
    check("knowledge_cards_route_segment_length_check", sql`${card.routeSegment} is null or length(btrim(${card.routeSegment})) between 1 and 160`),
    check("knowledge_cards_details_object_check", sql`jsonb_typeof(${card.practicalDetails}) = 'object'`),
    check("knowledge_cards_tags_array_check", sql`jsonb_typeof(${card.tags}) = 'array'`),
    check("knowledge_cards_executor_shape_check", sql`${card.createdByUserId} is not null or (${card.executorSystem} is not null and length(btrim(${card.executorSystem})) between 1 and 160)`),
    check("knowledge_cards_draft_review_check", sql`${card.status} <> 'draft' or ${card.needsReview} = true`),
  ],
);

export const knowledgeCardStateMigrationReports = pgTable(
  "knowledge_card_state_migration_reports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    reason: text("reason").notNull(),
    cardCount: integer("card_count").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (report) => [
    uniqueIndex("knowledge_card_state_migration_reports_reason_idx").on(report.reason),
    check("knowledge_card_state_migration_reports_reason_check", sql`length(btrim(${report.reason})) between 1 and 160`),
    check("knowledge_card_state_migration_reports_count_check", sql`${report.cardCount} >= 0`),
  ],
);

export const knowledgeCardSources = pgTable(
  "knowledge_card_sources",
  {
    knowledgeCardId: text("knowledge_card_id")
      .notNull()
      .references(() => knowledgeCards.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    supportLevel: text("support_level").$type<KnowledgeSourceSupport>().default("primary").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (link) => [
    primaryKey({ columns: [link.knowledgeCardId, link.sourceId] }),
    index("knowledge_card_sources_source_id_idx").on(link.sourceId),
    check("knowledge_card_sources_support_level_check", sql`${link.supportLevel} in ('primary', 'supporting', 'conflicting')`),
  ],
);

export const knowledgeCardEvidence = pgTable(
  "knowledge_card_evidence",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    knowledgeCardId: text("knowledge_card_id")
      .notNull()
      .references(() => knowledgeCards.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    captureVersionId: text("capture_version_id").notNull(),
    quoteText: text("quote_text").notNull(),
    spanStart: integer("span_start").notNull(),
    spanEnd: integer("span_end").notNull(),
    observedAt: timestamp("observed_at", { mode: "date" }).notNull(),
    capturedAt: timestamp("captured_at", { mode: "date" }).notNull(),
    conditions: jsonb("conditions").$type<string[]>().default([]).notNull(),
    supportLevel: text("support_level").$type<KnowledgeSourceSupport>().default("supporting").notNull(),
    displayPolicy: text("display_policy").$type<KnowledgeEvidenceDisplayPolicy>().default("fact_only").notNull(),
    state: text("state").$type<KnowledgeEvidenceState>().default("active").notNull(),
    withdrawalReason: text("withdrawal_reason").$type<SourceRemovalReason>(),
    independenceKey: text("independence_key").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (evidence) => [
    index("knowledge_card_evidence_active_card_idx").on(evidence.knowledgeCardId, evidence.supportLevel).where(sql`${evidence.state} = 'active'`),
    index("knowledge_card_evidence_source_version_idx").on(evidence.sourceId, evidence.captureVersionId),
    uniqueIndex("knowledge_card_evidence_card_independence_idx").on(evidence.knowledgeCardId, evidence.independenceKey),
    foreignKey({
      columns: [evidence.captureVersionId, evidence.sourceId],
      foreignColumns: [sourceCaptureVersions.id, sourceCaptureVersions.sourceId],
      name: "knowledge_card_evidence_capture_version_source_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [evidence.knowledgeCardId, evidence.sourceId],
      foreignColumns: [knowledgeCardSources.knowledgeCardId, knowledgeCardSources.sourceId],
      name: "knowledge_card_evidence_card_source_fk",
    }).onDelete("cascade"),
    check("knowledge_card_evidence_quote_check", sql`length(btrim(${evidence.quoteText})) between 1 and 2000`),
    check("knowledge_card_evidence_span_check", sql`${evidence.spanStart} >= 0 and ${evidence.spanEnd} > ${evidence.spanStart} and ${evidence.spanEnd} - ${evidence.spanStart} = char_length(${evidence.quoteText})`),
    check("knowledge_card_evidence_conditions_array_check", sql`jsonb_typeof(${evidence.conditions}) = 'array'`),
    check("knowledge_card_evidence_support_check", sql`${evidence.supportLevel} in ('primary', 'supporting', 'conflicting')`),
    check("knowledge_card_evidence_display_policy_check", sql`${evidence.displayPolicy} in ('fact_only', 'traveler_visible', 'operator_only')`),
    check("knowledge_card_evidence_state_check", sql`${evidence.state} in ('active', 'removed')`),
    check("knowledge_card_evidence_withdrawal_reason_check", sql`${evidence.withdrawalReason} is null or ${evidence.withdrawalReason} in ('withdrawn', 'inaccessible', 'removed')`),
    check("knowledge_card_evidence_withdrawal_shape_check", sql`${evidence.state} = 'removed' or ${evidence.withdrawalReason} is null`),
    check("knowledge_card_evidence_independence_key_check", sql`length(btrim(${evidence.independenceKey})) between 1 and 160`),
  ],
);

export const knowledgeEvidenceBackfillReports = pgTable(
  "knowledge_evidence_backfill_reports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    reason: text("reason").notNull(),
    cardCount: integer("card_count").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (report) => [
    uniqueIndex("knowledge_evidence_backfill_reports_reason_idx").on(report.reason),
    check("knowledge_evidence_backfill_reports_reason_check", sql`length(btrim(${report.reason})) between 1 and 160`),
    check("knowledge_evidence_backfill_reports_count_check", sql`${report.cardCount} >= 0`),
  ],
);

export const knowledgeCardSearchDocuments = pgTable(
  "knowledge_card_search_documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    knowledgeCardId: text("knowledge_card_id")
      .notNull()
      .references(() => knowledgeCards.id, { onDelete: "cascade" }),
    contentVersion: integer("content_version").default(1).notNull(),
    acceptedFence: text("accepted_fence").default("legacy").notNull(),
    executorSystem: text("executor_system").notNull(),
    status: text("status").$type<KnowledgeSearchDocumentStatus>().default("active").notNull(),
    searchableText: text("searchable_text").notNull(),
    textHash: text("text_hash").notNull(),
    sourceCount: integer("source_count").notNull(),
    confidence: text("confidence").$type<KnowledgeConfidence>().notNull(),
    freshnessSensitive: boolean("freshness_sensitive").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    disabledAt: timestamp("disabled_at", { mode: "date" }),
  },
  (document) => [
    uniqueIndex("knowledge_card_search_documents_card_idx").on(document.knowledgeCardId),
    uniqueIndex("knowledge_card_search_documents_active_card_idx").on(document.knowledgeCardId).where(sql`${document.status} = 'active'`),
    index("knowledge_card_search_documents_status_updated_idx").on(document.status, document.updatedAt),
    index("knowledge_card_search_documents_card_version_idx").on(document.knowledgeCardId, document.contentVersion),
    index("knowledge_card_search_documents_confidence_idx").on(document.confidence),
    index("knowledge_card_search_documents_executor_system_updated_at_idx").on(document.executorSystem, document.updatedAt),
    check("knowledge_card_search_documents_status_check", sql`${document.status} in ('active', 'disabled', 'stale')`),
    check("knowledge_card_search_documents_confidence_check", sql`${document.confidence} in ('unverified', 'community', 'curated', 'partner', 'official')`),
    check("knowledge_card_search_documents_text_not_empty_check", sql`length(btrim(${document.searchableText})) > 0`),
    check("knowledge_card_search_documents_hash_check", sql`${document.textHash} ~ '^[a-f0-9]{64}$'`),
    check("knowledge_card_search_documents_source_count_check", sql`${document.sourceCount} > 0`),
    check("knowledge_card_search_documents_content_version_check", sql`${document.contentVersion} >= 1`),
    check("knowledge_card_search_documents_accepted_fence_check", sql`length(btrim(${document.acceptedFence})) between 1 and 128`),
    check("knowledge_card_search_documents_executor_system_check", sql`length(btrim(${document.executorSystem})) between 1 and 160`),
    check("knowledge_card_search_documents_disabled_at_check", sql`(${document.status} = 'active' and ${document.disabledAt} is null) or (${document.status} <> 'active' and ${document.disabledAt} is not null)`),
  ],
);

export const knowledgeSamplingPolicies = pgTable(
  "knowledge_sampling_policies",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    windowStartsAt: timestamp("window_starts_at", { mode: "date" }).notNull(),
    windowEndsAt: timestamp("window_ends_at", { mode: "date" }).notNull(),
    samplingPercent: integer("sampling_percent").default(15).notNull(),
    cohortKey: text("cohort_key").notNull(),
    escalatedAt: timestamp("escalated_at", { mode: "date" }),
    suppressedAt: timestamp("suppressed_at", { mode: "date" }),
    enrollmentCandidateCount: integer("enrollment_candidate_count"),
    enrollmentSelectedCount: integer("enrollment_selected_count"),
    enrollmentDigest: text("enrollment_digest"),
    enrollmentSealedAt: timestamp("enrollment_sealed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (policy) => [
    uniqueIndex("knowledge_sampling_policies_cohort_key_idx").on(policy.cohortKey),
    index("knowledge_sampling_policies_window_idx").on(policy.windowStartsAt, policy.windowEndsAt),
    check("knowledge_sampling_policies_window_check", sql`${policy.windowEndsAt} > ${policy.windowStartsAt}`),
    check("knowledge_sampling_policies_percent_check", sql`${policy.samplingPercent} between 1 and 100`),
    check("knowledge_sampling_policies_cohort_key_check", sql`length(btrim(${policy.cohortKey})) between 1 and 160`),
    check("knowledge_sampling_policies_enrollment_counts_check", sql`(${policy.enrollmentCandidateCount} is null and ${policy.enrollmentSelectedCount} is null and ${policy.enrollmentDigest} is null and ${policy.enrollmentSealedAt} is null) or (${policy.enrollmentCandidateCount} >= 0 and ${policy.enrollmentSelectedCount} >= 0 and ${policy.enrollmentSelectedCount} <= ${policy.enrollmentCandidateCount} and ${policy.enrollmentDigest} ~ '^[a-f0-9]{64}$' and ${policy.enrollmentSealedAt} is not null)`),
  ],
);

export const knowledgeSamplingCohortMembers = pgTable(
  "knowledge_sampling_cohort_members",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    policyId: text("policy_id").notNull().references(() => knowledgeSamplingPolicies.id, { onDelete: "restrict" }),
    knowledgeCardId: text("knowledge_card_id").notNull().references(() => knowledgeCards.id, { onDelete: "restrict" }),
    contentVersion: integer("content_version").notNull(),
    evidenceSetRevision: integer("evidence_set_revision").notNull(),
    corridorBucket: text("corridor_bucket"),
    outsideCorridor: boolean("outside_corridor"),
    selectedForSampling: boolean("selected_for_sampling"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (member) => [
    uniqueIndex("knowledge_sampling_cohort_members_policy_version_idx").on(member.policyId, member.knowledgeCardId, member.contentVersion, member.evidenceSetRevision),
    index("knowledge_sampling_cohort_members_policy_idx").on(member.policyId),
    check("knowledge_sampling_cohort_members_versions_check", sql`${member.contentVersion} >= 1 and ${member.evidenceSetRevision} >= 1`),
    check("knowledge_sampling_cohort_members_corridor_shape_check", sql`(${member.corridorBucket} is null and ${member.outsideCorridor} is null) or (${member.corridorBucket} is not null and ${member.outsideCorridor} = false) or (${member.corridorBucket} is null and ${member.outsideCorridor} = true)`),
  ],
);

export const knowledgeRecommendations = pgTable(
  "knowledge_recommendations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    knowledgeCardId: text("knowledge_card_id").notNull().references(() => knowledgeCards.id, { onDelete: "cascade" }),
    contentVersion: integer("content_version").notNull(),
    evidenceSetRevision: integer("evidence_set_revision").notNull(),
    status: text("status").$type<KnowledgeRecommendationStatus>().default("open").notNull(),
    reason: text("reason").$type<KnowledgeRecommendationReason>().notNull(),
    priority: integer("priority").notNull(),
    policyId: text("policy_id").references(() => knowledgeSamplingPolicies.id, { onDelete: "restrict" }),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().default({}).notNull(),
    requiredForSampling: boolean("required_for_sampling").default(false).notNull(),
    executorSystem: text("executor_system"),
    resolution: text("resolution").$type<KnowledgeRecommendationResolution>(),
    samplingDispositionReason: text("sampling_disposition_reason").$type<KnowledgeSamplingDispositionReason>(),
    samplingRationale: text("sampling_rationale"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (recommendation) => [
    uniqueIndex("knowledge_recommendations_open_version_reason_idx").on(recommendation.knowledgeCardId, recommendation.contentVersion, recommendation.evidenceSetRevision, recommendation.reason).where(sql`${recommendation.status} in ('open', 'in_review')`),
    index("knowledge_recommendations_open_queue_idx").on(recommendation.status, recommendation.priority, recommendation.createdAt).where(sql`${recommendation.status} in ('open', 'in_review')`),
    index("knowledge_recommendations_card_version_idx").on(recommendation.knowledgeCardId, recommendation.contentVersion, recommendation.evidenceSetRevision),
    index("knowledge_recommendations_executor_system_created_at_idx").on(recommendation.executorSystem, recommendation.createdAt),
    index("knowledge_recommendations_policy_sampling_diagnostics_idx").on(recommendation.policyId, recommendation.reason, recommendation.knowledgeCardId, recommendation.contentVersion, recommendation.evidenceSetRevision, recommendation.resolvedAt.desc(), recommendation.updatedAt.desc(), recommendation.id.desc()),
    check("knowledge_recommendations_versions_check", sql`${recommendation.contentVersion} >= 1 and ${recommendation.evidenceSetRevision} >= 1`),
    check("knowledge_recommendations_status_check", sql`${recommendation.status} in ('open', 'in_review', 'resolved', 'superseded')`),
    check("knowledge_recommendations_reason_check", sql`${recommendation.reason} in ('risk', 'weak_evidence', 'freshness', 'conflict', 'duplicate_risk', 'missing_context', 'verification', 'relation', 'sampling')`),
    check("knowledge_recommendations_priority_check", sql`${recommendation.priority} between 1 and 100`),
    check("knowledge_recommendations_policy_snapshot_check", sql`jsonb_typeof(${recommendation.policySnapshot}) = 'object' and octet_length(${recommendation.policySnapshot}::text) <= 1024`),
    check("knowledge_recommendations_required_sampling_check", sql`${recommendation.requiredForSampling} = false or ${recommendation.reason} = 'sampling'`),
    check("knowledge_recommendations_executor_system_check", sql`${recommendation.executorSystem} is null or length(btrim(${recommendation.executorSystem})) between 1 and 160`),
    check("knowledge_recommendations_resolution_check", sql`${recommendation.resolution} is null or ${recommendation.resolution} in ('accepted', 'edited', 'suppressed', 'restored', 'verified', 'relation_resolved', 'sampling_passed', 'sampling_failed')`),
    check("knowledge_recommendations_sampling_reason_check", sql`${recommendation.samplingDispositionReason} is null or ${recommendation.samplingDispositionReason} in ('confirmed', 'minor_issue', 'insufficient_evidence', 'stale_or_changed', 'material_error', 'safety_risk')`),
    check("knowledge_recommendations_sampling_rationale_check", sql`${recommendation.samplingRationale} is null or length(btrim(${recommendation.samplingRationale})) between 1 and 500`),
    check("knowledge_recommendations_sampling_disposition_shape_check", sql`(${recommendation.resolution} in ('sampling_passed', 'sampling_failed') and ${recommendation.samplingDispositionReason} is not null) or (${recommendation.resolution} is null or ${recommendation.resolution} not in ('sampling_passed', 'sampling_failed')) and ${recommendation.samplingDispositionReason} is null and ${recommendation.samplingRationale} is null`),
    check("knowledge_recommendations_resolved_shape_check", sql`(${recommendation.status} in ('open', 'in_review') and ${recommendation.resolution} is null and ${recommendation.resolvedByUserId} is null and ${recommendation.resolvedAt} is null) or (${recommendation.status} in ('resolved', 'superseded') and ${recommendation.resolution} is not null and ${recommendation.resolvedByUserId} is not null and ${recommendation.executorSystem} is null and ${recommendation.resolvedAt} is not null) or (${recommendation.status} = 'superseded' and ${recommendation.resolution} is not null and ${recommendation.resolvedByUserId} is null and ${recommendation.executorSystem} is not null and length(btrim(${recommendation.executorSystem})) between 1 and 160 and ${recommendation.resolvedAt} is not null)`),
  ],
);

export const knowledgeSamplingCandidateLedger = pgTable(
  "knowledge_sampling_candidate_ledger",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    terminalIngestionJobId: text("terminal_ingestion_job_id").notNull().references(() => knowledgeIngestionJobs.id, { onDelete: "restrict" }),
    policyId: text("policy_id").notNull().references(() => knowledgeSamplingPolicies.id, { onDelete: "restrict" }),
    knowledgeCardId: text("knowledge_card_id").notNull().references(() => knowledgeCards.id, { onDelete: "restrict" }),
    contentVersion: integer("content_version").notNull(),
    evidenceSetRevision: integer("evidence_set_revision").notNull(),
    corridorBucket: text("corridor_bucket").notNull(),
    outsideCorridor: boolean("outside_corridor").notNull(),
    selectedForSampling: boolean("selected_for_sampling").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (entry) => [
    uniqueIndex("knowledge_sampling_candidate_ledger_terminal_fence_idx").on(entry.terminalIngestionJobId, entry.knowledgeCardId, entry.contentVersion, entry.evidenceSetRevision),
    uniqueIndex("knowledge_sampling_candidate_ledger_policy_fence_idx").on(entry.policyId, entry.knowledgeCardId, entry.contentVersion, entry.evidenceSetRevision),
    index("knowledge_sampling_candidate_ledger_policy_idx").on(entry.policyId),
    check("knowledge_sampling_candidate_ledger_versions_check", sql`${entry.contentVersion} >= 1 and ${entry.evidenceSetRevision} >= 1`),
    check("knowledge_sampling_candidate_ledger_corridor_shape_check", sql`(${entry.corridorBucket} <> '' and ${entry.outsideCorridor} = false) or (${entry.corridorBucket} = '' and ${entry.outsideCorridor} = true)`),
  ],
);

export const knowledgeVerifyFirstSamplingObligations = pgTable(
  "knowledge_verify_first_sampling_obligations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    terminalIngestionJobId: text("terminal_ingestion_job_id").notNull().references(() => knowledgeIngestionJobs.id, { onDelete: "restrict" }),
    policyId: text("policy_id").notNull().references(() => knowledgeSamplingPolicies.id, { onDelete: "restrict" }),
    knowledgeCardId: text("knowledge_card_id").notNull().references(() => knowledgeCards.id, { onDelete: "restrict" }),
    contentVersion: integer("content_version").notNull(),
    evidenceSetRevision: integer("evidence_set_revision").notNull(),
    corridorBucket: text("corridor_bucket").notNull(),
    outsideCorridor: boolean("outside_corridor").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (obligation) => [
    uniqueIndex("knowledge_verify_first_sampling_obligations_terminal_fence_idx").on(obligation.terminalIngestionJobId, obligation.knowledgeCardId, obligation.contentVersion, obligation.evidenceSetRevision),
    uniqueIndex("knowledge_verify_first_sampling_obligations_policy_fence_idx").on(obligation.policyId, obligation.knowledgeCardId, obligation.contentVersion, obligation.evidenceSetRevision),
    index("knowledge_verify_first_sampling_obligations_policy_idx").on(obligation.policyId),
    check("knowledge_verify_first_sampling_obligations_versions_check", sql`${obligation.contentVersion} >= 1 and ${obligation.evidenceSetRevision} >= 1`),
    check("knowledge_verify_first_sampling_obligations_corridor_shape_check", sql`(${obligation.corridorBucket} <> '' and ${obligation.outsideCorridor} = false) or (${obligation.corridorBucket} = '' and ${obligation.outsideCorridor} = true)`),
  ],
);

export const knowledgeIndexDirtyMarkers = pgTable(
  "knowledge_index_dirty_markers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    knowledgeCardId: text("knowledge_card_id").notNull().references(() => knowledgeCards.id, { onDelete: "cascade" }),
    contentVersion: integer("content_version").notNull(),
    evidenceSetRevision: integer("evidence_set_revision").notNull(),
    reason: text("reason").notNull(),
    executorSystem: text("executor_system"),
    status: text("status").$type<KnowledgeIndexDirtyMarkerStatus>().default("pending").notNull(),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    leaseExpiresAt: timestamp("lease_expires_at", { mode: "date" }),
    fencingToken: text("fencing_token"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    nextRunAt: timestamp("next_run_at", { mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    completionReason: text("completion_reason"),
    failureCode: text("failure_code"),
    failureReason: text("failure_reason"),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (marker) => [
    uniqueIndex("knowledge_index_dirty_markers_card_version_idx").on(marker.knowledgeCardId, marker.contentVersion),
    index("knowledge_index_dirty_markers_created_at_idx").on(marker.createdAt),
    index("knowledge_index_dirty_markers_executor_system_created_at_idx").on(marker.executorSystem, marker.createdAt),
    index("knowledge_index_dirty_markers_due_work_idx").on(marker.nextRunAt, marker.createdAt).where(sql`${marker.status} in ('pending', 'claimed')`),
    check("knowledge_index_dirty_markers_versions_check", sql`${marker.contentVersion} >= 1 and ${marker.evidenceSetRevision} >= 1`),
    check("knowledge_index_dirty_markers_reason_check", sql`length(btrim(${marker.reason})) between 1 and 120`),
    check("knowledge_index_dirty_markers_executor_system_check", sql`${marker.executorSystem} is null or length(btrim(${marker.executorSystem})) between 1 and 160`),
    check("knowledge_index_dirty_markers_status_check", sql`${marker.status} in ('pending', 'claimed', 'completed', 'failed', 'superseded')`),
    check("knowledge_index_dirty_markers_attempts_check", sql`${marker.attemptCount} >= 0 and ${marker.maxAttempts} between 1 and 10 and ${marker.attemptCount} <= ${marker.maxAttempts}`),
    check("knowledge_index_dirty_markers_fence_check", sql`${marker.fencingToken} is null or ${marker.fencingToken} ~ '^[a-f0-9]{64}$'`),
    check("knowledge_index_dirty_markers_claim_shape_check", sql`(${marker.claimedBy} is null and ${marker.claimedAt} is null and ${marker.leaseExpiresAt} is null and ${marker.fencingToken} is null) or (${marker.claimedBy} is not null and length(btrim(${marker.claimedBy})) between 1 and 160 and ${marker.claimedAt} is not null and ${marker.leaseExpiresAt} is not null and ${marker.fencingToken} is not null and ${marker.fencingToken} ~ '^[a-f0-9]{64}$')`),
    check("knowledge_index_dirty_markers_failure_code_check", sql`${marker.failureCode} is null or length(btrim(${marker.failureCode})) between 1 and 80`),
    check("knowledge_index_dirty_markers_failure_reason_check", sql`${marker.failureReason} is null or length(btrim(${marker.failureReason})) between 1 and 240`),
  ],
);

/** Durable cursor for the bounded, supervised knowledge projection backfill. */
export const knowledgeIndexBackfillState = pgTable(
  "knowledge_index_backfill_state",
  {
    id: text("id").primaryKey(),
    cursor: text("cursor"),
    completedAt: timestamp("completed_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
);

export const knowledgeSourceSuggestions = pgTable(
  "knowledge_source_suggestions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    suggestedCardId: text("suggested_card_id").references(() => knowledgeCards.id, { onDelete: "cascade" }),
    action: text("action").$type<KnowledgeSuggestionAction>().notNull(),
    targetCardId: text("target_card_id").references(() => knowledgeCards.id, { onDelete: "restrict" }),
    beforeSummary: text("before_summary"),
    afterSummary: text("after_summary"),
    conflictSummary: text("conflict_summary"),
    rationale: text("rationale"),
    aiPromptVersion: text("ai_prompt_version").notNull(),
    aiGatewayModelId: text("ai_gateway_model_id").references(() => aiGatewayModels.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "restrict" }),
    executorSystem: text("executor_system"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (suggestion) => [
    index("knowledge_source_suggestions_source_id_idx").on(suggestion.sourceId),
    index("knowledge_source_suggestions_suggested_card_id_idx").on(suggestion.suggestedCardId),
    index("knowledge_source_suggestions_target_card_id_idx").on(suggestion.targetCardId),
    index("knowledge_source_suggestions_action_created_at_idx").on(suggestion.action, suggestion.createdAt),
    index("knowledge_source_suggestions_executor_system_created_at_idx").on(suggestion.executorSystem, suggestion.createdAt),
    check("knowledge_source_suggestions_action_check", sql`${suggestion.action} in ('create', 'update', 'conflict', 'duplicate', 'no_action')`),
    check("knowledge_source_suggestions_review_card_check", sql`${suggestion.action} not in ('create', 'update', 'conflict') or ${suggestion.suggestedCardId} is not null`),
    check("knowledge_source_suggestions_target_check", sql`${suggestion.action} not in ('update', 'conflict', 'duplicate') or ${suggestion.targetCardId} is not null`),
    check("knowledge_source_suggestions_relationship_check", sql`(${suggestion.action} in ('create', 'no_action') and ${suggestion.targetCardId} is null or ${suggestion.action} not in ('create', 'no_action')) and (${suggestion.action} in ('duplicate', 'no_action') and ${suggestion.suggestedCardId} is null or ${suggestion.action} not in ('duplicate', 'no_action')) and (${suggestion.suggestedCardId} is null or ${suggestion.targetCardId} is null or ${suggestion.suggestedCardId} <> ${suggestion.targetCardId})`),
    check("knowledge_source_suggestions_required_summary_check", sql`${suggestion.action} <> 'update' or (${suggestion.beforeSummary} is not null and ${suggestion.afterSummary} is not null)`),
    check("knowledge_source_suggestions_conflict_summary_check", sql`${suggestion.action} <> 'conflict' or ${suggestion.conflictSummary} is not null`),
    check("knowledge_source_suggestions_executor_shape_check", sql`${suggestion.createdByUserId} is not null or (${suggestion.executorSystem} is not null and length(btrim(${suggestion.executorSystem})) between 1 and 160)`),
    check("knowledge_source_suggestions_summary_length_check", sql`(${suggestion.beforeSummary} is null or length(btrim(${suggestion.beforeSummary})) between 1 and 1200) and (${suggestion.afterSummary} is null or length(btrim(${suggestion.afterSummary})) between 1 and 1200) and (${suggestion.conflictSummary} is null or length(btrim(${suggestion.conflictSummary})) between 1 and 1200) and (${suggestion.rationale} is null or length(btrim(${suggestion.rationale})) between 1 and 1200)`),
  ],
);

export const knowledgeSeedBatches = pgTable(
  "knowledge_seed_batches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text("label"),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (batch) => [
    index("knowledge_seed_batches_created_at_idx").on(batch.createdAt),
    index("knowledge_seed_batches_submitted_by_user_id_idx").on(batch.submittedByUserId),
    check("knowledge_seed_batches_label_check", sql`${batch.label} is null or (length(btrim(${batch.label})) between 1 and 160 and position(chr(10) in ${batch.label}) = 0 and position(chr(13) in ${batch.label}) = 0)`),
  ],
);

export const knowledgeSeedBatchItems = pgTable(
  "knowledge_seed_batch_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    batchId: text("batch_id")
      .notNull()
      .references(() => knowledgeSeedBatches.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    submittedUrl: text("submitted_url").notNull(),
    canonicalUrl: text("canonical_url"),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "restrict" }),
    status: text("status").$type<KnowledgeSeedBatchItemStatus>().notNull(),
    errorSummary: text("error_summary"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (item) => [
    index("knowledge_seed_batch_items_batch_id_idx").on(item.batchId),
    index("knowledge_seed_batch_items_source_id_idx").on(item.sourceId),
    index("knowledge_seed_batch_items_status_idx").on(item.status),
    uniqueIndex("knowledge_seed_batch_items_batch_line_idx").on(item.batchId, item.lineNumber),
    check("knowledge_seed_batch_items_status_check", sql`${item.status} in ('pending', 'reading', 'extracted', 'needs_review', 'approved', 'failed', 'duplicate', 'rejected')`),
    check("knowledge_seed_batch_items_line_number_check", sql`${item.lineNumber} > 0`),
    check("knowledge_seed_batch_items_submitted_url_check", sql`length(btrim(${item.submittedUrl})) between 1 and 2048`),
    check("knowledge_seed_batch_items_canonical_url_check", sql`${item.canonicalUrl} is null or length(btrim(${item.canonicalUrl})) between 1 and 2048`),
    check("knowledge_seed_batch_items_error_summary_check", sql`${item.errorSummary} is null or (length(btrim(${item.errorSummary})) between 1 and 500 and position(chr(10) in ${item.errorSummary}) = 0 and position(chr(13) in ${item.errorSummary}) = 0)`),
    check("knowledge_seed_batch_items_failure_shape_check", sql`${item.status} <> 'failed' or ${item.errorSummary} is not null`),
    check("knowledge_seed_batch_items_source_shape_check", sql`${item.status} in ('failed', 'duplicate') or ${item.sourceId} is not null`),
  ],
);

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    initiatedByUserId: text("initiated_by_user_id")
      .references(() => users.id, { onDelete: "cascade" }),
    tripProjectId: text("trip_project_id").references(() => tripProjects.id, { onDelete: "set null" }),
    executorSystem: text("executor_system").notNull(),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    userMessageId: text("user_message_id").references(() => messages.id, { onDelete: "set null" }),
    assistantMessageId: text("assistant_message_id").references(() => messages.id, { onDelete: "set null" }),
    tripAnswerContextSnapshotId: text("trip_answer_context_snapshot_id").references(() => tripAnswerContextSnapshots.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    aiGatewayModelId: text("ai_gateway_model_id").references(() => aiGatewayModels.id, { onDelete: "set null" }),
    promptVersion: text("prompt_version").notNull(),
    status: text("status").$type<AiUsageStatus>().notNull(),
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    cachedPromptTokens: integer("cached_prompt_tokens"),
    cacheWritePromptTokens: integer("cache_write_prompt_tokens"),
    estimatedInputCostMicros: integer("estimated_input_cost_micros"),
    estimatedOutputCostMicros: integer("estimated_output_cost_micros"),
    estimatedCacheReadCostMicros: integer("estimated_cache_read_cost_micros"),
    estimatedCacheWriteCostMicros: integer("estimated_cache_write_cost_micros"),
    estimatedTotalCostMicros: integer("estimated_total_cost_micros"),
    pricingCurrency: text("pricing_currency"),
    inputTokenPriceMicros: integer("input_token_price_micros"),
    outputTokenPriceMicros: integer("output_token_price_micros"),
    cacheReadTokenPriceMicros: integer("cache_read_token_price_micros"),
    cacheWriteTokenPriceMicros: integer("cache_write_token_price_micros"),
    pricingUnitTokens: integer("pricing_unit_tokens"),
    pricingVersion: text("pricing_version"),
    pricingEffectiveAt: timestamp("pricing_effective_at", { mode: "date" }),
    costStatus: text("cost_status").notNull().default("missing_pricing"),
    errorCode: text("error_code"),
    providerRequestId: text("provider_request_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (aiUsageEvent) => [
    index("ai_usage_events_initiated_by_user_id_created_at_idx").on(aiUsageEvent.initiatedByUserId, aiUsageEvent.createdAt),
    index("ai_usage_events_executor_system_created_at_idx").on(aiUsageEvent.executorSystem, aiUsageEvent.createdAt),
    index("ai_usage_events_conversation_id_idx").on(aiUsageEvent.conversationId),
    index("ai_usage_events_ai_gateway_model_id_idx").on(aiUsageEvent.aiGatewayModelId),
    index("ai_usage_events_status_idx").on(aiUsageEvent.status),
    check("ai_usage_events_status_check", sql`${aiUsageEvent.status} in ('success', 'failure')`),
    check("ai_usage_events_latency_non_negative_check", sql`${aiUsageEvent.latencyMs} is null or ${aiUsageEvent.latencyMs} >= 0`),
    check("ai_usage_events_prompt_tokens_non_negative_check", sql`${aiUsageEvent.promptTokens} is null or ${aiUsageEvent.promptTokens} >= 0`),
    check(
      "ai_usage_events_completion_tokens_non_negative_check",
      sql`${aiUsageEvent.completionTokens} is null or ${aiUsageEvent.completionTokens} >= 0`,
    ),
    check("ai_usage_events_total_tokens_non_negative_check", sql`${aiUsageEvent.totalTokens} is null or ${aiUsageEvent.totalTokens} >= 0`),
    check("ai_usage_events_cached_prompt_tokens_non_negative_check", sql`${aiUsageEvent.cachedPromptTokens} is null or ${aiUsageEvent.cachedPromptTokens} >= 0`),
    check("ai_usage_events_cache_write_prompt_tokens_non_negative_check", sql`${aiUsageEvent.cacheWritePromptTokens} is null or ${aiUsageEvent.cacheWritePromptTokens} >= 0`),
    check("ai_usage_events_estimated_input_cost_non_negative_check", sql`${aiUsageEvent.estimatedInputCostMicros} is null or ${aiUsageEvent.estimatedInputCostMicros} >= 0`),
    check("ai_usage_events_estimated_output_cost_non_negative_check", sql`${aiUsageEvent.estimatedOutputCostMicros} is null or ${aiUsageEvent.estimatedOutputCostMicros} >= 0`),
    check("ai_usage_events_estimated_cache_read_cost_non_negative_check", sql`${aiUsageEvent.estimatedCacheReadCostMicros} is null or ${aiUsageEvent.estimatedCacheReadCostMicros} >= 0`),
    check("ai_usage_events_estimated_cache_write_cost_non_negative_check", sql`${aiUsageEvent.estimatedCacheWriteCostMicros} is null or ${aiUsageEvent.estimatedCacheWriteCostMicros} >= 0`),
    check("ai_usage_events_estimated_total_cost_non_negative_check", sql`${aiUsageEvent.estimatedTotalCostMicros} is null or ${aiUsageEvent.estimatedTotalCostMicros} >= 0`),
    check("ai_usage_events_pricing_unit_positive_check", sql`${aiUsageEvent.pricingUnitTokens} is null or ${aiUsageEvent.pricingUnitTokens} > 0`),
    check("ai_usage_events_input_price_non_negative_check", sql`${aiUsageEvent.inputTokenPriceMicros} is null or ${aiUsageEvent.inputTokenPriceMicros} >= 0`),
    check("ai_usage_events_output_price_non_negative_check", sql`${aiUsageEvent.outputTokenPriceMicros} is null or ${aiUsageEvent.outputTokenPriceMicros} >= 0`),
    check("ai_usage_events_cache_read_price_non_negative_check", sql`${aiUsageEvent.cacheReadTokenPriceMicros} is null or ${aiUsageEvent.cacheReadTokenPriceMicros} >= 0`),
    check("ai_usage_events_cache_write_price_non_negative_check", sql`${aiUsageEvent.cacheWriteTokenPriceMicros} is null or ${aiUsageEvent.cacheWriteTokenPriceMicros} >= 0`),
    check("ai_usage_events_cost_status_check", sql`${aiUsageEvent.costStatus} in ('estimated', 'missing_pricing', 'missing_usage', 'missing_cost')`),
    check("ai_usage_events_provider_request_id_check", sql`${aiUsageEvent.providerRequestId} is null or length(btrim(${aiUsageEvent.providerRequestId})) between 1 and 200`),
    check("ai_usage_events_executor_system_check", sql`length(btrim(${aiUsageEvent.executorSystem})) > 0`),
  ],
);

export const webSearchResults = pgTable(
  "web_search_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    userMessageId: text("user_message_id").notNull(),
    query: text("query").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    snippet: text("snippet").notNull(),
    content: text("content"),
    provider: text("provider").notNull(),
    providerScore: real("provider_score"),
    checkedAt: timestamp("checked_at", { mode: "date" }).notNull(),
    sourceType: text("source_type").$type<WebSearchResultSourceType>().notNull(),
    confidence: text("confidence").$type<WebSearchResultConfidence>().notNull(),
    triggerReason: text("trigger_reason").notNull(),
    rank: integer("rank").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (result) => [
    foreignKey({
      columns: [result.conversationId, result.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "web_search_results_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [result.userMessageId, result.conversationId, result.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "web_search_results_user_message_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("web_search_results_user_message_rank_idx").on(result.userMessageId, result.rank),
    index("web_search_results_conversation_created_at_idx").on(result.conversationId, result.createdAt),
    index("web_search_results_user_id_created_at_idx").on(result.userId, result.createdAt),
    check("web_search_results_query_length_check", sql`length(btrim(${result.query})) between 1 and 500`),
    check("web_search_results_title_length_check", sql`length(btrim(${result.title})) between 1 and 300`),
    check("web_search_results_url_length_check", sql`length(btrim(${result.url})) between 1 and 2048`),
    check("web_search_results_snippet_length_check", sql`length(btrim(${result.snippet})) between 1 and 1200`),
    check("web_search_results_content_length_check", sql`${result.content} is null or length(btrim(${result.content})) between 1 and 2000`),
    check("web_search_results_provider_check", sql`length(btrim(${result.provider})) between 1 and 80`),
    check("web_search_results_score_check", sql`${result.providerScore} is null or (${result.providerScore} >= 0 and ${result.providerScore} <= 1)`),
    check("web_search_results_source_type_check", sql`${result.sourceType} in ('official', 'provider', 'community', 'general')`),
    check("web_search_results_confidence_check", sql`${result.confidence} = 'unverified'`),
    check("web_search_results_trigger_reason_check", sql`${result.triggerReason} in ('no_active_knowledge', 'insufficient_active_knowledge', 'freshness_sensitive_request', 'active_knowledge_may_be_stale', 'source_conflict', 'excluded_conflict_candidate', 'excluded_verification_required_candidate', 'selected_knowledge_requires_verification', 'active_knowledge_unavailable', 'no_approved_knowledge', 'insufficient_approved_knowledge', 'approved_knowledge_may_be_stale', 'approved_knowledge_unavailable')`),
    check("web_search_results_rank_check", sql`${result.rank} > 0`),
  ],
);

export const assistantRetrievalDecisions = pgTable(
  "assistant_retrieval_decisions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    userMessageId: text("user_message_id").notNull(),
    assistantMessageId: text("assistant_message_id").notNull(),
    tripAnswerContextSnapshotId: text("trip_answer_context_snapshot_id").references(() => tripAnswerContextSnapshots.id, { onDelete: "set null" }),
    approvedKnowledgeCandidateCount: integer("approved_knowledge_candidate_count").notNull(),
    approvedKnowledgeSelectedCount: integer("approved_knowledge_selected_count").notNull(),
    approvedKnowledgeTargetCount: integer("approved_knowledge_target_count").notNull(),
    approvedKnowledgeRelevanceThreshold: real("approved_knowledge_relevance_threshold").notNull(),
    broadPlanningQuestion: boolean("broad_planning_question").notNull(),
    freshnessRequired: boolean("freshness_required").notNull(),
    conflictDetected: boolean("conflict_detected").notNull(),
    webSearchTriggered: boolean("web_search_triggered").notNull(),
    webSearchTriggerReasons: jsonb("web_search_trigger_reasons").$type<string[]>().default([]).notNull(),
    generalReasoningUsed: boolean("general_reasoning_used").notNull(),
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),
    selectedKnowledgeCardIds: jsonb("selected_knowledge_card_ids").$type<string[]>().default([]).notNull(),
    knowledgePolicySnapshot: jsonb("knowledge_policy_snapshot").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (decision) => [
    foreignKey({
      columns: [decision.conversationId, decision.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "assistant_retrieval_decisions_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [decision.userMessageId, decision.conversationId, decision.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "assistant_retrieval_decisions_user_message_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [decision.assistantMessageId, decision.conversationId, decision.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "assistant_retrieval_decisions_assistant_message_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("assistant_retrieval_decisions_assistant_message_idx").on(decision.assistantMessageId),
    index("assistant_retrieval_decisions_conversation_created_at_idx").on(decision.conversationId, decision.createdAt),
    index("assistant_retrieval_decisions_user_id_created_at_idx").on(decision.userId, decision.createdAt),
    check("assistant_retrieval_decisions_candidate_count_check", sql`${decision.approvedKnowledgeCandidateCount} >= ${decision.approvedKnowledgeSelectedCount}`),
    check("assistant_retrieval_decisions_selected_count_check", sql`${decision.approvedKnowledgeSelectedCount} >= 0`),
    check("assistant_retrieval_decisions_target_count_check", sql`${decision.approvedKnowledgeTargetCount} > 0`),
    check("assistant_retrieval_decisions_relevance_threshold_check", sql`${decision.approvedKnowledgeRelevanceThreshold} > 0`),
    check("assistant_retrieval_decisions_reasons_array_check", sql`jsonb_typeof(${decision.webSearchTriggerReasons}) = 'array'`),
    check("assistant_retrieval_decisions_warnings_array_check", sql`jsonb_typeof(${decision.warnings}) = 'array'`),
    check("assistant_retrieval_decisions_selected_card_ids_array_check", sql`jsonb_typeof(${decision.selectedKnowledgeCardIds}) = 'array'`),
  ],
);

export const assistantResponseProvenance = pgTable(
  "assistant_response_provenance",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    userMessageId: text("user_message_id").notNull(),
    assistantMessageId: text("assistant_message_id").notNull(),
    tripAnswerContextSnapshotId: text("trip_answer_context_snapshot_id").references(() => tripAnswerContextSnapshots.id, { onDelete: "set null" }),
    sourceCategory: text("source_category").$type<AssistantProvenanceSourceCategory>().notNull(),
    sourceReferenceId: text("source_reference_id"),
    sourceReferenceType: text("source_reference_type"),
    rank: integer("rank").notNull(),
    retrievalScore: real("retrieval_score"),
    sourceType: text("source_type"),
    verificationStatus: text("verification_status").$type<AssistantProvenanceVerificationStatus>().notNull(),
    availability: text("availability").$type<AssistantProvenanceAvailability>().default("available").notNull(),
    withdrawnAt: timestamp("withdrawn_at", { mode: "date" }),
    withdrawalReason: text("withdrawal_reason").$type<SourceRemovalReason>(),
    usedInPrompt: boolean("used_in_prompt").default(true).notNull(),
    citedInAnswer: boolean("cited_in_answer").default(false).notNull(),
    sourceSnapshot: jsonb("source_snapshot").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (provenance) => [
    foreignKey({
      columns: [provenance.conversationId, provenance.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "assistant_response_provenance_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [provenance.userMessageId, provenance.conversationId, provenance.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "assistant_response_provenance_user_message_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [provenance.assistantMessageId, provenance.conversationId, provenance.userId],
      foreignColumns: [messages.id, messages.conversationId, messages.userId],
      name: "assistant_response_provenance_assistant_message_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("assistant_response_provenance_assistant_rank_idx").on(provenance.assistantMessageId, provenance.rank),
    index("assistant_response_provenance_conversation_created_at_idx").on(provenance.conversationId, provenance.createdAt),
    index("assistant_response_provenance_source_reference_idx").on(provenance.sourceReferenceType, provenance.sourceReferenceId),
    index("assistant_response_provenance_created_id_idx").on(provenance.createdAt, provenance.id),
    check("assistant_response_provenance_category_check", sql`${provenance.sourceCategory} in ('trip_context', 'chat_context', 'knowledge', 'web', 'general')`),
    check("assistant_response_provenance_verification_check", sql`${provenance.verificationStatus} in ('unverified', 'verified')`),
    check("assistant_response_provenance_availability_check", sql`${provenance.availability} in ('available', 'withdrawn')`),
    check("assistant_response_provenance_withdrawal_shape_check", sql`(${provenance.availability} = 'available' and ${provenance.withdrawnAt} is null and ${provenance.withdrawalReason} is null) or (${provenance.availability} = 'withdrawn' and ${provenance.withdrawnAt} is not null and ${provenance.withdrawalReason} in ('withdrawn', 'inaccessible', 'removed'))`),
    check("assistant_response_provenance_rank_check", sql`${provenance.rank} > 0`),
    check("assistant_response_provenance_score_check", sql`${provenance.retrievalScore} is null or ${provenance.retrievalScore} >= 0`),
    check("assistant_response_provenance_snapshot_object_check", sql`jsonb_typeof(${provenance.sourceSnapshot}) = 'object'`),
    check("assistant_response_provenance_reference_pair_check", sql`(${provenance.sourceReferenceId} is null and ${provenance.sourceReferenceType} is null) or (${provenance.sourceReferenceId} is not null and ${provenance.sourceReferenceType} is not null)`),
  ],
);

export const assistantProvenanceWithdrawalBackfillState = pgTable(
  "assistant_provenance_withdrawal_backfill_state",
  {
    contractKey: text("contract_key").primaryKey(),
    cutoverAt: timestamp("cutover_at", { mode: "date" }).notNull(),
    oldWritersQuiescedAt: timestamp("old_writers_quiesced_at", { mode: "date" }).notNull(),
    oldWritersAdmission: text("old_writers_admission").notNull(),
    cursorCreatedAt: timestamp("cursor_created_at", { mode: "date" }),
    cursorId: text("cursor_id"),
    completedAt: timestamp("completed_at", { mode: "date" }),
    failedAt: timestamp("failed_at", { mode: "date" }),
    failureCode: text("failure_code"),
  },
  (state) => [
    check("assistant_provenance_withdrawal_backfill_state_key_check", sql`${state.contractKey} = 'v1'`),
    check("assistant_provenance_withdrawal_backfill_state_admission_check", sql`${state.oldWritersAdmission} = 'old_terminal_evaluation_writers_quiesced_v1'`),
    check("assistant_provenance_withdrawal_backfill_state_cursor_check", sql`(${state.cursorCreatedAt} is null and ${state.cursorId} is null) or (${state.cursorCreatedAt} is not null and ${state.cursorId} is not null)`),
    check("assistant_provenance_withdrawal_backfill_state_failure_check", sql`${state.failureCode} is null or ${state.failureCode} in ('unclassifiable_anchor', 'owner_relation_unresolved')`),
    check("assistant_provenance_withdrawal_backfill_state_terminal_check", sql`(${state.completedAt} is null or (${state.failedAt} is null and ${state.failureCode} is null)) and ((${state.failedAt} is null and ${state.failureCode} is null) or (${state.failedAt} is not null and ${state.failureCode} is not null))`),
  ],
);

export const answerUsefulnessFeedback = pgTable(
  "answer_usefulness_feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull(),
    assistantMessageId: text("assistant_message_id").notNull(),
    assistantMessageRole: text("assistant_message_role").$type<MessageRole>().default("assistant").notNull(),
    rating: text("rating").$type<AnswerUsefulnessRating>().notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (feedback) => [
    foreignKey({
      columns: [feedback.conversationId, feedback.userId],
      foreignColumns: [conversations.id, conversations.userId],
      name: "answer_usefulness_feedback_conversation_owner_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [feedback.assistantMessageId, feedback.conversationId, feedback.userId, feedback.assistantMessageRole],
      foreignColumns: [messages.id, messages.conversationId, messages.userId, messages.role],
      name: "answer_usefulness_feedback_assistant_message_owner_fk",
    }).onDelete("cascade"),
    uniqueIndex("answer_usefulness_feedback_assistant_user_idx").on(feedback.assistantMessageId, feedback.userId),
    index("answer_usefulness_feedback_conversation_created_at_idx").on(feedback.conversationId, feedback.createdAt),
    index("answer_usefulness_feedback_user_id_created_at_idx").on(feedback.userId, feedback.createdAt),
    check("answer_usefulness_feedback_rating_check", sql`${feedback.rating} in ('useful', 'not_useful')`),
    check("answer_usefulness_feedback_assistant_role_check", sql`${feedback.assistantMessageRole} = 'assistant'`),
    check("answer_usefulness_feedback_comment_length_check", sql`${feedback.comment} is null or length(btrim(${feedback.comment})) between 1 and 500`),
  ],
);

export const publicMvpEvaluationPromptSets = pgTable(
  "public_mvp_evaluation_prompt_sets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    version: text("version").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (promptSet) => [
    uniqueIndex("public_mvp_evaluation_prompt_sets_version_idx").on(promptSet.version),
    check("public_mvp_evaluation_prompt_sets_version_check", sql`length(btrim(${promptSet.version})) between 1 and 80`),
    check("public_mvp_evaluation_prompt_sets_rubric_version_check", sql`length(btrim(${promptSet.rubricVersion})) between 1 and 80`),
  ],
);

export const publicMvpEvaluationRuns = pgTable(
  "public_mvp_evaluation_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => publicMvpEvaluationPromptSets.id, { onDelete: "restrict" }),
    promptSetVersion: text("prompt_set_version").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    aiGatewayModelId: text("ai_gateway_model_id").references(() => aiGatewayModels.id, { onDelete: "set null" }),
    modelVersion: text("model_version").notNull(),
    status: text("status").$type<PublicMvpEvaluationRunStatus>().notNull(),
    runMetadata: jsonb("run_metadata").$type<Record<string, unknown>>().default({}).notNull(),
    startedAt: timestamp("started_at", { mode: "date" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
  },
  (run) => [
    index("public_mvp_evaluation_runs_actor_created_idx").on(run.actorUserId, run.startedAt),
    index("public_mvp_evaluation_runs_prompt_set_idx").on(run.promptSetId),
    check("public_mvp_evaluation_runs_status_check", sql`${run.status} in ('running', 'completed', 'partial_failed', 'failed')`),
    check("public_mvp_evaluation_runs_prompt_set_version_check", sql`length(btrim(${run.promptSetVersion})) between 1 and 80`),
    check("public_mvp_evaluation_runs_model_version_check", sql`length(btrim(${run.modelVersion})) between 1 and 160`),
    check("public_mvp_evaluation_runs_metadata_object_check", sql`jsonb_typeof(${run.runMetadata}) = 'object'`),
  ],
);

export const publicMvpEvaluationResults = pgTable(
  "public_mvp_evaluation_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    runId: text("run_id")
      .notNull()
      .references(() => publicMvpEvaluationRuns.id, { onDelete: "cascade" }),
    promptSetId: text("prompt_set_id")
      .notNull()
      .references(() => publicMvpEvaluationPromptSets.id, { onDelete: "restrict" }),
    promptSetVersion: text("prompt_set_version").notNull(),
    promptType: text("prompt_type").$type<PublicMvpEvaluationPromptType>().notNull(),
    promptVersion: text("prompt_version").notNull(),
    scenarioId: text("scenario_id").$type<PublicMvpEvaluationScenarioId>().notNull(),
    scenarioVersion: text("scenario_version").notNull(),
    modelVersion: text("model_version").notNull(),
    status: text("status").$type<PublicMvpEvaluationResultStatus>().notNull(),
    answerText: text("answer_text"),
    safeErrorCode: text("safe_error_code"),
    unsupportedClaimFlag: boolean("unsupported_claim_flag").default(false).notNull(),
    missingUncertaintyFlag: boolean("missing_uncertainty_flag").default(false).notNull(),
    noBetterThanGenericFlag: boolean("no_better_than_generic_flag").default(false).notNull(),
    unsupportedCommunityWordingFlag: boolean("unsupported_community_wording_flag").default(false).notNull(),
    requiredCaveatOmittedFlag: boolean("required_caveat_omitted_flag").default(false).notNull(),
    conflictedKnowledgeExcludedFlag: boolean("conflicted_knowledge_excluded_flag").default(true).notNull(),
    staleWithdrawnSourceExposureFlag: boolean("stale_withdrawn_source_exposure_flag").default(false).notNull(),
    rawEvidenceLeakageFlag: boolean("raw_evidence_leakage_flag").default(false).notNull(),
    fallbackVerificationGuidanceMetFlag: boolean("fallback_verification_guidance_met_flag").default(true).notNull(),
    assistantMessageId: text("assistant_message_id").references(() => messages.id, { onDelete: "set null" }),
    retrievalDecisionId: text("retrieval_decision_id").references(() => assistantRetrievalDecisions.id, { onDelete: "set null" }),
    provenanceId: text("provenance_id").references(() => assistantResponseProvenance.id, { onDelete: "set null" }),
    usageEventId: text("usage_event_id").references(() => aiUsageEvents.id, { onDelete: "set null" }),
    tripAnswerContextSnapshotId: text("trip_answer_context_snapshot_id").references(() => tripAnswerContextSnapshots.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (result) => [
    uniqueIndex("public_mvp_evaluation_results_run_prompt_scenario_idx").on(result.runId, result.promptType, result.scenarioId),
    index("public_mvp_evaluation_results_prompt_type_idx").on(result.promptType, result.createdAt),
    index("public_mvp_evaluation_results_status_idx").on(result.status),
    check("public_mvp_evaluation_results_prompt_type_check", sql`${result.promptType} in ('magic_moment_family_trip', 'sparse_data', 'freshness_sensitive', 'service_activity', 'route_logistics')`),
    check("public_mvp_evaluation_results_status_check", sql`${result.status} in ('scored', 'failed', 'unscored')`),
    check("public_mvp_evaluation_results_prompt_set_version_check", sql`length(btrim(${result.promptSetVersion})) between 1 and 80`),
    check("public_mvp_evaluation_results_prompt_version_check", sql`length(btrim(${result.promptVersion})) between 1 and 80`),
    check("public_mvp_evaluation_results_scenario_id_check", sql`${result.scenarioId} in ('community_observation', 'independent_community_pattern', 'conditional_high_risk_claim', 'conflict_exclusion', 'source_withdrawal', 'web_fallback_unavailable')`),
    check("public_mvp_evaluation_results_scenario_version_check", sql`length(btrim(${result.scenarioVersion})) between 1 and 80`),
    check("public_mvp_evaluation_results_model_version_check", sql`length(btrim(${result.modelVersion})) between 1 and 160`),
    check("public_mvp_evaluation_results_answer_length_check", sql`${result.answerText} is null or length(btrim(${result.answerText})) between 1 and 12000`),
    check("public_mvp_evaluation_results_safe_error_check", sql`${result.safeErrorCode} is null or ${result.safeErrorCode} in ('evaluator_failed', 'invalid_score_payload')`),
    check("public_mvp_evaluation_results_status_shape_check", sql`(${result.status} = 'scored' and ${result.answerText} is not null and ${result.safeErrorCode} is null) or (${result.status} <> 'scored' and ${result.safeErrorCode} is not null)`),
  ],
);

export const publicMvpEvaluationResultPolicySnapshots = pgTable(
  "public_mvp_evaluation_result_policy_snapshots",
  {
    resultId: text("result_id")
      .primaryKey()
      .references(() => publicMvpEvaluationResults.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").$type<PublicMvpEvaluationScenarioId>().notNull(),
    scenarioVersion: text("scenario_version").notNull(),
    selectedKnowledge: jsonb("selected_knowledge").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    excludedCandidateCounts: jsonb("excluded_candidate_counts").$type<Record<string, number>>().default({}).notNull(),
    excludedReasonCodes: jsonb("excluded_reason_codes").$type<string[]>().default([]).notNull(),
    targetCandidateExcluded: boolean("target_candidate_excluded").default(false).notNull(),
    sourceOrEvidenceOutcome: text("source_or_evidence_outcome").notNull(),
    webFallback: jsonb("web_fallback").$type<Record<string, unknown>>().default({}).notNull(),
    finalizationOutcome: text("finalization_outcome").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (snapshot) => [
    index("public_mvp_evaluation_policy_snapshots_scenario_idx").on(snapshot.scenarioId, snapshot.createdAt),
    check("public_mvp_evaluation_policy_snapshots_scenario_id_check", sql`${snapshot.scenarioId} in ('community_observation', 'independent_community_pattern', 'conditional_high_risk_claim', 'conflict_exclusion', 'source_withdrawal', 'web_fallback_unavailable')`),
    check("public_mvp_evaluation_policy_snapshots_scenario_version_check", sql`length(btrim(${snapshot.scenarioVersion})) between 1 and 80`),
    check("public_mvp_evaluation_policy_snapshots_selected_knowledge_array_check", sql`jsonb_typeof(${snapshot.selectedKnowledge}) = 'array' and jsonb_array_length(${snapshot.selectedKnowledge}) <= 5`),
    check("public_mvp_evaluation_policy_snapshots_counts_object_check", sql`jsonb_typeof(${snapshot.excludedCandidateCounts}) = 'object' and octet_length(${snapshot.excludedCandidateCounts}::text) <= 1024`),
    check("public_mvp_evaluation_policy_snapshots_reasons_array_check", sql`jsonb_typeof(${snapshot.excludedReasonCodes}) = 'array' and jsonb_array_length(${snapshot.excludedReasonCodes}) <= 10`),
    check("public_mvp_evaluation_policy_snapshots_web_fallback_object_check", sql`jsonb_typeof(${snapshot.webFallback}) = 'object' and octet_length(${snapshot.webFallback}::text) <= 2048`),
    check("public_mvp_evaluation_policy_snapshots_source_outcome_check", sql`length(btrim(${snapshot.sourceOrEvidenceOutcome})) between 1 and 120`),
    check("public_mvp_evaluation_policy_snapshots_finalization_outcome_check", sql`length(btrim(${snapshot.finalizationOutcome})) between 1 and 120`),
  ],
);

export const publicMvpEvaluationResultScores = pgTable(
  "public_mvp_evaluation_result_scores",
  {
    resultId: text("result_id")
      .notNull()
      .references(() => publicMvpEvaluationResults.id, { onDelete: "cascade" }),
    dimension: text("dimension").$type<PublicMvpEvaluationScoreDimension>().notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (score) => [
    primaryKey({ columns: [score.resultId, score.dimension] }),
    check("public_mvp_evaluation_result_scores_dimension_check", sql`${score.dimension} in ('user_context_use', 'practical_specificity', 'source_grounding', 'uncertainty_handling', 'family_awareness', 'vietnamese_clarity')`),
    check("public_mvp_evaluation_result_scores_bounds_check", sql`${score.score} between 1 and 10`),
  ],
);

export const schema = {
  users,
  accounts,
  sessions,
  verificationTokens,
  userRoles,
  auditEvents,
  sources,
  sourceCaptureVersions,
  rawSourceMaterial,
  facebookCaptureReviews,
  knowledgeExtractionJobs,
  knowledgeIngestionJobs,
  knowledgeCards,
  knowledgeCardSources,
  knowledgeCardEvidence,
  knowledgeCardSearchDocuments,
  knowledgeSamplingPolicies,
  knowledgeSamplingCohortMembers,
  knowledgeSamplingCandidateLedger,
  knowledgeVerifyFirstSamplingObligations,
  knowledgeRecommendations,
  knowledgeIndexDirtyMarkers,
  knowledgeIndexBackfillState,
  knowledgeSourceSuggestions,
  knowledgeSeedBatches,
  knowledgeSeedBatchItems,
  referralCodes,
  referralAttributions,
  tripProjects,
  tripProjectConstraints,
  tripPlanItems,
  tripChangeProposals,
  tripPlanChangeHistory,
  conversations,
  messages,
  messageImageAttachments,
  chatContext,
  aiGatewayModels,
  aiUsageEvents,
  webSearchResults,
  assistantRetrievalDecisions,
  assistantResponseProvenance,
  assistantProvenanceWithdrawalBackfillState,
  answerUsefulnessFeedback,
  publicMvpEvaluationPromptSets,
  publicMvpEvaluationRuns,
  publicMvpEvaluationResults,
  publicMvpEvaluationResultPolicySnapshots,
  publicMvpEvaluationResultScores,
};
