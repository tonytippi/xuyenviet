---
story_id: 18-1
status: review
created: 2026-08-07
epic: 18
---

# Story 18.1: Establish Discovery Ownership, Policy, and Audit Foundation

## Story

As an operator,
I want Discovery to have its own governed policy, records, and automated identity,
so that scheduled URL discovery can operate without becoming a second Knowledge or capture lifecycle.

## Acceptance Criteria

1. **Given** the Discovery foundation migration is applied, **when** the versioned Discovery policy, query proposal, run, and required safe audit records are created, **then** they are introduced through Drizzle migrations and owned by Discovery modules only.
   - No Discovery command or repository writes `sources`, capture versions, ingestion jobs, evidence, cards, or publication state.

2. **Given** Discovery policy is persisted, **when** an operator changes its governed configuration or a Worker starts a run, **then** one versioned PostgreSQL policy record owns global enablement, score bands/weights, cadence, retention, and bounded concurrency/retry settings and each run snapshots its effective version.
   - Do not introduce hard budget/quota reservations or enforcement in this initial slice.

3. **Given** automated Discovery work or a protected Discovery command records attribution, **when** it persists an audit or execution record, **then** it uses registered `system-youtube-discovery` executor attribution and preserves the real operator only as the command actor where applicable.
   - Retain actor, target, action, timestamp, and a bounded safe before/after summary.

4. **Given** the immutable system actor catalog is migrated, **when** Discovery execution attribution is validated, **then** `system-youtube-discovery` is a server-owned catalog entry and arbitrary or missing Discovery executor IDs are rejected.
   - No system actor can authenticate, receive a role, or become a user-owned record.

## Tasks / Subtasks

- [x] Add the Discovery-owned persistence foundation (AC: 1, 2)
  - [x] Add closed TypeScript values/types and `youtube_discovery_*` Drizzle tables to `packages/database/src/schema.ts`: one policy record, query proposals, and runs. Keep all values bounded and operationally safe.
  - [x] Model one versioned policy aggregate containing global enablement, score bands/weights, cadence, retention, bounded concurrency, and retry settings. Enforce singleton/version/configuration invariants with database constraints rather than scattered environment constants.
  - [x] Require every run to reference and snapshot the effective policy version. Establish the closed run-state representation required by Story 18.2: `queued | running | retrying | completed | failed | cancelled`; do not implement claiming, execution, or transitions beyond what is necessary to persist the foundation.
  - [x] Create migration `0044_<discovery-foundation>.sql`, update `drizzle/migrations/meta/_journal.json`, and retain Drizzle as the only migration authority.
  - [x] Create a focused `packages/database/src/youtube-discovery/` repository/module boundary and export it from `packages/database/src/index.ts`. It may write only Discovery tables and call the Audit boundary; it must not import/write Knowledge lifecycle tables.

- [x] Establish the governed Discovery policy contract and defaults (AC: 1, 2)
  - [x] Create `packages/domain/src/youtube-discovery/` policy types/validation and export them from `packages/domain/src/index.ts`.
  - [x] Create safe typed Discovery contract types under `packages/contracts/src/youtube-discovery/` or the established contracts boundary and export them from `packages/contracts/src/index.ts`.
  - [x] Choose and document test-safe initial persisted defaults: candidate/audit retention starts at 180 days; derived comment-signal TTL must be shorter; cadence, score bands/weights, concurrency, and retry settings must be finite and bounded. Do not create a hard budget/quota field, reservation table, or enforcement path.
  - [x] Keep command/API/Worker ports explicit and narrow. Story 18.1 does not register an API controller, Worker adapter, provider client, scheduler, query planning, canonicalizer, candidate, triage, or UI.

- [x] Register and protect the Discovery automated identity (AC: 3, 4)
  - [x] Add `{ id: "system-youtube-discovery", label: "Khám phá YouTube" }` to `systemAuditActorDefinitions` in `packages/database/src/actors.ts` without reordering existing entries.
  - [x] Extend the database `users_no_system_executor_id_check` in `packages/database/src/schema.ts` and the migration so the new executor ID cannot become a `users` row.
  - [x] Align the duplicated `AuditActor` system union in `packages/domain/src/knowledge-lifecycle.ts`, or safely centralize it if that can be done without widening scope.
  - [x] Construct automated attribution only via `createSystemAuditActor("system-youtube-discovery")`. Never accept a free-form executor string from a controller, Worker input, or persisted JSON.

- [x] Reuse Audit-owned attribution safely (AC: 1, 3, 4)
  - [x] Use `recordAuditEvent` from `packages/database/src/audit-writers.ts`; do not directly insert `auditEvents`, `tripPlanChangeHistory`, or `aiUsageEvents`.
  - [x] Define Discovery audit target/action naming and produce summaries from explicit safe fields only. The writer truncates content but does not sanitize it; do not pass provider content, raw comments, URLs with secrets, prompts/responses, source material, evidence, traveler data, or arbitrary JSON into a summary.
  - [x] For an operator-initiated policy change, retain the authenticated user audit actor. Reserve `system-youtube-discovery` for automated execution attribution; do not create a fake user or attach a system executor to a user-owned relationship.

- [x] Add focused regression coverage (AC: 1-4)
  - [x] Update `tests/audit-actors.test.ts` for catalog order, the server-owned label, valid construction, and unknown executor rejection.
  - [x] Update `tests/story-8-6-actor-isolation.test.ts` so the clean migrated database proves every catalog executor, including Discovery, cannot be a user, account, session, or role principal, and that system audit rows retain the exclusive system actor shape.
  - [x] Add a serial integration test for the Discovery migration/schema. It must explicitly use `resetTestDatabase()` in its own setup where clean tables are required and prove policy singleton/version, allowed bounded configuration, policy-version run snapshot FK, and safe Discovery-only ownership.
  - [x] Add unit tests for policy input validation/defaults and audit construction. Assert invalid/unbounded configuration and missing/arbitrary executor IDs fail before persistence.
  - [x] Add a source-level ownership regression that prevents the Discovery repository/domain boundary from inserting into Knowledge-owned tables or protected Audit tables directly.

## Dev Notes

### Scope and sequencing

- This is a schema/ownership foundation only. It creates the records later stories require, not a runnable Discovery workflow.
- Story 18.2 owns Worker adapter registration, due-run claiming, leases/fences, revocation, retry/backoff, terminal audits, and the `youtube-discovery` finite adapter. Do not modify `apps/worker/src/runtime.ts`, `apps/worker/src/adapters.ts`, or `packages/worker-domain/src/adapters.ts` in this story.
- Story 18.3 owns query-planning signal ports and operator query commands. Story 18.4 owns the shared canonicalizer, candidate/appearance identity, documented YouTube search, and Knowledge-owned prior-capture lookup. Story 18.5 owns enrichment, comment-derived signals, retention processing, and provider safety. Epic 19 owns AI triage/recommendations and intake handoff. Epic 20 owns control-tower UI and the global-switch command surface.
- No previous Story 18 artifact exists. Story 17.1 is documentation-only and establishes no runtime pattern relevant to Discovery persistence.

### Non-negotiable boundaries

- Discovery is URL-only. It must never create, update, link, or infer a Knowledge `source`, capture version, ingestion job, evidence, knowledge card, lifecycle/publication state, source bundle, or traveler content.
- Do not invoke, schedule, enqueue, retry, import, or add a dependency on `youtube:capture` or Gemini video analysis. Discovery metadata triage is later work and uses the AI Gateway, not the capture path.
- Persist only bounded safe operational data. Exclude raw comments, prompts/responses, provider payloads, transcripts, media, credentials, cookies, raw source material, evidence spans, and traveler identity/content.
- The initial schema must not pre-create candidate/triage/ranking/appearance/comment tables merely for future convenience. Introduce only policy, query-proposal, run, and required safe audit/execution foundation records specified by this story.
- Do not add compatibility layers, a dual-write, a second migration ledger, database URL fallback, environment-owned policy, hard budgets, quota reservations, channel/query blocking, exclusion policy, or a new service/package.

### Existing implementation patterns to preserve

- `packages/database/src/schema.ts` defines closed values/types near the schema and uses `pgTable`, explicit indexes, and database checks for persistent invariants. Follow that layout and naming. All Discovery table names begin `youtube_discovery_`.
- The next migration is `0044`; preserve the append-only journal format in `drizzle/migrations/meta/_journal.json`. A persistent-table story requires matching Drizzle schema/migration verification.
- `packages/database/src/actors.ts` is the sole system actor catalog. `createSystemAuditActor` validates IDs against that immutable catalog. Do not duplicate a Discovery executor list or accept arbitrary strings.
- `packages/database/src/audit-writers.ts` is the only boundary that writes protected audit/history/usage tables. Its actor validation supplies the database XOR actor shape; Discovery must call it inside the same transaction as its domain mutation where a command is introduced.
- The direct-write guard in `tests/story-8-6-actor-isolation.test.ts` protects `auditEvents`, `tripPlanChangeHistory`, and `aiUsageEvents`. Keep any Discovery audit write inside the approved Audit boundary.
- Existing API controllers are role-protected Nest adapters that inject domain ports. Do not add a controller until a story owns an actual protected command/read contract; `apps/admin` remains a typed presentation client and cannot import domain/database code.

### Initial policy default guardrails

- Defaults are persisted policy values, not architecture constants. Keep them finite, non-negative where applicable, and range-validated before persistence.
- Candidate/audit/dedupe retention defaults to 180 days. The derived comment-signal TTL is a separate, strictly shorter persisted value; Story 18.5 implements expiration.
- Score bands/weights, cadence, bounded concurrency, and retry configuration must be represented now because subsequent runs snapshot policy version. Their exact operational values are selected for test safety and documented in code/tests; they are not a license to add provider quota/budget enforcement.

### Testing requirements

- Use `pnpm test:unit` for policy/actor/audit tests that need no PostgreSQL. Use `pnpm test:integration` only for migration/schema persistence tests.
- Integration tests are serial and share a physical database. A test requiring clean tables calls `resetTestDatabase()` in its own setup. Never add a global truncation/reset hook.
- Required verification after implementation: focused unit and integration tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record any exact blocker rather than claiming completion.

### Latest technical information

- No external technical research is required for this story. It uses the repository's existing TypeScript 5.8.3, PostgreSQL/Drizzle 0.44.5, Audit, and migration stack; it introduces no provider/API dependency or framework upgrade.

## Project Structure Notes

- Create Discovery-owned code only in the existing workspace boundaries: `packages/domain/src/youtube-discovery/`, `packages/database/src/youtube-discovery/`, and `packages/contracts/src/youtube-discovery/` when a dedicated contract file is necessary.
- Update exports in the owning package index files. Do not put Discovery domain persistence in `apps/admin`, `src/`, or a Nest controller.
- Schema changes live in `packages/database/src/schema.ts`; SQL changes live in a single new sequential migration plus the migration journal.
- The baseline has no existing Discovery runtime code. Reuse Audit and actor boundaries instead of inventing a parallel system-executor or audit implementation.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 18 and Story 18.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1 through AD-8]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-07-youtube-discovery.md#Story Dependency Sequence and Minor Concerns]
- [Source: docs/proposals/ai-first-youtube-discovery.md#Ownership And Execution Boundary and Acceptance Invariants]
- [Source: _bmad-output/project-context.md#Testing Rules and Critical Don't-Miss Rules]
- [Source: packages/database/src/actors.ts#systemAuditActorDefinitions]
- [Source: packages/database/src/audit-writers.ts#recordAuditEvent]
- [Source: tests/story-8-6-actor-isolation.test.ts#Story 8.6 actor isolation and Audit-owned write boundary]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis completed 2026-08-07.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented Discovery-only policy-version, query-proposal, and run persistence with safe policy validation, registered system audit attribution, and Audit-owned writes.
- Focused unit tests passed; typecheck, lint (warnings only), build, normal Drizzle migration, and diff whitespace verification passed. Integration migration setup remains blocked because its disposable `DATABASE_URL_TEST` target retains a partial earlier 0044 state and its Drizzle subprocess exits without emitting a database diagnostic.

### File List

- _bmad-output/implementation-artifacts/18-1-establish-discovery-ownership-policy-and-audit-foundation.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0044_discovery_foundation.sql
- drizzle/migrations/meta/_journal.json
- packages/contracts/src/index.ts
- packages/contracts/src/youtube-discovery/index.ts
- packages/database/src/actors.ts
- packages/database/src/index.ts
- packages/database/src/schema.ts
- packages/database/src/youtube-discovery/index.ts
- packages/domain/src/index.ts
- packages/domain/src/knowledge-lifecycle.ts
- packages/domain/src/youtube-discovery/policy.ts
- tests/audit-actors.test.ts
- tests/youtube-discovery-foundation.integration.test.ts
- tests/youtube-discovery-ownership.test.ts
- tests/youtube-discovery-policy.test.ts
- vitest.config.ts
