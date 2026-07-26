---
title: 'Admin User Usage Metrics'
type: 'feature'
created: '2026-07-26'
status: 'done'
review_loop_iteration: 0
baseline_commit: '6881933'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Administrators can manage users and roles but cannot see each user's accumulated AI usage. This makes it difficult to understand request volume and input/output token consumption from the existing usage ledger.

**Approach:** Extend the exact-admin user roster to show each visible user's total persisted AI usage-event count, input tokens, and output tokens. Use the existing `ai_usage_events` ledger without adding schema, migration, quota, billing, or user-facing changes.

## Boundaries & Constraints

**Always:** Keep the existing exact-admin authorization before any roster or usage read; aggregate only the paginated roster users; count every persisted AI usage event regardless of `success` or `failure`; use `promptTokens` as input tokens and `completionTokens` as output tokens; preserve aggregate precision as decimal strings; treat null token values and users with no events as zero; preserve safe roster fields and Vietnamese-first responsive admin styling; include tests for aggregate semantics and zero defaults.

**Ask First:** Adding configurable user limits, enforcement/denial logic, credits, quotas, billing/cost displays, reset controls, date-range filtering, usage exports, or exposing usage information to operators or travelers.

**Never:** Change AI usage event persistence semantics; add a schema migration or a full-table pre-pagination usage aggregate; expose prompts, answers, provider request IDs, raw provider payloads, credentials, or unrelated user records; count only successful requests while labeling the result as total requests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| View roster usage | Exact admin opens a page of users | Each user shows total event requests, input tokens, and output tokens from their persisted events | Existing roster auth denial applies before data is read |
| Failed AI event | A user has a failure event, with or without token values | Its event contributes one request; available input/output tokens contribute to the matching totals | Null token fields contribute zero |
| No usage | A visible user has no usage rows | User shows zero requests, zero input tokens, and zero output tokens | No null or blank metric is rendered |
| Search/page scope | Search or pagination limits the roster | Usage aggregation is limited to the currently rendered user IDs | No usage rows for off-page users are queried or displayed |
| Operator/traveler/anonymous | A non-exact-admin requests the roster | No roster or usage metrics are returned | Existing `AdminAuthorizationError` occurs before query side effects |

</frozen-after-approval>

## Code Map

- `src/features/admin/users.ts` -- server-only exact-admin roster query; add bounded per-page AI usage aggregates.
- `src/app/admin/users/page.tsx` -- roster presentation; render localized request, input-token, and output-token metrics.
- `src/db/schema.ts` -- defines `aiUsageEvents`, including `userId`, `promptTokens`, and `completionTokens`; no schema change planned.
- `tests/admin-user-management.test.ts` -- database-backed exact-admin roster tests; add usage aggregation coverage.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/admin/users.ts` -- extend the safe roster item model and query per-page `aiUsageEvents` grouped by user ID, defaulting missing aggregates to zero.
- [x] `src/app/admin/users/page.tsx` -- display request, input-token, and output-token totals for every roster user with Vietnamese labels and locale-formatted counts.
- [x] `tests/admin-user-management.test.ts` -- seed successful, failed, nullable-token, and unrelated-user events and verify totals, zero defaults, pagination/search scope, and existing authorization boundaries.

**Acceptance Criteria:**
- Given an exact administrator viewing `/admin/users`, when a user has persisted usage events, then the roster shows the count of all events plus the sums of their prompt and completion tokens.
- Given a visible user with no events or nullable token fields, when the roster renders, then each missing metric is displayed as zero.
- Given an event with `status: "failure"`, when the roster aggregates usage, then it is included in request count and any available token totals.
- Given a search or page of users, when the roster aggregates usage, then only the currently selected page's user IDs participate in the aggregate query.
- Given an operator, traveler, or anonymous caller, when they request the roster, then existing exact-admin denial prevents any user usage data from being returned.

## Design Notes

`ai_usage_events` already represents persisted usage attempts across providers. Counting all statuses preserves the ledger's operational meaning and captures aborted/failing calls that may have consumed tokens. The aggregation remains separate from roster pagination so the existing user query stays stable and the usage query is bounded to 25 IDs.

## Verification

**Commands:**
- `pnpm test:run -- tests/admin-user-management.test.ts` -- expected: safe roster, role management, and usage metrics tests pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.

## Suggested Review Order

**Safe Lifetime Aggregation**

- Exact-admin roster aggregates only the IDs selected for the current page.
  [`users.ts:34`](../../../src/features/admin/users.ts#L34)

- PostgreSQL aggregates are serialized as decimal strings to preserve lifetime total precision.
  [`users.ts:58`](../../../src/features/admin/users.ts#L58)

**Admin Presentation**

- Vietnamese, responsive metric cards format exact values without JavaScript number conversion.
  [`page.tsx:54`](../../../src/app/admin/users/page.tsx#L54)

**Verification**

- Covers successful, failed, nullable-token, out-of-scope, and zero-usage lifetime totals.
  [`admin-user-management.test.ts:58`](../../../tests/admin-user-management.test.ts#L58)
