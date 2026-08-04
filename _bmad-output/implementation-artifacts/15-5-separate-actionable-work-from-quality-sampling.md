---
baseline_commit: 31cfab8ec7dcf365976c8754e4817a94ce33edcd
---

# Story 15.5: Separate Actionable Work from Quality Sampling

Status: review

## Story

As a knowledge operator, I want review work and quality-control obligations modeled separately, so that sampling measures quality without becoming an accidental publication gate.

## Acceptance Criteria

1. Every completed `needs_operator` candidate creates exactly one immutable sampling obligation that is not actionable work and does not block later publication.
2. Sampling selection creates one fenced `sampling` recommendation only for an active same-version card; it cannot coexist with prohibited primary work or modify candidate AI disposition.
3. High-severity sampling containment persists exact cohort definition/membership before lifecycle mutation; remediable cards become pending with one risk item and unsafe cards are suppressed/de-indexed without successor work.
4. Containment is atomic/version-fenced and leaves unrelated cohorts/card versions unchanged.

## Tasks / Subtasks

- [x] Start only from the completed target-only schema (15.1), immutable AI-first candidate processing (15.2), sole lifecycle writer (15.3), and evidence-safe retrieval/source removal (15.4). Do not restore `requiredForSampling`, verify-first recommendation coupling, `in_review`, legacy reasons/actions, legacy fixtures, fallback reads, a compatibility layer, or a second lifecycle writer. (AC: 1-4)
- [x] Preserve AI-first candidate completion in `transitionCandidateRelation`: a completed `needs_operator` candidate final-CAS creates exactly one `knowledge_sampling_obligations` row keyed by candidate and completion fence, separately from its one primary recommendation. The obligation is durable quality evidence, creates no sampling recommendation itself, and must not be consulted by primary publication or retrieval eligibility. (AC: 1)
  - [x] Retain the existing unique key `(candidate_id, content_version, evidence_set_revision)` as idempotency, but add target-safe database protection that an obligation belongs only to its completed `needs_operator` candidate, its candidate/card/fence identity is immutable, and its sampling disposition can transition only once from unresolved to a terminal sampling outcome. Do not rely only on application behavior. Replace target-invalid fixtures that create an obligation for `apply` or an incomplete/failed candidate.
  - [x] Preserve the completed-candidate trigger: operator resolution, sampling, cohort work, and containment must never change `ai_disposition` or `outcome_reason_code`; failed/queued/processing candidates retain no business disposition.
- [x] Keep the target work vocabulary only: `open | resolved | superseded`, explicit work types `verification | relation | risk | missing_context | sampling`, and explicit resolutions. A normal sampling pass resolves with `sampling_passed`; a non-severe or high-severity failure resolves with `sampling_failed`. Both are quality outcomes only, never publication/approval results: remove sampling resolutions from every publish/eligible-support gate, so a normal pass or non-severe failure reaches its no-lifecycle-change path without requiring a publication transition. (AC: 1-2)
- [x] Implement Worker-owned policy enrollment/selection using the existing `knowledge_sampling_policies`, `knowledge_sampling_cohort_members`, `knowledgeRecommendations.policyId`, and deterministic `shouldSampleKnowledgeCard` seam; do not invent a second sampling model or run a continuous selection loop in API/admin. (AC: 2)
  - [x] Define and enforce whether selection is restricted to auto-active cards or intentionally includes operator-published active cards; do not silently broaden the proposal's auto-active rule. Persist and seal the policy definition/digest and deterministic card/version/evidence-fence membership before opening work. Create at most one same-fence `sampling` recommendation only for an eligible selected card that remains `active`, has `verification_requirement = none`, belongs to the sealed policy cohort, and has no open primary work.
  - [x] A sampling recommendation must durably identify the exact obligation or explicitly defined scoped-obligation set it measures. A sampling resolution may update only that association, never all unresolved obligations that happen to share a card/version/evidence fence. Preserve the obligation ledger independently of actionable work.
  - [x] Make the existing `sealClosedKnowledgeSamplingPolicy` stub real through the established database/domain boundary. The protected Admin API may synchronously authorize and seal an already-closed policy definition/membership, but must not select cards, open sampling work, claim jobs, or execute containment. Register the scheduled selection capability in the existing Worker runtime/adapters; it owns enrollment/selection and invokes the lifecycle boundary. `apps/admin` remains presentation-only and API commands remain authorized synchronous decisions only.
- [x] Route every sampling work/lifecycle effect through `transitionKnowledgeCard` and extend its narrow domain trigger contract instead of hiding containment fields inside generic `operator_resolution`. Call `transitionKnowledgeCardInTransaction` from a cohort transaction so no card can commit independently. (AC: 2-4)
  - [x] Add an explicit containment trigger/input to the domain contract: policy identity and sealed digest, triggering sampling recommendation, ordered member card/version/evidence fences, and a remediable-versus-unsafe classification per member. The generic `operator_resolution` path must not perform containment.
  - [x] Keep the state/work matrix strict: `active` can retain only same-fence sampling work; `pending_operator` can retain exactly one primary item and no sampling work; `suppressed`, `archived`, and `rejected` retain no open work. Existing partial unique indexes enforce only cardinality; enforce policy membership, active/`none` eligibility, and every cross-table state rule in the lifecycle boundary.
  - [x] A normal sampling pass or non-severe failure resolves/records quality work only and leaves an active card active. It must not republish, set verification required/failed, create verification work, or update unrelated obligations that merely share the card fence.
- [x] Define an explicit high-severity containment input with policy identity/digest, triggering sampling item, member version fence, and remediable-versus-unsafe classification. Lock the policy boundary and policy row, load exact members in deterministic order, and persist the closed definition/digest/membership before any card mutation. (AC: 3-4)
  - [x] Run policy sealing, membership persistence, sampling resolution/supersession, lifecycle transition, audit, projection disablement, and index work in one PostgreSQL transaction. Preserve the established source/candidate advisory-lock order; do not introduce per-card nested commits.
  - [x] Treat any changed/missing member fence as stale and roll back the containment batch: no partial cohort membership, card, work, audit, dirty-marker, or projection effects. Duplicate containment must be idempotent.
  - [x] For each current remediable member, resolve/supersede its sampling work, transition `active -> pending_operator`, disable projection, and create exactly one newly fenced `risk` item. For each current unsafe member, resolve/supersede sampling work, transition `active -> suppressed`, disable projection, and create no successor work.
  - [x] Do not mutate unrelated policies, members outside the exact persisted cohort, or later card versions. Do not alter a candidate AI disposition/reason in either branch.
- [x] Update read/dashboard projections to report immutable obligations separately from selected sampling recommendations, completed sampling outcomes, and containment state. Replace the current incomplete sampling-readiness stub and recommendation-only outcome derivation with a projection that reads the obligation ledger plus policy/cohort/work state. No unresolved obligation, unselected cohort member, dashboard readiness signal, or sampling recommendation may block a valid evidence-supported primary publication or active retrieval. (AC: 1-4)
- [x] Repair direct Admin API contracts/screens only where needed to expose target semantics: use `workType === "sampling"`, not the removed `reason` field; distinguish immutable obligations, selected sampling work, terminal quality outcomes, and containment state; state clearly in Vietnamese that sampled active knowledge remains active and sampling neither approves nor re-approves it. The seal control may report an authorized sealed result but must not imply that the browser ran selection or a Worker job. Preserve direct Nest browser sessions, CSRF, safe errors, and no database/domain imports in `apps/admin`. (AC: 1-2)
- [x] Add serial PostgreSQL integration coverage for obligation eligibility/uniqueness/immutability and one-way disposition, later publication with unresolved obligation, auto-active-or-approved selection scope, active-only sampling selection, exact recommendation-to-obligation scoping with multiple obligations at one fence, state/work cardinality, normal sampling pass/failure, high-severity remediable/unsafe containment, exact cohort ordering, stale/concurrent/duplicate containment, candidate immutability, Worker writer-boundary enforcement, Admin seal ownership, dashboard ledger projections, and unrelated-cohort/version isolation. Assert all card/evidence/work/audit/index/cohort effects commit or reject together. (AC: 1-4)

## Dev Notes

- Stories 15.1-15.4 are complete. Start from their target-only clean break and do not reinterpret the Epic 3 historical approval/review baseline as the target contract.
- **AI-first rule:** `needs_operator` is the immutable AI decision that opened primary operator work. It creates a separate sampling obligation, but an unresolved obligation or sampling result is never a second approval gate. A later evidence-valid primary resolution can publish the card while the original candidate remains `needs_operator`.
- `knowledge_sampling_obligations` is a durable per-candidate quality ledger, not an operator queue. A `knowledge_recommendations` row is actionable work. Do not create sampling work when creating an obligation.
- A sampling recommendation is not a fence-wide obligation update permission. It must carry or resolve to its intended immutable obligation association before `sampling_passed` or `sampling_failed` can update a disposition. Other same-fence obligations remain unchanged unless they are explicitly in that association.
- At one card content/evidence fence, allow at most one open primary work item and at most one open sampling item. `active` may have sampling only; `pending_operator` may have one primary item only; `suppressed`, `archived`, and `rejected` retain no open work.
- Reuse `transitionKnowledgeCard` / `transitionKnowledgeCardInTransaction` in `packages/database/src/knowledge-lifecycle.ts` as the sole writer for card lifecycle, verification requirement, recommendations, candidate-card association, lifecycle audit, and lifecycle-driven search invalidation. It returns `resolved`, `stale`, or `invalid`; a stale result has zero partial effects.
- Current defects to replace, not preserve: `sampling_passed` is incorrectly included in the publish/support gate; generic `sampling_failed` currently performs a single-card transition/risk requeue without sealing a cohort; and sampling-resolution updates can target all unresolved obligations at a shared card fence. Normal sampling outcomes and high-severity containment need explicit, separately scoped contracts.
- Preserve database candidate-decision immutability, source-removal/candidate lease fencing, `system-knowledge-pipeline` attribution for automated work, current evidence eligibility, and projection invalidation/index queue primitives. Never let sampling expose raw capture/provider material.

### Project Structure Notes

- Primary lifecycle/domain seams: `packages/domain/src/knowledge-lifecycle.ts` and `packages/database/src/knowledge-lifecycle.ts`.
- Reuse, do not duplicate: `packages/database/src/knowledge-recommendations.ts` (`shouldSampleKnowledgeCard`, policy stub, recommendation adapters), `packages/database/src/admin-quality.ts`, `packages/database/src/admin-knowledge-coverage.ts`, `packages/database/src/schema.ts`, and the existing policy/cohort tables.
- Worker ownership belongs under `packages/worker-domain/src/features/knowledge/` and must be registered through the existing Worker package exports/runtime adapters. API controllers/domain ports may authorize an explicit policy seal or an operator sampling resolution, never selection/job execution; `apps/admin` remains direct-API presentation only.
- Likely regression seams: `tests/knowledge-recommendation-queue.test.ts`, `tests/knowledge-lifecycle-transition-matrix.test.ts`, `tests/knowledge-lifecycle-writer-boundary.test.ts`, `tests/admin-knowledge-coverage.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, and a new `tests/public-mvp-quality-dashboard.test.ts` for obligation-ledger/readiness semantics.

### Verification

```bash
pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts
pnpm test:integration -- tests/knowledge-lifecycle-transition-matrix.test.ts
pnpm test:integration -- tests/knowledge-lifecycle-writer-boundary.test.ts
pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts
pnpm test:integration -- tests/admin-knowledge-coverage.test.ts
pnpm test:integration -- tests/public-mvp-quality-dashboard.test.ts # create in this story
pnpm typecheck
pnpm lint
pnpm build
pnpm test:integration
pnpm exec drizzle-kit check
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Sampling]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Recommendations The Actionable Operator Work Queue]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Ownership]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Matrix]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.5]
- [Source: _bmad-output/implementation-artifacts/15-2-complete-candidate-processing-and-technical-job-accounting.md#AI-First Discovery and Relation Semantics]
- [Source: _bmad-output/implementation-artifacts/15-3-centralize-version-fenced-lifecycle-transitions.md#Dev Notes]
- [Source: _bmad-output/implementation-artifacts/15-4-enforce-evidence-safe-retrieval-and-source-removal.md#Completed-Story Intelligence]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-08-04: Created from the completed target-only 15.1-15.4 baseline. The guide preserves the AI-first rule that sampling is quality monitoring, not a publication gate: completed `needs_operator` candidates retain their immutable decision, create one non-actionable obligation, and may later publish through normal evidence-valid primary resolution.
- 2026-08-04: Required containment is explicitly cohort-scoped, version-fenced, and transaction-atomic through the sole lifecycle boundary; remediable cards receive one risk item while unsafe cards suppress without successor work.
- 2026-08-04: Implemented immutable, database-protected sampling obligations and recommendation-to-obligation scoping. Normal sampling outcomes now resolve quality work without publishing or changing card lifecycle.
- 2026-08-04: Added sealed auto-active cohort selection in the Worker runtime and explicit atomic high-severity containment through the lifecycle writer. Serial integration passed 42 files/368 tests; typecheck, Drizzle check, lint (0 errors, 51 existing warnings), build, and diff check passed.

### File List

- _bmad-output/implementation-artifacts/15-5-separate-actionable-work-from-quality-sampling.md
- apps/worker/package.json
- apps/worker/src/runtime.ts
- drizzle/migrations/0040_protect_sampling_obligations.sql
- drizzle/migrations/meta/_journal.json
- packages/contracts/src/index.ts
- packages/database/src/knowledge-lifecycle.ts
- packages/database/src/knowledge-recommendations.ts
- packages/database/src/schema.ts
- packages/domain/src/knowledge-lifecycle.ts
- packages/worker-domain/src/adapters.ts
- packages/worker-domain/src/features/knowledge/recommendations.ts
- packages/worker-domain/src/index.ts
- tests/knowledge-lifecycle-transition-matrix.test.ts
- tests/knowledge-recommendation-queue.test.ts

### Change Log

- 2026-08-04: Implemented Story 15.5 separated quality sampling lifecycle and verification coverage.
