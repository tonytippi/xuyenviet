# Story 21.11: Establish V6 Retrieval Qualification Infrastructure

Status: backlog

## Story

As a product owner, I want qualification and read-policy infrastructure before evidence collection, so that later evidence and activation cannot weaken safety, privacy, provenance, or operations.

## Acceptance Criteria

**Given** Feedback/Eval defines the v6.2 qualification profile
**When** G0 validation runs
**Then** the closed versioned profile contains numeric cohort thresholds, literal-zero safety limits, literal-one provenance correctness, minimum run/duration windows, and every required context/conversion/route/retrieval/web/deletion metric
**And** missing, unknown, null, prose-only, weakened, malformed, or structurally incompatible profiles/policies cannot start an evidence window.

**Given** fixture and dependency manifests are prepared
**When** an evaluation run begins
**Then** it pins the exact code, read policy, corpus, fixtures, registry/coverage, requirement/context/clarification/conversion/proposal/serialization, retrieval, parser/resolver, prompt/model, and evaluator versions
**And** any changed comparable member restarts the evidence window rather than averaging incompatible results.

**Given** Retrieval runs in `v6_shadow`
**When** an authoritative legacy request is paired with the v6 candidate
**Then** exactly one immutable execution contains one authoritative legacy run and at most one shadow run, and only the authoritative role may select/persist a traveler answer or write provider, prompt, provenance, or usage effects
**And** shadow stores only bounded `would-render` evaluation data and performs no web/model call or traveler mutation.

**Given** qualification infrastructure is used to prepare a cutover decision
**When** a report or policy is invalid, incomplete, or missing a qualified target
**Then** it cannot activate `v6_active`
**And** `GATE-01` through `GATE-05` and `COMP-03` through `COMP-05` remain reproducible before Story 21.14 evidence collection and Story 21.15 cutover.

## Tasks / Subtasks

- [ ] `packages/database/src/schema.ts`, `drizzle/migrations/`, and `drizzle/migrations/meta/_journal.json` — add Feedback/Eval-owned gate/corpus/cohort/run/report/approval persistence and Retrieval-owned read-policy/cutover/execution/run/shadow-comparison/would-render persistence through the next Drizzle-generated forward migration. The gate profile designates the exact Feedback/Eval and Product Owner actor identities allowed to sign its reports; do not invent a new application role or edit historical migrations/snapshots by hand (AC: 1-4).
- [ ] `packages/domain/src/retrieval-qualification.ts` (NEW) and `packages/database/src/retrieval-qualification.ts` (NEW) — implement the closed DB-free profile/tuple/report validators and Feedback/Eval repository. G0 must persist mandatory fixture IDs, metric-definition versions, legacy baseline, source-metadata leakage cases, reviewed Trip proposal/schema design, and the deployed PostgreSQL/provider/Vietnamese lexical spike result; an absent or failing prerequisite returns a fail-closed result (AC: 1-2, 4).
- [ ] `packages/domain/src/retrieval-read-policy.ts` (NEW) and `packages/database/src/retrieval-read-policy.ts` (NEW) — implement the Retrieval-owned PostgreSQL policy reader and `activateRetrievalReadPolicy(...)` CAS contract. Define `shadow | cutover | cleanup | rollback` validation, audit, expected-current-policy fencing, qualified runnable targets, and deployment-config seed/cache-only behavior; this story must not invoke cutover (AC: 2, 4).
- [ ] `packages/database/src/source-bundle.ts` and the post-Story-21.8 finalization seam in `packages/database/src/ai-ask-stream-execution.ts` — pin the committed read-policy row at execution start and create one authoritative run plus at most one shadow run. Shadow may write only a bounded would-render manifest/comparison and must not call Search/model code or write traveler, prompt, provenance, or Usage state (AC: 2-3).
- [ ] `scripts/retrieval-qualification.ts` (NEW), `scripts/retrieval-read-policy.ts` (NEW), and `package.json` — add `retrieval:qualification` read/validate/profile-approve/collect/report-approve commands, with `collect --gate shadow|cleanup`, and `retrieval:read-policy` inspect/transition/record-retirement commands. Both commands require an explicit database target identity; mutating commands require exact report/policy IDs and an actor identity designated by the applicable immutable gate profile/report. Validate G0 profile approval with `pnpm retrieval:qualification -- profile-approve --profile-id "$RETRIEVAL_PROFILE_ID" --actor-user-id "$FEEDBACK_EVAL_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`; no command may infer approval, invent a Product/Feedback application role, or silently target production (AC: 1-4).
- [ ] `tests/retrieval-qualification.test.ts` (NEW), `tests/retrieval-qualification.integration.test.ts` (NEW), `tests/retrieval-read-policy.integration.test.ts` (NEW), and `tests/retrieval-shadow.integration.test.ts` (NEW) — cover malformed/weakened profiles, exact tuple restart, `GATE-01`-`GATE-05`, `COMP-03`-`COMP-05`, `COMP-07`, paired retry/deletion, stale CAS, no shadow side effects, authorized rollback, and qualified runnable targets; each clean-table integration file calls `resetTestDatabase()` locally (AC: 1-4).
- [ ] Run `pnpm db:generate`, `pnpm test:unit -- tests/retrieval-qualification.test.ts`, `pnpm test:integration -- tests/retrieval-qualification.integration.test.ts tests/retrieval-read-policy.integration.test.ts tests/retrieval-shadow.integration.test.ts tests/drizzle-migration-plan.test.ts tests/schema-compatibility.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; record exact environmental failures without weakening a gate (AC: 1-4).

## Dev Notes

- Depends on Story 21.13 so the canonical deletion matrix, races, and production-evaluation invalidation are executable inputs to qualification rather than prose-only metric names.
- AD-37/AD-38/RTA-8/RTA-9 govern ownership. Deployment configuration cannot override the PostgreSQL read-policy row.
- Shadow records bounded evaluation material only. It must never make a provider or web call, select a response, mutate traveler state, or write prompt/provenance/provider usage.
- Completion is local infrastructure readiness only. Story 21.14 owns evidence collection/Product Owner approval; Story 21.15 owns activation and incident rollback.

### Block If

- Story 21.13 is not `done`, or its transaction-aware invalidator ports and `DEL-01` through `DEL-04` evidence are unavailable.
- The numeric gate profile, immutable fixture manifest, current legacy baseline, reviewed Trip proposal/schema design, or deployed PostgreSQL/provider/Vietnamese lexical spike result is missing. Persist the failure as G0-blocked; do not invent evidence.
- The implementation cannot identify the exact post-Story-21.8 finalization seam or post-Story-21.13 deletion invalidator. Reconcile the path against completed upstream story File Lists before editing.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.11]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37-and-AD-38]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Compatibility-And-Cutover]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.11` is normative. Guide AC 1-3 map to gate profile, tuple, and shadow execution. Guide AC 4 maps to fail-closed activation prerequisites only; evidence approval and cutover moved to Stories 21.14 and 21.15.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created. Completion additionally requires external evidence-window and Product Owner gates.

### File List
