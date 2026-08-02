# Proposal: Normalize the Knowledge Lifecycle

**Status:** Proposed

**Scope:** Knowledge ingestion jobs, ingestion candidates, knowledge cards, recommendations, sampling, search eligibility, and related operator views.

## Decision

Replace the overlapping Knowledge state machines with four narrowly scoped lifecycles. Because the system is still in development, this is a breaking schema and application refactor: reset development data rather than carrying forward inconsistent records or adding permanent compatibility paths.

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

Introduce one Knowledge command boundary:

```text
transitionKnowledgeCard(input, transaction)
```

It is the only writer for:

- `knowledge_cards.lifecycle_state`
- `knowledge_cards.verification_requirement`
- active/superseded/replaced recommendations
- operator confirmation metadata
- candidate-to-card association when processing completes
- search-index dirty markers and search-document invalidation
- audit events for lifecycle decisions

The ingestion pipeline, operator actions, source removal, conflict handling, and sampling containment call this command. They may not update card lifecycle columns or recommendations directly.

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

## Development Data Reset and Migration

No compatibility migration is required for development data.

1. Create new schema and constraints in a new Drizzle migration.
2. Remove deprecated state columns and old enum-like checks from schema code.
3. Update seed data and test helpers to create only valid target-state combinations.
4. Reset the local development database and test database.
5. Run source capture seeding and ingestion test fixtures under the new lifecycle.
6. Remove legacy state-repair branches introduced only to handle current inconsistent data.

No code may read both legacy and new lifecycle columns after the migration. The reset is deliberate to avoid two competing sources of truth.

## Implementation Plan

### Phase 1: Contract and Schema

- Update PRD and architecture state definitions.
- Create a lifecycle transition matrix and database schema migration.
- Replace card lifecycle fields and candidate/job state fields.
- Add constraints and partial unique indexes.

### Phase 2: Domain Commands

- Implement `transitionKnowledgeCard` and make it the only lifecycle/recommendation writer.
- Move ingestion, operator action, source removal, conflict, and sampling mutations to the command.
- Preserve transaction locks, optimistic version checks, audit events, and indexing behavior.

### Phase 3: Read Models and UI

- Update capture queue to job execution state plus candidate outcome counts.
- Update recommendation queue to work type and work status only.
- Update card detail and admin pages to show `lifecycle_state`, domain classification, evidence strength, and operator decision separately.

### Phase 4: Verification and Removal

- Replace existing lifecycle tests with a transition matrix test suite.
- Add database constraint tests and concurrency/version-fence tests.
- Remove legacy repair branches and obsolete status labels.
- Run integration, typecheck, lint, and a clean database seed/ingestion smoke test.

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
