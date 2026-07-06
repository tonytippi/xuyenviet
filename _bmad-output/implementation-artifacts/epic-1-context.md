# Epic 1 Context: Public Sign-In And App Foundation

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 establishes the public web app foundation for XuyenViet: travelers can reach the app, sign in with Google without an email allowlist, access AI Ask only after authentication, and arrive through referral links without any reward UI. It also creates the baseline protected-operations foundation for the MVP: role-checked admin access, server-side audited mutations, PostgreSQL-backed auth/session data, environment separation, and production safety expectations so later AI Ask, chat/trip, knowledge, retrieval, usage, and referral work can build on consistent app and data boundaries.

## Stories

- Story 1.1: Initialize Public MVP Web App Foundation
- Story 1.2: Public Sign-In Entry And AI Ask Gate
- Story 1.3: Google Login With Auth.js
- Story 1.4: Roles And Separate Admin Area
- Story 1.5: Audit Trail For Protected Mutations
- Story 1.6: Environment And Public Launch Safety Baseline
- Story 1.7: Capture Referral Attribution At Sign-Up

## Requirements & Constraints

Travelers must be able to access the public entry point without an email allowlist. Google Login is required before AI Ask can load or submit a question, and unauthenticated AI Ask attempts must not create conversations, chat/trip context, retrieval work, or AI provider calls.

Google sign-in must identify users for future chat/trip ownership and protected personalization. OAuth failures must fail safely without exposing secrets or provider diagnostics. Sign-out must clear the active session.

The admin/operator area must be separate from traveler chat. Normal travelers must not see admin navigation and must be denied server-side if they attempt admin routes. At least one admin/operator account must be supportable initially, with a role model that can expand to multiple operators later without redesigning protected workflows.

Protected mutations must run server-side only and record audit context with actor, target, operation, timestamp, and relevant before/after summary where appropriate. Authorization failures must not mutate protected state or leak sensitive data.

Referral attribution is capture-only in MVP. A valid referral link may be preserved through sign-in and linked to the new user server-side, including referral code and referrer when resolvable. Invalid or missing referral codes must not block sign-in. The first attribution is preserved unless a later explicit admin correction feature exists. No reward, credit, payout, ranking, balance, affiliate, or conversion behavior or UI belongs in this epic.

Environment handling must keep dev, staging, and production databases, secrets, OAuth config, and provider keys separate. Local bypasses must not become production defaults. Production readiness documentation must cover separate DB/secrets, OAuth config, admin roles, provider privacy settings, and PostgreSQL backup/restore expectations before public onboarding.

## Technical Decisions

The MVP is a root-level Next.js App Router TypeScript modular monolith. UI, route handlers, server actions, admin, chat gates, and foundation operations live in one application, with feature modules separated by server-side boundaries rather than services or an `apps/web` workspace.

PostgreSQL is the owned data plane for users, accounts, sessions, roles, referral codes, referral attributions, audit events, and later product/retrieval entities. Drizzle owns schema definitions, migrations, and typed data access; all persistent tables and indexes must be introduced through migrations.

Auth uses Auth.js Google OAuth with PostgreSQL-backed users, sessions, and accounts. Public entry and sign-in routes can be unauthenticated, but AI Ask routes/actions require an authenticated session. Admin/operator routes/actions require both authenticated session and server-side role validation.

Feature ownership boundaries are explicit. Auth owns identity/session integration; Referrals owns referral codes and attributions; Audit owns append-only audit events; Admin gates operator access; other modules must not perform generic cross-module upserts or deletes for aggregates they do not own.

Audit events are append-only protected-operation records. Referral attribution records are not a ledger and must not imply rewards or financial liability. Usage tracking is separate from referral attribution and answer provenance; Epic 1 only needs foundation boundaries relevant to auth/referral/admin/audit.

Deployment should stay serverless-friendly and provider-adapted. Provider-specific capabilities must remain behind configuration or adapters until final deployment/database provider choices are confirmed.

## UX & Interaction Patterns

The public entry page should explain the Vietnam road-trip assistant value in one screen and present Google sign-in as the primary path to AI Ask. If a `ref` parameter exists, preserve it silently through auth; do not show reward, credit, ranking, or payout UI.

Unauthenticated protected routes should redirect or show a gate before loading protected data. The gate copy should be Vietnamese-first and calm, such as `Đăng nhập để hỏi AI.` Auth failure states need a safe retry path without secret/provider details.

Traveler and admin surfaces must be visually and navigationally separate. Admin no-role state is denied server-side and normal travelers should not see admin navigation.

Use the established responsive web shell: desktop left navigation, central content, optional right panel; mobile top bar plus sheet navigation. Google sign-in primary actions should follow the Route Green primary button treatment. Warning red is reserved for access denial, destructive confirmation, and failure states.

Accessibility baseline applies to foundation surfaces: WCAG 2.2 AA target, keyboard-reachable controls, readable Vietnamese diacritics, 44px mobile touch targets, safe focus order, and recovery-oriented error messages.

## Cross-Story Dependencies

Story 1.1 must establish the app, database, migration, module, and server-side utility foundation before auth, roles, audit, and referral work can rely on shared conventions.

Story 1.2 depends on the public app shell and defines the protected AI Ask gate that Epic 2 reuses. Story 1.3 supplies the real Google-backed session resolution required by Story 1.2, admin role checks, and future user-owned chat/trip work.

Story 1.4 depends on authenticated users and roles. Story 1.5 depends on role/session-aware protected mutation entrypoints and provides the shared audit pattern future knowledge, chat/trip, deletion, and admin mutations must use.

Story 1.7 depends on the sign-in flow and referral-code source of truth. Its output becomes foundational data for future growth/referral features but must remain isolated from any rewards or monetization behavior.

Story 1.6 constrains all Epic 1 work: production defaults, secrets, OAuth settings, admin access, and provider privacy assumptions must not be implemented as local-only shortcuts.
