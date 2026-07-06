import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const userRoleValues = ["traveler", "operator", "admin"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const auditOperationValues = ["access_check", "create", "update", "delete", "archive", "approve"] as const;
export type AuditOperation = (typeof auditOperationValues)[number];

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

export const schema = {
  users,
  accounts,
  sessions,
  verificationTokens,
  userRoles,
  auditEvents,
  referralCodes,
  referralAttributions,
};
