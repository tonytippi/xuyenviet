import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleValues = ["traveler", "operator", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const auditOperationValues = ["access_check", "create", "update", "delete", "archive", "approve"] as const;
export type AuditOperation = (typeof auditOperationValues)[number];

export const messageRoleValues = ["user", "assistant"] as const;
export type MessageRole = (typeof messageRoleValues)[number];

export const aiUsageStatusValues = ["success", "failure"] as const;
export type AiUsageStatus = (typeof aiUsageStatusValues)[number];

export const aiGatewayModelPurposeValues = ["ai_ask_initial_answer", "extraction", "embeddings", "evaluation"] as const;
export type AiGatewayModelPurpose = (typeof aiGatewayModelPurposeValues)[number];

export const sourceKindValues = ["url", "facebook", "copied_post", "pasted_text", "screenshot"] as const;
export type SourceKind = (typeof sourceKindValues)[number];

export const sourceTypeValues = ["curated", "community"] as const;
export type SourceType = (typeof sourceTypeValues)[number];

export const sourceVerificationStatusValues = ["unverified", "verified"] as const;
export type SourceVerificationStatus = (typeof sourceVerificationStatusValues)[number];

export const knowledgeCardStatusValues = ["draft", "approved", "archived", "rejected", "duplicate", "no_action"] as const;
export type KnowledgeCardStatus = (typeof knowledgeCardStatusValues)[number];

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

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

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
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorEmail: text("actor_email").notNull(),
    operation: text("operation").$type<AuditOperation>().notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    beforeSummary: text("before_summary"),
    afterSummary: text("after_summary"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (auditEvent) => [
    index("audit_events_actor_user_id_idx").on(auditEvent.actorUserId),
    index("audit_events_target_idx").on(auditEvent.targetType, auditEvent.targetId),
    index("audit_events_created_at_idx").on(auditEvent.createdAt),
    check(
      "audit_events_operation_check",
      sql`${auditEvent.operation} in ('access_check', 'create', 'update', 'delete', 'archive', 'approve')`,
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
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (source) => [
    index("sources_kind_created_at_idx").on(source.kind, source.createdAt),
    index("sources_canonical_url_idx").on(source.canonicalUrl),
    index("sources_submitted_by_user_id_idx").on(source.submittedByUserId),
    check("sources_kind_check", sql`${source.kind} in ('url', 'facebook', 'copied_post', 'pasted_text', 'screenshot')`),
    check("sources_source_type_check", sql`${source.sourceType} in ('curated', 'community')`),
    check("sources_verification_status_check", sql`${source.verificationStatus} in ('unverified', 'verified')`),
    check("sources_label_safe_metadata_check", sql`length(btrim(${source.label})) between 1 and 200 and position(chr(10) in ${source.label}) = 0 and position(chr(13) in ${source.label}) = 0`),
    check("sources_publisher_safe_metadata_check", sql`${source.publisher} is null or (length(btrim(${source.publisher})) between 1 and 160 and position(chr(10) in ${source.publisher}) = 0 and position(chr(13) in ${source.publisher}) = 0)`),
    check("sources_collected_date_valid_check", sql`${source.collectedDate} is null or (${source.collectedDate} ~ '^\\d{4}-\\d{2}-\\d{2}$' and to_char(to_date(${source.collectedDate}, 'YYYY-MM-DD'), 'YYYY-MM-DD') = ${source.collectedDate})`),
    check("sources_url_kind_check", sql`${source.kind} not in ('url', 'facebook') or ${source.url} is not null`),
    check("sources_no_url_for_textual_kind_check", sql`${source.kind} not in ('copied_post', 'pasted_text', 'screenshot') or ${source.url} is null`),
    check("sources_community_defaults_check", sql`${source.sourceType} <> 'community' or (${source.verificationStatus} = 'unverified' and ${source.official} = false and ${source.partner} = false)`),
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
    check("raw_source_material_text_length_check", sql`${material.rawText} is null or (length(btrim(${material.rawText})) > 0 and char_length(${material.rawText}) <= 20000)`),
    check("raw_source_material_file_name_check", sql`${material.fileName} is null or length(btrim(${material.fileName})) > 0`),
    check("raw_source_material_mime_type_check", sql`${material.mimeType} is null or ${material.mimeType} in ('image/jpeg', 'image/png', 'image/webp')`),
    check("raw_source_material_byte_size_check", sql`${material.byteSize} is null or (${material.byteSize} > 0 and ${material.byteSize} <= 5242880)`),
    check(
      "raw_source_material_file_metadata_complete_check",
      sql`(${material.fileName} is null and ${material.mimeType} is null and ${material.byteSize} is null) or (${material.fileName} is not null and ${material.mimeType} is not null and ${material.byteSize} is not null)`,
    ),
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
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (tripProject) => [
    uniqueIndex("trip_projects_id_user_id_idx").on(tripProject.id, tripProject.userId),
    index("trip_projects_user_id_updated_at_idx").on(tripProject.userId, tripProject.updatedAt),
    check("trip_projects_title_not_empty_check", sql`length(btrim(${tripProject.title})) > 0`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tripProjectId: text("trip_project_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (conversation) => [
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
    index("messages_conversation_id_created_at_idx").on(message.conversationId, message.createdAt),
    index("messages_user_id_created_at_idx").on(message.userId, message.createdAt),
    check("messages_role_check", sql`${message.role} in ('user', 'assistant')`),
    check("messages_content_not_empty_check", sql`length(btrim(${message.content})) > 0`),
    check("messages_user_content_length_check", sql`${message.role} <> 'user' or char_length(${message.content}) <= 2000`),
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
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (card) => [
    index("knowledge_cards_status_created_at_idx").on(card.status, card.createdAt),
    index("knowledge_cards_type_status_idx").on(card.type, card.status),
    index("knowledge_cards_confidence_idx").on(card.confidence),
    index("knowledge_cards_created_by_user_id_idx").on(card.createdByUserId),
    check("knowledge_cards_status_check", sql`${card.status} in ('draft', 'approved', 'archived', 'rejected', 'duplicate', 'no_action')`),
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
    check("knowledge_cards_draft_review_check", sql`${card.status} <> 'draft' or ${card.needsReview} = true`),
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

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    userMessageId: text("user_message_id").references(() => messages.id, { onDelete: "set null" }),
    assistantMessageId: text("assistant_message_id").references(() => messages.id, { onDelete: "set null" }),
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
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (aiUsageEvent) => [
    index("ai_usage_events_user_id_created_at_idx").on(aiUsageEvent.userId, aiUsageEvent.createdAt),
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
  rawSourceMaterial,
  knowledgeCards,
  knowledgeCardSources,
  referralCodes,
  referralAttributions,
  tripProjects,
  conversations,
  messages,
  messageImageAttachments,
  chatContext,
  aiGatewayModels,
  aiUsageEvents,
};
