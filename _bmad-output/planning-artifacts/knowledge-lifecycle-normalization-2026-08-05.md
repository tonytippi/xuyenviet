# Knowledge Lifecycle Normalization

**Status:** Implemented by Epic 15

**Historical record:** This approved clean-break contract was implemented by Epic 15. The current PRD, architecture, `epics.md`, sprint status, and completed Epic 15 story records are authoritative for ongoing work.

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

Replace the overlapping Knowledge state machines with four narrowly scoped lifecycles. All current targets are disposable and have already been reset, so this is a clean schema and application cutover: update schema, contracts, workloads, seeds, and fixtures together, then reset and reseed. No legacy representation, backfill, dual write, or compatibility path is required. If durable shared or customer data exists before this ships, stop and replace this rollout with an approved expand-migrate-contract design.

The central rule is:

> A knowledge card has exactly one workflow state. A recommendation is the sole durable record of actionable operator work. A sampling obligation records required later quality control. A candidate preserves the AI decision that created the work. A job reports only technical execution.

## Problem

The current model lets several entities answer overlapping versions of “is this fact published, pending, or handled?”:

| Entity | Current state surface | Problem |
|---|---|---|
| Ingestion job | Ten stages, including business outcomes | A multi-candidate capture has one roll-up stage that cannot describe every candidate. |
| Candidate | Processing stages plus `published`, `verify_first`, and review outcomes | Operator resolution changes an AI outcome, losing the original decision. |
| Knowledge card | `status`, `publicationState`, `knowledgeState`, `reviewState`, `verificationState`, and `needsReview` | Several columns jointly encode the workflow and admit contradictory combinations. |
| Recommendation | Work status, reason, action, and resolution | It overlaps with card review flags and candidate terminal stages. |

One capture may yield several candidates with different outcomes. A parent job status therefore cannot represent a candidate or card lifecycle state.

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

`candidateCount` counts persisted discovered candidates; `completedCandidateCount` counts candidates with `processing_status = completed`; `failedCandidateCount` counts candidates with `processing_status = failed`; and `needsOperatorCandidateCount` is the completed subset with `ai_disposition = needs_operator`. Counters are transactional, idempotent observability projections and never drive lifecycle or retrieval. A job becomes `completed` only after discovery is terminal and every discovered candidate is completed or failed.

The UI reports, for example, “Completed: 37 applied, 3 need operator action,” rather than showing a job as `verify_first`.

### 2. Ingestion Candidates: Immutable AI Outcome

Replace candidate `stage` with two independent fields:

```text
processing_status: queued | processing | completed | failed
ai_disposition: apply | needs_operator | discard
```

`ai_disposition` and `outcome_reason_code` are null unless `processing_status = completed`, then immutable. `outcome_reason_code` records the completed AI decision, including `applied` for `apply`. A failed candidate has no business disposition. Other reason codes include:

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
| `draft` | No | None | `none` |
| `pending_operator` | No | `verification`, `relation`, `risk`, `missing_context` | Usually `operator_required`; may be `none` for relation/context work |
| `active` | Yes, subject to evidence freshness | `sampling` only | `none` |
| `suppressed` | No | None | `none` or `failed` |
| `archived` | No | None | `none` |
| `rejected` | No | None | `none` |

Opening new operator work for a suppressed card must transition it to `pending_operator` in the same transaction. No action may create an open recommendation while leaving the card `suppressed`.

### 4. Recommendations: The Actionable Operator Work Queue

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

### 5. Sampling Obligations: Durable Quality-Control Requirements

`knowledge_sampling_obligations` records one immutable obligation for every completed `needs_operator` candidate. It records the candidate, card when associated, creation fence, and later sampling disposition. It is not an actionable recommendation and does not block publication. A `sampling` recommendation may open only for an active card at the same version fence.

## Transition Ownership

Introduce one transactional Knowledge command boundary in `packages/database`,
exported through a narrow domain port:

```text
transitionKnowledgeCard(input, transaction)
```

It is the only writer for lifecycle transitions and recommendation state. API operator commands invoke it synchronously after CSRF, authorization, and input validation. The Worker invokes it from continuous ingestion, conflict, indexing, and scheduled sampling-selection loops. Source removal invokes it from its retryable Knowledge command. The command must not be called from the admin presentation application; API requests never claim jobs or execute ingestion.

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

It receives a named trigger, actor, expected card and evidence-set fence, plus the expected recommendation or candidate fence where applicable. It locks the affected rows, validates the transition matrix, and returns `resolved`, `stale`, or `invalid`.

Candidate completion and card transition happen in one database transaction under the existing card/source advisory locks and version fence.

## Required Database Invariants

Enforce row-local rules with database constraints, completed candidate immutability with a database trigger, cardinality with partial unique indexes, and cross-table rules with the single command boundary.

### Check Constraints

- `active` cards require `verification_requirement = none`.
- `pending_operator` cards cannot be traveler retrievable.
- `suppressed`, `archived`, and `rejected` cards cannot be traveler retrievable.
- `rejected` cards cannot have active search documents.
- Candidate `ai_disposition` and `outcome_reason_code` must be null unless completed and non-null when completed.

### Trigger

A `BEFORE UPDATE` trigger rejects changes to `ai_disposition` or `outcome_reason_code` after candidate completion.

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
- An active card requires at least one eligible active supporting evidence record with a validated span, eligible source/capture, and required retrieval metadata.
- Losing the last eligible supporting evidence transitions a card to `pending_operator` with primary work or `suppressed`, as selected by the matrix, and disables the projection in the same transaction.

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
- Every `needs_operator` outcome creates one immutable `knowledge_sampling_obligations` row, independent of later operator resolution.
- A high-severity sampling failure persists the exact cohort definition and card/version membership before containment. It either transitions a remediable card to `pending_operator` with one fenced `risk` recommendation, or suppresses an unsafe card without a successor work item.
- Sampling does not alter the candidate AI disposition or create verification work by itself.

## Transition Matrix

| Trigger | Runtime | From | To | Work effect | Evidence / projection effect |
|---|---|---|---|---|---|
| Low-risk candidate completion | Worker | `draft` | `active` | Optional sampling work | Require eligible supporting evidence; mark index dirty |
| Verify-first candidate completion | Worker | `draft` or `suppressed` | `pending_operator` | Open one primary `verification` item; create immutable sampling obligation | Require validated evidence; disable projection |
| Primary publish | API | `pending_operator` | `active` | Resolve primary work | Require eligible supporting evidence; mark index dirty |
| Primary suppress | API | `pending_operator` | `suppressed` | Resolve primary work; no successor | Disable projection |
| Edit and requeue | API | `pending_operator` | `pending_operator` | Supersede current work; open one newly fenced primary item | Increment applicable content/evidence fence; disable projection |
| Conflict or invalidating evidence | Worker | `active` | `pending_operator` | Open one `relation` or `risk` item | Set `conflicted` when applicable; disable projection |
| New evidence for suppressed card | Worker | `suppressed` | `pending_operator` | Open one newly fenced primary item | Require validated evidence; projection remains disabled |
| Final eligible support removed | Source-removal command | `active` | `suppressed` | Supersede open sampling work; no successor | Disable projection |
| Archive | API | `draft`, `pending_operator`, `active`, or `suppressed` | `archived` | Supersede all open work | Disable projection |
| Restore / re-evaluate | API or Worker | `archived` | `active` or `pending_operator` | Open primary work only for `pending_operator` | Require a new fence and target-state evidence predicate |
| Sampling failure | API or Worker | `active` | `pending_operator` or `suppressed` | Resolve triggering sampling work; open `risk` work only for `pending_operator` | Persist cohort membership; disable projection |

`rejected` is terminal for its card version. Materially new content starts a new card workflow/version rather than reviving the rejected decision. Every primary-work transition requires exactly one same-fence open primary item while pending; suppressed, archived, and rejected cards retain no open primary or sampling work.

## Clean-Break Migration

Current databases are disposable and the inconsistent records previously observed have already been reset. Create one forward-only Drizzle migration that removes the legacy lifecycle representation and introduces only the target schema, constraints, indexes, trigger, and sampling-obligation table. Update API/domain contracts, Worker and API commands, read models, seeds, fixtures, and tests in the same change; reset and reseed under existing local safeguards. No runtime reads legacy columns and no backfill, dual write, compatibility fixture, release matrix, or rollback binary is required.

If any target becomes durable or shared before this ships, halt this clean-break procedure and design a separate expand-migrate-contract rollout.

## Implementation Plan

### Phase 1: Clean Schema and Contracts

- In `packages/database/src/schema.ts`, replace legacy lifecycle fields with the target lifecycle, job, candidate, recommendation, and sampling-obligation fields.
- Add target checks and partial indexes, including one open primary work item and
  one open sampling item per card version fence; add the completed-candidate immutability trigger.
- Add direct-API contract fields and parsers in `packages/contracts`; update the
  `AdminKnowledgeReviewPort` in `packages/domain` without exposing persistence
  internals to `apps/admin`.
- Generate the forward-only migration, reset/reseed the disposable target, and verify all fixtures are target-shaped.

**Exit:** a clean database validates target-shaped writes and contracts represent the target model only.

### Phase 2: Domain Commands

- Implement `transitionKnowledgeCard` beside the existing recommendation and
  indexing commands in `packages/database`. It accepts an explicit trigger and
  expected version fence, acquires the current card advisory lock, locks the
  card/recommendation rows, and returns a typed stale/invalid/resolved outcome.
- Make it atomically update lifecycle state, verification requirement, fenced
  recommendations, candidate association, audit event, index dirty marker, and
  search-document invalidation.
- Preserve existing advisory-lock order, worker lease/fencing/CAS behavior, source withdrawal, and sampling cohort locks. Do not make the command claim Worker jobs.
- Move writes from `knowledge-recommendations.ts`, ingestion processing,
  source-removal logic, and sampling escalation one path at a time. Delete a
  direct lifecycle/recommendation write only after its replacement matrix tests
  pass.

**Exit:** static search confirms every production lifecycle/recommendation mutation goes through the command, while API and Worker retain their assigned triggers.

### Phase 3: Read Models and Direct API UI

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

### Phase 4: Verification

- Replace lifecycle tests with a transition-matrix suite covering every trigger
  and forbidden transition. Run database tests serially under `pnpm
  test:integration`; keep pure policy tests under `pnpm test:unit`.
- Add constraint, stale-fence, concurrent resolution, source-withdrawal,
  sampling-containment, mixed-job-outcome, atomic-index/audit, API authorization,
  and direct-admin UI contract tests.
- Run focused suites first, then `pnpm test:unit`, `pnpm test:integration`,
  `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm exec drizzle-kit check`.

**Exit:** a reset/reseeded database has only the target representation and the target invariants are enforced by schema, command, and regression suite.

## Acceptance Criteria

- No persisted card can express the current contradictory combination equivalent to `suppressed + required + reviewed + needsReview=false`.
- No active card can have an open primary operator recommendation.
- One card version has at most one open primary operator recommendation and at most one open sampling recommendation.
- An operator resolution never changes the candidate's original AI disposition.
- A completed ingestion job may contain mixed candidate outcomes without its own status misrepresenting them.
- A verify-first publication completes card, recommendation, audit, candidate association, and index updates atomically.
- Suppressing a verification recommendation does not recreate verification work unless later evidence explicitly transitions the card back to `pending_operator`.
- A stale recommendation cannot mutate card, evidence, recommendation, audit, or index data.
- A completed candidate's AI disposition and reason cannot be changed; failed candidates have no business disposition.
- A job completes only when discovery is terminal and all candidates are completed or failed; its counters match the defined candidate projections.
- An active card has eligible supporting evidence, and loss of its final eligible support disables retrieval atomically.
- A source-removal command completes only after every dependent card is re-evaluated and no removed evidence remains traveler eligible.
- All development seed data and test fixtures satisfy the database invariants without legacy exceptions after reset/reseed.
- The direct API remains the only browser-facing knowledge owner; `apps/admin`
  contains no lifecycle command or database import, and no BFF route is added.
- The Worker remains the only continuous ingestion/indexing owner; API requests may synchronously execute authorized operator lifecycle transitions but never claim jobs or run ingestion/index loops.
- Every `needs_operator` candidate creates one immutable sampling obligation; sampling containment records exact cohort membership and either opens fenced risk work for remediable cards or suppresses unsafe cards.

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
