---
baseline_commit: a95aeb7
---

# Story 8.4: Attribute Trip Proposal Expiry Through the Audit Boundary

Status: review

## Story

As a Trip Project owner,
I want automatically expired proposals to show their actual system actor,
so that history distinguishes autonomous expiry from actions performed by people.

## Acceptance Criteria

1. **System-attributed, idempotent expiry**
   - Given a pending Trip Change Proposal passes its expiry time,
   - When a Trip Home/proposal read, application attempt, or scheduled worker invokes `expireTripChangeProposal(...)`,
   - Then the idempotent fenced transaction writes exactly one safe terminal history row and one audit event through Audit-owned helpers with `system-trip-planning` as the actor.
   - And expiry never mutates plan state or impersonates the project owner, requester, or authenticated session.

2. **Human-attributed apply/dismiss through the same boundary**
   - Given an owner applies or dismisses a proposal,
   - When Chat/Trips records change history,
   - Then it uses the same typed `AuditActor` persistence boundary with the real owner actor.
   - And a direct insert into `trip_plan_change_history` from Chat/Trips is unavailable or rejected by enforcement.

## Tasks / Subtasks

- [x] Route all proposal terminal history through Audit (AC: 1, 2)
  - [x] In `src/features/chat-trips/trip-change-proposals.ts`, replace the direct `transaction.insert(tripPlanChangeHistory)` in `expireTripChangeProposalInTransaction` with `recordPlanHistory(..., transaction)`. Preserve the current owner/project/proposal IDs and bounded safe payloads; the feature module supplies those domain values, while Audit derives all actor columns.
  - [x] Use the existing cataloged `systemTripPlanningActor` / exported `tripPlanningSystemActor` created by `createSystemAuditActor("system-trip-planning")` for both expiry history and `recordAuditEvent(..., transaction)`. Remove the legacy fake-user `UserAuditActor` constants/import use from the runtime expiry path.
  - [x] Keep `dismissTripChangeProposal` and `applyApprovedTripChange` on `recordPlanHistory` with `toUserAuditActor({ userId: session.userId, email: session.email })`; do not change their owner authorization, plan-application, or safe-summary behavior.
   - [x] Remove every Chat/Trips direct write to `tripPlanChangeHistory`; reads of that table remain valid. Add a focused source-level convention regression that fails if `src/features/chat-trips/` again calls `insert(tripPlanChangeHistory)` rather than the Audit writer. This scoped test is the AC 2 enforcement for Chat/Trips; do not introduce a broader module boundary, database permission model, or schema change in this story.

- [x] Preserve and complete terminal expiry semantics (AC: 1)
  - [x] Retain the existing `SELECT ... FOR UPDATE` proposal lock, pending-only terminal transition, current terminal-row short circuit, and single supplied transaction. The proposal update, history write, and audit write must use the same transaction; neither Audit helper may fall back to its global database default in this path.
  - [x] Ensure an application attempt that finds `expiresAt <= now` invokes `expireTripChangeProposalInTransaction(transaction, ...)` before returning its safe `expired` result. This is the authoritative Epic 8/AD-30 contract and supersedes Story 7.5's older note that application only refuses and waits for a future read. It must create no apply history/audit row and must not apply plan operations.
  - [x] Retain the existing read behavior: `listPendingProposalsForTripProject` and `getProposalForOwnerReview` best-effort expire elapsed rows without making a transient expiry failure fail the owner read. Retain the worker's error/retry distinction and sessionless operation.
  - [x] Do not weaken the expiry worker's one outer transaction, bounded batch selection, `FOR UPDATE SKIP LOCKED`, elapsed-pending predicate, or invocation of `expireTripChangeProposalInTransaction`. Do not add a worker session, fake user lookup, lease, cron registration, or a nested transaction.
   - [x] Ensure the expiry command only terminalizes a pending proposal whose configured expiry is elapsed at the command's supplied `now`; it must not permit an early/manual expiry of a future or non-expiring proposal. For a pending future or non-expiring proposal, return the unchanged current summary as a successful no-op and write no history or audit row. Preserve `not_found` for a missing proposal or wrong Trip Project without leaking existence. This sessionless system command has no caller owner identity, so do not add an inapplicable cross-owner predicate or session.

- [x] Add focused database-backed regression coverage (AC: 1, 2)
    - [x] Update `tests/trip-change-proposals.test.ts` to assert an expiry history row and audit event each persist the valid system XOR shape: `actorClass: "system"`, `actorUserId: null`, `actorEmail: null` on audit events, and `actorSystem: "system-trip-planning"`. Replace its existing application-at-expiry DB case that expects zero history rows with the terminal-expiry outcome, and update its mocked application-at-expiry case plus transaction/Audit mocks so the in-transaction command is exercised. Remove expiry test dependence on creating `system-trip-planning` in `users` where no longer needed.
    - [x] Prove repeated expiry, including concurrent read/worker or direct-command invocation, creates exactly one `expire` history row and exactly one `expire` audit row, leaves every plan item/constraint unchanged, and does not advance the Trip Project aggregate version. Cover direct expiry against a future proposal and a non-expiring proposal: both remain pending and create neither row. Prefer deterministic elapsed rows or an explicit command `now` over timing-sensitive near-future sleeps.
    - [x] Update `tests/trip-planning-safety.test.ts` for application-at-expiry: it invokes terminal expiry once, returns `expired`, writes system-attributed expire history/audit (not user apply history/audit), and applies no plan operation or aggregate-version change. Update its worker-versus-read assertion to cover the same system audit shape, and remove its obsolete `system-trip-planning` user fixture/helper. Preserve existing stale/authorization behavior for non-expired application attempts.
    - [x] Update `tests/trip-proposal-expiry-worker.test.ts` to assert worker-created history and audit rows use the system actor with null human fields, and remove fake-user fixture setup that is only needed by the old audit FK path. Preserve the real PostgreSQL concurrent-worker test rather than replacing it with a mock.
   - [x] Retain/run `tests/audit-actors.test.ts` and `tests/audit-attribution-migration.test.ts` as the canonical Audit-writer and XOR-persistence contracts. Do not duplicate their generic actor validation tests in Chat/Trips.

- [x] Verify the scoped implementation (AC: 1, 2)
   - [x] Run `pnpm test:run tests/trip-change-proposals.test.ts tests/trip-proposal-expiry-worker.test.ts tests/trip-planning-safety.test.ts tests/audit-actors.test.ts tests/audit-attribution-migration.test.ts`.
   - [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
   - [x] Do not run or modify Drizzle migrations/schema solely for this wiring change. If investigation proves a schema change is necessary, stop: the existing Story 8.2 system actor shape already supports this flow, and any new migration must respect the authorized disposable/reset-only clean-break policy.

### Review Findings

- [x] [Review][Patch] Re-evaluate proposal expiry after waiting for the apply locks [src/features/chat-trips/trip-change-proposals.ts:1333] — `now` is captured immediately after the proposal `FOR UPDATE` lock and before the expiry comparison/terminal command. A fake-clock regression advances time at lock acquisition and verifies expiry wins without plan mutation.
- [x] [Review][Patch] Make worker-versus-read expiry contention deterministic [tests/trip-planning-safety.test.ts:1277] — the test persists a valid future expiry, backdates it deterministically, and uses a fixed worker `now` after it. No sleep or wall-clock comparison remains; the concurrent worker/read paths contend on the same elapsed row and verify exactly-once system attribution.
- [x] [Review][Patch] Harden the direct-history-insert convention matcher [tests/trip-change-proposals.test.ts:1384] — the scoped guard now permits arbitrary whitespace around member access, `insert`, and the opening argument, and explicitly proves it rejects a newline-formatted direct insert.

## Dev Notes

### Required Domain Contract

- Audit owns `AuditActor`, the immutable catalog, actor validation, and public history/audit writers. Chat/Trips owns proposal authorization, terminal state, locking, and safe history content. It must call Audit rather than formulate persistence actor columns directly. [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31-Audit-And-Automated-Execution-Use-First-Class-Actors]
- A system actor is exactly `{ kind: "system", system: "system-trip-planning" }`; it has no `userId` or email. System persistence must produce `actor_class = 'system'`, a nonblank cataloged `actor_system`, and null human actor fields. The Trip Project/proposal `userId` remains real owner provenance, not execution identity. [Source: src/features/audit/actors.ts] [Source: src/features/audit/events.ts] [Source: src/features/audit/history.ts]
- `recordPlanHistory` and `recordAuditEvent` validate their `AuditActor` before inserting and accept an injected writer. Pass the existing transaction so terminal status, history, and audit effects commit or roll back together. [Source: src/features/audit/history.ts] [Source: src/features/audit/events.ts]
- The safe history payload remains bounded affected-item references plus `boundBeforeAfterSummary(deriveBeforeAfter(...))`. Never persist or render raw prompts, provider output, or free-form model response as plan state. [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.7-Trip-Planning-Foundation-Contract]

### Current State To Change

- `expireTripChangeProposalInTransaction` currently locks the proposal, marks it expired, then directly inserts into `tripPlanChangeHistory` and records its audit event with `legacySystemTripPlanningUserActor`. This produces a legacy `audit_events` user row with fake ID/email despite the history row already using a system shape. Replace both paths with the cataloged system actor and Audit-owned writers. [Source: src/features/chat-trips/trip-change-proposals.ts#expireTripChangeProposalInTransaction]
- `dismissTripChangeProposal` already demonstrates the correct transaction-coupled user actor pattern using `recordPlanHistory` and `recordAuditEvent`; mirror its writer flow for expiry while substituting the system actor. [Source: src/features/chat-trips/trip-change-proposals.ts#dismissTripChangeProposal]
- The current `applyApprovedTripChange` returns `expired` when it discovers a passed expiry but does not terminalize the proposal. Story 8.4 must use the exported in-transaction expiry command inside the existing apply transaction, then return `expired` without applying operations. The expiry command must only transition an elapsed, pending proposal; a direct call for a future/non-expiring pending proposal returns its unchanged summary with no audit/history write. This reconciles the current code to the current Epic 8/AD-30 contract. [Source: _bmad-output/planning-artifacts/epics.md#Story-8.4] [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30-Primary-Conversation-And-Change-Proposals-Are-Explicit-Commands]

### Architecture And Regression Guardrails

- Preserve strict terminal idempotency: after the row lock, any non-pending proposal returns its current summary without another history or audit record. Do not introduce a pre-lock existence query or a separate duplicate-detection race. [Source: src/features/chat-trips/trip-change-proposals.ts#expireTripChangeProposalInTransaction]
- Preserve owner isolation. Normal owner reads and apply/dismiss authorization remain owner-scoped. The sessionless expiry command selects by proposal and Trip Project, then uses the selected row's persisted owner provenance for the history write; it has no caller owner identity to authorize and must not manufacture a session. Missing/wrong-project calls return `not_found` without leaking further existence. [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#9-Non-Functional-Requirements]
- Preserve the different operational failure policies: expire-on-read catches/logs transient expiry errors so reads continue; the expiry worker exposes/retries batch failure according to its current loop; the core expiry command rethrows transient database errors for retry. Attribution changes must not collapse these policies.
- Do not change plan mutation behavior, proposal draft generation, proposal operations/fences, expiry timing UX, history rendering, worker scheduling, or client components. This is a backend/domain attribution and terminal-command correction only.
- The old Story 7.5 instruction to use `system-trip-planning@xuyenviet.invalid` as a session-shaped actor is superseded for expiry attribution by AD-31 and this story. Do not reproduce it. [Source: _bmad-output/implementation-artifacts/7-5-apply-dismiss-and-expire-proposals-safely.md#Existing-Implementation-To-Preserve]

### Scope Boundaries

- **In scope:** proposal expiry history/audit attribution; apply/dismiss use of the existing Audit history boundary; application-at-expiry terminalization; direct Chat/Trips plan-history write removal/enforcement; related focused tests and local expiry fixtures, including `tests/trip-planning-safety.test.ts`.
- **Not Story 8.3:** knowledge, capture, indexing, extraction, search, or AI usage executor attribution.
- **Not Story 8.5:** removing `0064_system_trip_planning_actor.sql`, reserved-user migrations/seeds/reset behavior, or repository-wide fake-user helpers. Remove only the runtime and focused-test dependency required for expiry; defer physical clean-break deletion.
- **Not Story 8.6:** repository-wide final actor-isolation validation, clean reset/seed proof, or broad direct-insert enforcement outside the scoped Chat/Trips history path.
- No new UI, dependency, role/authentication capability, generic persistence helper, schema table, migration, durable-data backfill, worker process, or operations dashboard.

### Project Structure Notes

- Keep Audit contracts in `src/features/audit/`, Chat/Trips terminal commands in `src/features/chat-trips/`, schema ownership in `src/db/schema.ts`, and database-backed tests under `tests/`.
- Use `@/*` imports, strict TypeScript, existing `server-only` feature boundaries, PostgreSQL/Drizzle, Vitest, and pnpm. Add no dependency. [Source: _bmad-output/project-context.md#Technology-Stack--Versions]
- The existing `audit_events` and `trip_plan_change_history` XOR schema delivered by Story 8.2 supports the required valid system actor. Do not generate schema churn absent a demonstrated incompatibility. [Source: _bmad-output/implementation-artifacts/8-2-persist-valid-audit-history-and-usage-attribution.md#Valid-actor-XOR-persistence]

### Previous Story Intelligence

- Story 8.1 establishes the closed catalog and fail-closed constructors. Use `createSystemAuditActor` and `toUserAuditActor`; never define feature-local actor unions, arbitrary system strings, fake sessions, or a user-like executor.
- Story 8.2 establishes valid actor XOR persistence and Audit-owned event/history writers. The supplied transaction is mandatory for terminal proposal work; do not open a new global transaction from a helper.
- Story 8.3 confirms two relevant review lessons: preserve existing locks/fences during attribution changes, and keep automated state transitions paired with transaction-coupled Audit events.
- The Story 8.2 non-TTY `pnpm db:generate` rename-disambiguation limitation is irrelevant unless this story incorrectly requires schema work. Existing unrelated full-suite gaps must be reported exactly if encountered, not attributed to this story without proof.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-8-Trustworthy-Automation-And-Audit-Attribution]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.4-Attribute-Trip-Proposal-Expiry-Through-The-Audit-Boundary]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30-Primary-Conversation-And-Change-Proposals-Are-Explicit-Commands]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31-Audit-And-Automated-Execution-Use-First-Class-Actors]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.2-User-Authentication-Chats-And-Trips]
- [Source: _bmad-output/implementation-artifacts/8-1-establish-the-audit-actor-boundary-and-system-catalog.md]
- [Source: _bmad-output/implementation-artifacts/8-2-persist-valid-audit-history-and-usage-attribution.md]
- [Source: _bmad-output/implementation-artifacts/8-3-attribute-knowledge-capture-and-ai-work-to-system-executors.md]
- [Source: _bmad-output/implementation-artifacts/7-5-apply-dismiss-and-expire-proposals-safely.md]
- [Source: _bmad-output/project-context.md]
- [Source: src/features/chat-trips/trip-change-proposals.ts]
- [Source: src/features/chat-trips/trip-proposal-expiry-worker.ts]
- [Source: src/features/audit/actors.ts]
- [Source: src/features/audit/events.ts]
- [Source: src/features/audit/history.ts]
- [Source: tests/trip-change-proposals.test.ts]
- [Source: tests/trip-proposal-expiry-worker.test.ts]
- [Source: tests/trip-planning-safety.test.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- BMad installation verified through `_bmad/_config/bmad-help.csv`; `bmad-help` and `bmad-create-story` activation ran with no prepend/append steps. `_bmad-output/project-context.md` was loaded as the persistent project fact.
- Complete sprint status, Epic 8, PRD, AD-30/AD-31 architecture, completed Stories 8.1-8.3 and 7.5, current Audit boundaries, current expiry/worker paths, relevant tests, and recent commits were analyzed.
- Story 7.5's obsolete fake-session expiry instruction conflicts with AD-31. This story explicitly supersedes it for expiry attribution. The apply-expiry behavior is aligned to the current Epic 8 and architecture requirement: terminalize through the same in-transaction command.
- Story context validated non-interactively against the installed `bmad-create-story` checklist. No application code, migration, test execution, commit, code review, or later story was started.
- Revalidation repaired the future/non-expiring direct-expiry no-op contract, narrowed the sessionless command's `not_found` scope to missing/wrong-project calls, and included the existing proposal and safety application-at-expiry cases in the fixture and audit coverage.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status is `ready-for-dev`; sprint status is synchronized to `ready-for-dev`.
- No implementation blocker: Stories 8.1 and 8.2 provide the required Audit actor and valid system persistence boundaries, and the existing schema supports the change without migration.
- Implementation stop condition: if any proposed schema/migration or deployment activity would target durable customer/operational data, stop and obtain an expand-migrate-contract design rather than extending the disposable/reset-only Epic 8 clean break.
- 2026-07-27: `bmad-dev-story` implementation completed. The focused Story 8.4 suite passed 108 tests; `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. No migration was added or modified.
- Completion synchronization is authorized only through the review checkpoint. Independent adversarial review remains the next required workflow action; this record does not represent review approval or story completion.
- 2026-07-27: Repaired all three adversarial review patches only. The apply command captures its expiry clock after proposal locking; worker/read expiry contention is deterministic; the scoped direct-history-insert guard detects formatted inserts. `pnpm test:run tests/trip-change-proposals.test.ts tests/trip-proposal-expiry-worker.test.ts tests/trip-planning-safety.test.ts tests/audit-actors.test.ts tests/audit-attribution-migration.test.ts` passed 109 tests; `pnpm build` and a post-build `pnpm typecheck` passed. `pnpm lint` has 0 errors and the existing three unused-variable warnings in `tests/knowledge-search.test.ts`. No schema, migration, Story 8.5, or commit changes were made. Story returned to `review` pending follow-up review.

### File List

- _bmad-output/implementation-artifacts/8-4-attribute-trip-proposal-expiry-through-the-audit-boundary.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/features/chat-trips/trip-change-proposals.ts
- tests/trip-change-proposals.test.ts
- tests/trip-planning-safety.test.ts

## Change Log

- 2026-07-27: Created and non-interactively validated the Story 8.4 implementation guide; status set to `ready-for-dev`. No code, migration, test, commit, review, or later-story work was performed.
- 2026-07-27: Revalidated and repaired documentation-only expiry command semantics, sessionless ownership wording, scoped enforcement terminology, and affected safety/worker test guidance; status remains `ready-for-dev`. No code, migration, test, commit, review, or later-story work was performed.
- 2026-07-27: Revalidated the repaired guide again and made the existing proposal-suite application-at-expiry DB and mocked regression updates explicit; status remains `ready-for-dev`. No code, migration, test, commit, review, or later-story work was performed.
- 2026-07-27: Synchronized the completed `bmad-dev-story` implementation to `review` under Chief of Staff authorization. Recorded focused 108-test, lint, typecheck, and build evidence. No code, test, migration, commit, or independent review was performed in this synchronization; independent adversarial review remains next.
- 2026-07-27: Repaired the three Story 8.4 adversarial review findings and returned the story to `review`. Added lock-time expiry, deterministic worker/read contention, and formatted direct-insert enforcement regressions. No schema/migration, Story 8.5, or commit changes.
