import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleValues = ["traveler", "operator", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const auditOperationValues = ["access_check", "create", "update", "delete", "archive", "approve"] as const;
export type AuditOperation = (typeof auditOperationValues)[number];

export const messageRoleValues = ["user", "assistant"] as const;
export type MessageRole = (typeof messageRoleValues)[number];

export const aiUsageStatusValues = ["success", "failure"] as const;
export type AiUsageStatus = (typeof aiUsageStatusValues)[number];

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

export const conversations = pgTable(
  "conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (conversation) => [
    uniqueIndex("conversations_id_user_id_idx").on(conversation.id, conversation.userId),
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
    index("messages_conversation_id_created_at_idx").on(message.conversationId, message.createdAt),
    index("messages_user_id_created_at_idx").on(message.userId, message.createdAt),
    check("messages_role_check", sql`${message.role} in ('user', 'assistant')`),
    check("messages_content_not_empty_check", sql`length(btrim(${message.content})) > 0`),
    check("messages_user_content_length_check", sql`${message.role} <> 'user' or char_length(${message.content}) <= 2000`),
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
    promptVersion: text("prompt_version").notNull(),
    status: text("status").$type<AiUsageStatus>().notNull(),
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (aiUsageEvent) => [
    index("ai_usage_events_user_id_created_at_idx").on(aiUsageEvent.userId, aiUsageEvent.createdAt),
    index("ai_usage_events_conversation_id_idx").on(aiUsageEvent.conversationId),
    index("ai_usage_events_status_idx").on(aiUsageEvent.status),
    check("ai_usage_events_status_check", sql`${aiUsageEvent.status} in ('success', 'failure')`),
    check("ai_usage_events_latency_non_negative_check", sql`${aiUsageEvent.latencyMs} is null or ${aiUsageEvent.latencyMs} >= 0`),
    check("ai_usage_events_prompt_tokens_non_negative_check", sql`${aiUsageEvent.promptTokens} is null or ${aiUsageEvent.promptTokens} >= 0`),
    check(
      "ai_usage_events_completion_tokens_non_negative_check",
      sql`${aiUsageEvent.completionTokens} is null or ${aiUsageEvent.completionTokens} >= 0`,
    ),
    check("ai_usage_events_total_tokens_non_negative_check", sql`${aiUsageEvent.totalTokens} is null or ${aiUsageEvent.totalTokens} >= 0`),
  ],
);

export const schema = {
  users,
  accounts,
  sessions,
  verificationTokens,
  userRoles,
  auditEvents,
  referralCodes,
  referralAttributions,
  conversations,
  messages,
  aiUsageEvents,
};
