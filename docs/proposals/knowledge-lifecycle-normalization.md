# Proposal: Normalize the Knowledge Lifecycle

**Status:** Proposed - revised for direct API topology

**Scope:** Knowledge ingestion jobs, ingestion candidates, knowledge cards, recommendations, sampling, search eligibility, public retrieval, and related API/operator views.

## Architecture Alignment

This proposal is aligned with the post-BFF deployment topology:

- `apps/api` is the browser-facing NestJS API. It owns browser-session admission,
  CSRF, authorization, validation, and the `/v1/admin/knowledge/*` contract.
- `apps/admin` is a presentation application only. It calls the API with browser
  credentials and must not import domain commands or database code.
- `apps/worker` is the only continuous owner of extraction, ingestion, and index
  projection loops. An API request must never claim or execute ingestion work.
- `packages/domain` owns ports and lifecycle command contracts; `packages/database`
  provides the transactional Postgres implementation used by the API and Worker.

No BFF adapter, BFF credential, server action, or Next.js route is part of this
change. The direct API's existing session, origin, CSRF, safe-error, request-ID,
and capability controls remain unchanged.

## Decision

Replace the overlapping Knowledge state machines with four narrowly scoped lifecycles. This is a breaking schema and application refactor: migrate shared environments forward under the release-matrix process, and reset only explicitly disposable local development databases rather than carrying forward inconsistent records or adding permanent compatibility paths.

The central rule is:

> A knowledge card has exactly one workflow state. A recommendation is the sole durable record of operator work. A candidate preserves the AI decision that created the work. A job reports only technical execution.

## Problem

The current model lets several entities answer overlapping versions of “is this fact published, pending, or handled?”:

| Entity | Current state surface | Problem |
|---|---|---|
| Ingestion job | Ten stages, including business outcomes | A multi-candidate capture has one roll-up stage that cannot describe every candidate. |
| Candidate | Processing stages plus `published`, `verify_first`, and review outcomes | Operator resolution changes an AI outcome, losing the original decision. |
| Knowledge card | `status`, `publicationState`, `knowledgeState`, `reviewState`, `verificationState`, and `needsReview` | Several columns jointly encode the workflow and admit contradictory combinations. |
| Recommendation | Work status, reason, action, and resolution | It overlaps with card review flags and candidate terminal stages. |

The audit found material inconsistency in the current development database:

- 138 open verification recommendations are attached to cards already active, reviewed, and corroborated.
- 16 suppressed cards requiring verification have contradictory review flags.
- 188 published candidates belong to jobs rolled up as `verify_first`.

The last category is not necessarily incorrect: one capture may yield several candidates with different outcomes. It proves that the parent job stage cannot be used as a candidate or card lifecycle state.

## Goals

- Make invalid card workflow combinations impossible to persist.
- Preserve the independent AI decision for every candidate after an operator acts.
- Give operators one clear answer per card: active, awaiting a decision, or unavailable.
- Prevent an open recommendation from remaining after its card reaches its target state.
- Keep version fences, evidence safety, source provenance, audit history, sampling obligations, and search-index invalidation.
- Simplify operational UI without hiding actionable work.

## Non-Goals

- Preserve development records, old URLs, or API compatibility.
- Change source/evidence trust policy, scoring thresholds, or retrieval ranking.
- Collapse capture execution, fact workflow, and operator work into one universal status column.
- Remove the separate sampling quality-control workflow.

## Target Model

### 1. Ingestion Jobs: Technical Execution Only

Rename `stage` to `status` and retain only:

```text
queued -> running -> completed | failed
```

`checkpoint.step` records resumable execution detail such as discovery, extraction, judgment, or relation evaluation. It is not a business status and is not the primary operator label.

The job keeps aggregate counters for observability only:

- `candidateCount`
- `completedCandidateCount`
- `failedCandidateCount`
- `needsOperatorCandidateCount`

The UI reports, for example, “Completed: 37 applied, 3 need operator action,” rather than showing a job as `verify_first`.

### 2. Ingestion Candidates: Immutable AI Outcome

Replace candidate `stage` with two independent fields:

```text
processing_status: queued | processing | completed | failed
ai_disposition: apply | needs_operator | discard
```

`ai_disposition` is nullable until `processing_status = completed`, then immutable. `outcome_reason_code` explains `needs_operator` or `discard`, for example:

```text
verification_required
weak_evidence
relation_ambiguous
missing_context
conflict
stale_capture
policy_rejected
```

An operator publishing a card does not rewrite `ai_disposition`. The candidate remains evidence that the AI required operator handling; recommendation resolution and audit record the later human decision.

### 3. Knowledge Cards: One Workflow State

Replace these workflow-overlapping fields:

```text
status
publication_state
review_state
needs_review
```

with:

```text
lifecycle_state:
  draft
  pending_operator
  active
  suppressed
  archived
  rejected
```

Keep `knowledge_state` only for domain semantics:

```text
community_observation
community_pattern
conditional
conflicted
```

Retire `uncertain`, `confirmed`, and `superseded` from `knowledge_state`; those are workflow or evidence concepts, not traveler-facing knowledge classifications.

Replace ambiguous verification state with:

```text
verification_requirement:
  none
  operator_required
  failed
```

Do not persist `corroborated`. Independent corroboration is derived from active supporting evidence with distinct `independence_key` values. An operator decision is represented by recommendation resolution and audit metadata, not misnamed as corroboration.

Optional denormalized audit fields may be retained for read performance:

```text
operator_confirmed_at
operator_confirmed_by_user_id
```

These are not lifecycle controls.

#### Card State Rules

| Card lifecycle | Retrieval | Allowed open recommendation types | Verification requirement |
|---|---|---|---|
| `draft` | No | Draft-review work only | `none` |
| `pending_operator` | No | `verification`, `relation`, `risk`, `missing_context` | Usually `operator_required`; may be `none` for relation/context work |
| `active` | Yes, subject to evidence freshness | `sampling` only | `none` |
| `suppressed` | No | None | `none` or `failed` |
| `archived` | No | None | `none` |
| `rejected` | No | None | `none` |

Opening new operator work for a suppressed card must transition it to `pending_operator` in the same transaction. No action may create an open recommendation while leaving the card `suppressed`.

### 4. Recommendations: The Single Operator Work Queue

Simplify recommendation status to:

```text
open | resolved | superseded
```

Remove `in_review` unless the product adds assignment or exclusive claim semantics. Without a claim owner, it does not communicate a reliable operational distinction.

Use explicit work types:

```text
verification
relation
risk
missing_context
sampling
```

Use explicit resolutions:

```text
published_operator_confirmed
published_community_observation
suppressed
edited_and_requeued
relation_resolved
sampling_passed
sampling_failed
```

`resolved` is terminal. `superseded` means the version fence was replaced and must not imply that a successor necessarily exists.

## Transition Ownership

Introduce one transactional Knowledge command boundary in `packages/database`,
exported through a narrow domain port:

```text
transitionKnowledgeCard(input, transaction)
```

It is the only writer for lifecycle transitions and recommendation state. Its
callers are the Worker ingestion loop, API operator commands, source-removal
operation, conflict handling, and sampling containment. The command must not be
called from the admin presentation application.

It owns:

- `knowledge_cards.lifecycle_state`
- `knowledge_cards.verification_requirement`
- active/superseded/replaced recommendations
- operator confirmation metadata
- candidate-to-card association when a candidate completes
- search-index dirty markers and search-document invalidation
- audit events for lifecycle decisions

Draft-content editing remains a separate command because it changes content, not
the lifecycle. If an edit changes the version fence or requires follow-up work,
it must delegate the lifecycle/recommendation portion to this boundary.

Candidate completion and card transition happen in one database transaction under the existing card/source advisory locks and version fence.

## Required Database Invariants

Enforce with check constraints, partial unique indexes, and the single command boundary.

### Check Constraints

- `active` cards require `verification_requirement = none`.
- `pending_operator` cards cannot be traveler retrievable.
- `suppressed`, `archived`, and `rejected` cards cannot be traveler retrievable.
- `rejected` cards cannot have active evidence or active search documents.
- Candidate `ai_disposition` must be null while processing and non-null when completed.
- Candidate `ai_disposition` cannot be changed after completion.

### Partial Unique Indexes

```sql
create unique index knowledge_open_operator_work_per_version
  on knowledge_recommendations (
    knowledge_card_id,
    content_version,
    evidence_set_revision,
    work_type
  )
  where status = 'open';

create unique index knowledge_open_primary_work_per_card_version
  on knowledge_recommendations (
    knowledge_card_id,
    content_version,
    evidence_set_revision
  )
  where status = 'open'
    and work_type in ('verification', 'relation', 'risk', 'missing_context');
```

Sampling remains separately openable for an active card version because it is quality monitoring, not a publication gate.

### Cross-Table Guarantees

The transition command must assert:

- A `verification`, `relation`, `risk`, or `missing_context` recommendation can open only for a `pending_operator` card at the same version fence.
- Resolving the only primary operator work must either activate, suppress, reject, or requeue the card in the same transaction.
- An `active` card cannot retain open primary operator work.
- A `superseded` recommendation cannot mutate a card, evidence, audit row, or index marker.

## Core Flows

### Low-Risk Auto-Publication

```text
candidate AI disposition = apply
  -> card lifecycle = active
  -> candidate processing = completed
  -> optional sampling recommendation
```

### High-Risk Verify-First

```text
candidate AI disposition = needs_operator / verification_required
  -> card lifecycle = pending_operator
  -> verification_requirement = operator_required
  -> one open verification recommendation
  -> mandatory sampling obligation is recorded separately

operator publishes
  -> card lifecycle = active
  -> verification_requirement = none
  -> recommendation = resolved / published_operator_confirmed
  -> candidate AI disposition remains needs_operator
```

### Operator Suppression

```text
pending_operator card + open primary recommendation
  -> card lifecycle = suppressed
  -> verification_requirement = none
  -> recommendation = resolved / suppressed
  -> no successor recommendation
```

### New Evidence for a Suppressed Card

```text
new candidate requires an operator decision
  -> card lifecycle = pending_operator
  -> one new fenced recommendation
```

### Conflict

```text
active card + conflicting evidence
  -> card lifecycle = pending_operator
  -> knowledge_state = conflicted
  -> one open relation or risk recommendation

resolved conflict with valid support
  -> card lifecycle = active
  -> knowledge_state = community_observation or community_pattern
```

## Sampling

Sampling is not a card lifecycle state and not a publication approval state.

- Auto-active cards may have one version-fenced `sampling` recommendation.
- Verify-first outcomes retain their immutable sampling obligation ledger.
- Sampling failure can transition an active card to `suppressed` through `transitionKnowledgeCard` and supersede current sampling work.
- Sampling does not alter the candidate AI disposition or create verification work by itself.

## Migration and Release

The repository requires forward-only Drizzle migrations. This is therefore a
breaking application contract, but not a reason to use a destructive migration,
dual write, or a runtime that reads both representations.

1. Add the target columns, checks, and indexes in an expand migration. Do not
   drop legacy columns in the same release.
2. Run one bounded, resumable, idempotent backfill command that derives target
   state from the existing card, recommendation, candidate, and evidence records.
   It must report ambiguous records as a safe failure code rather than guessing.
3. Release target-only API and Worker workloads after the backfill has completed.
   The API is the selected traffic writer; the Worker remains the operational
   ingestion/indexing owner. Neither creates legacy state or dual writes.
4. Update direct API response parsers, admin presentation, retrieval, indexing,
   fixtures, seeds, and tests in that writer release. Retain legacy columns only
   as inert rollback data until all active/deployable old binaries are retired.
5. In a separately approved contract release, remove legacy columns, checks,
   indexes, repair code, and compatibility test fixtures.

Each production-like release requires the schema release matrix: one declared
traffic writer, `dualWrite: false`, forward-only journal hashes, compatible API
and Worker ranges, and retirement evidence before the contract release. A local
disposable database may be reset only under the existing `db:reset` safeguards;
the reset is a developer convenience, not the shared-environment migration plan.

## Implementation Plan

### Phase 0: Baseline and Decision Record

- Create a current-state inventory query for invalid combinations, open work on
  non-pending cards, stale version fences, mixed ingestion-job outcomes, and
  source-removal/sampling edge cases. Store only counts and safe IDs in the
  release evidence.
- Turn the state table in this proposal into an explicit transition matrix:
  trigger, actor, prior lifecycle, target lifecycle, recommendation effect,
  candidate effect, fence effect, index effect, and audit effect.
- Update the active PRD, architecture, epics/stories, and sprint status before
  implementation. Historical BFF artifacts must not be used as authority.

**Exit:** the current architecture, target model, migration strategy, and every
allowed transition have one authoritative written contract.

### Phase 1: Expand Schema and Contracts

- In `packages/database/src/schema.ts`, add target lifecycle fields and target
  job/candidate fields while retaining legacy fields for the rollout window.
- Add target checks and partial indexes, including one open primary work item and
  one open sampling item per card version fence. Use database checks for
  row-local invariants and the command for cross-table invariants.
- Add direct-API contract fields and parsers in `packages/contracts`; update the
  `AdminKnowledgeReviewPort` in `packages/domain` without exposing persistence
  internals to `apps/admin`.
- Generate a forward-only Drizzle migration and release matrix with the selected
  API traffic writer plus explicit API/Worker capability-owner declarations.

**Exit:** schema validates target-shaped writes, the API contract can represent
the target model, and no deployed workload writes target data yet.

### Phase 2: Domain Commands

- Implement `transitionKnowledgeCard` beside the existing recommendation and
  indexing commands in `packages/database`. It accepts an explicit trigger and
  expected version fence, acquires the current card advisory lock, locks the
  card/recommendation rows, and returns a typed stale/invalid/resolved outcome.
- Make it atomically update lifecycle state, verification requirement, fenced
  recommendations, candidate association, audit event, index dirty marker, and
  search-document invalidation.
- Preserve existing advisory-lock order, worker lease/fencing/CAS behavior,
  source provenance withdrawal, and sampling-policy boundary lock. Do not make
  the command claim Worker jobs.
- Move writes from `knowledge-recommendations.ts`, ingestion processing,
  source-removal logic, and sampling escalation one path at a time. Delete a
  direct lifecycle/recommendation write only after its replacement matrix tests
  pass.

**Exit:** static search confirms there is one production writer for card
lifecycle and recommendation transitions outside the migration/backfill code.

### Phase 3: Backfill and Single-Writer Cutover

- Build a finite maintenance command, not a continuous Worker loop. It processes
  bounded transactions, can resume safely, verifies each derived target state,
  and fails closed on ambiguity.
- Quiesce lifecycle writers for the maintenance window, run the backfill, verify
  invariant counts are zero, then deploy target-only API and Worker workloads.
  The API traffic writer is selected in the matrix; the admin presentation is
  deployed only after the API contract it consumes is selected.
- Record the migration-before-traffic order, selected writer, `dualWrite: false`,
  and rollback binary in the approved release matrix. Roll back by traffic
  selection to a compatible old binary; never run a down migration.

**Exit:** every persisted row has a target representation, only one writer is
reachable, and all release gates retain safe evidence.

### Phase 4: Read Models and Direct API UI

- Update Worker/API projections: the capture queue shows job execution status and
  aggregate candidate counts, never a rolled-up business outcome.
- Update retrieval, approved-knowledge, provenance, answer freshness, and search
  indexing to use `lifecycle_state` and derived evidence support. Traveler reads
  admit only active cards with valid evidence.
- Update `/v1/admin/knowledge/*` serializers and contract parsers to expose
  lifecycle state, domain classification, verification requirement, work type,
  and resolution separately.
- Update `apps/admin` screens to call those direct API endpoints and render the
  separated concepts. It retains browser `credentials: "include"`, API-owned
  CSRF acquisition, and safe error handling; it gains no server-side proxy.

**Exit:** operator and traveler read paths use the target representation only.

### Phase 5: Verification and Contract Release

- Replace lifecycle tests with a transition-matrix suite covering every trigger
  and forbidden transition. Run database tests serially under `pnpm
  test:integration`; keep pure policy tests under `pnpm test:unit`.
- Add constraint, stale-fence, concurrent resolution, source-withdrawal,
  sampling-containment, mixed-job-outcome, atomic-index/audit, API authorization,
  and direct-admin UI contract tests.
- After old binaries are retired and the contract release matrix is approved,
  remove legacy columns, old checks/indexes, repair branches, obsolete labels,
  and compatibility fixtures in one forward-only contract migration.
- Run focused suites first, then `pnpm test:unit`, `pnpm test:integration`,
  `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm exec drizzle-kit check`.

**Exit:** the legacy representation no longer exists and the target invariants
are enforced by schema, command, and regression suite.

## Acceptance Criteria

- No persisted card can express the current contradictory combination equivalent to `suppressed + required + reviewed + needsReview=false`.
- No active card can have an open primary operator recommendation.
- One card version has at most one open primary operator recommendation and at most one open sampling recommendation.
- An operator resolution never changes the candidate's original AI disposition.
- A completed ingestion job may contain mixed candidate outcomes without its own status misrepresenting them.
- A verify-first publication completes card, recommendation, audit, candidate association, and index updates atomically.
- Suppressing a verification recommendation does not recreate verification work unless later evidence explicitly transitions the card back to `pending_operator`.
- A stale recommendation cannot mutate card, evidence, recommendation, audit, or index data.
- All development seed data and test fixtures satisfy the database invariants without legacy exceptions.
- The direct API remains the only browser-facing knowledge owner; `apps/admin`
  contains no lifecycle command or database import, and no BFF route is added.
- The Worker remains the only continuous ingestion/indexing owner; lifecycle
  transition work does not run in an API request or presentation runtime.
- A shared or production-like rollout is forward-only, has the selected API
  traffic writer and `dualWrite: false` in its release matrix, and has a
  compatible rollback binary.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Broad refactor touches pipeline, admin UI, sampling, and retrieval | Implement schema and transition-matrix tests before moving UI; migrate one writer at a time. |
| Reset loses useful development examples | Export a small set of sanitized fixtures, then regenerate from seeded captures. |
| One transition command becomes a large module | Keep it as the lifecycle boundary but compose narrow helpers for evidence, recommendation, indexing, and audit. |
| Sampling and verification requirements are conflated again | Preserve separate sampling obligation ledger and separate recommendation work types; add explicit tests. |
| Product semantics change accidentally | Preserve existing source/evidence policy and only change state representation and ownership. |

## Success Signal

After a clean development reset and representative ingestion runs, every card can be classified from one workflow field, every open operator item points to a same-version `pending_operator` card, and no operator action requires a legacy exception to complete its valid transition.
