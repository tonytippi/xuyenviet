# Epic 15 Context: Trustworthy Knowledge Lifecycle Cutover

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Replace the overlapping Knowledge lifecycle representation with one auditable, version-fenced target model so operators can resolve evidence-grounded knowledge safely and travelers can retrieve only currently supported active cards. This disposable-target cutover prevents contradictory state, stale work, and stale search projections from changing or exposing knowledge while retaining the existing direct API and Worker responsibility boundaries.

## Stories

- Story 15.1: Establish the Target Lifecycle Schema
- Story 15.2: Complete Candidate Processing and Technical Job Accounting
- Story 15.3: Centralize Version-Fenced Lifecycle Transitions
- Story 15.4: Enforce Evidence-Safe Retrieval and Source Removal
- Story 15.5: Separate Actionable Work from Quality Sampling
- Story 15.6: Deliver Target-Shaped Operator Knowledge Views
- Story 15.7: Prove the Lifecycle Transition Matrix

## Requirements & Constraints

- This is a clean break for disposable targets: apply one forward-only target migration, reset, and reseed. Remove legacy lifecycle fields, runtime paths, fixtures, and contracts. Do not backfill, dual-write, retain compatibility behavior, or introduce a release matrix. Stop and obtain an approved expand-migrate-contract plan if targets become durable or shared.
- A card has exactly one lifecycle state: `draft`, `pending_operator`, `active`, `suppressed`, `archived`, or `rejected`. Keep domain classification separate as `community_observation`, `community_pattern`, `conditional`, or `conflicted`; keep verification requirement separate as `none`, `operator_required`, or `failed`. Independent corroboration is derived from eligible evidence with distinct independence keys, not from an operator decision.
- Only an `active` card with `verification_requirement = none`, permitted domain classification, current eligible traveler-safe supporting evidence, and complete retrieval metadata may enter normal retrieval. All missing, stale, disabled, operator-only, non-active, failed-verification, or conflicted cases fail closed. Retrieval must recheck current owner-row eligibility so index lag cannot re-enable prohibited content.
- Candidate processing and job execution are independent. Completed candidates retain immutable `apply`, `needs_operator`, or `discard` AI disposition and reason; failed candidates retain neither business value. Jobs use only `queued`, `running`, `completed`, or `failed` technical status and complete only after terminal discovery and all candidates are completed or failed. Candidate counters are transactional idempotent observability projections, never lifecycle or retrieval authority.
- Actionable operator work has `open`, `resolved`, or `superseded` status and exact card content/evidence fences. A card version may have at most one open primary item (`verification`, `relation`, `risk`, or `missing_context`) and one open `sampling` item. An active card has no open primary work.
- Every completed `needs_operator` candidate creates one immutable sampling obligation. Sampling is quality control, not a publication gate. Before high-severity containment, persist the exact cohort and card/version membership; requeue remediable cards with fenced risk work or suppress and de-index unsafe cards without successor work.
- Source withdrawal or loss of final eligible support must immediately remove traveler eligibility, re-evaluate every dependent card, disable projections atomically, and complete only once removed evidence cannot be retrieved. Preserve only traveler-safe information in read models and never expose raw capture text, raw provider output, unapproved quotes, checkpoints, fences, or execution secrets.

## Technical Decisions

- `transitionKnowledgeCard` is the only production writer for card lifecycle, verification requirement, recommendation state, candidate-to-card completion association, lifecycle audit, and lifecycle-driven search invalidation. It accepts a named trigger, actor, expected fences, and transaction; acquires required advisory/row locks; applies the approved matrix; and returns typed `resolved`, `stale`, or `invalid` outcomes.
- Enforce row-local lifecycle and candidate rules with database checks, completed-candidate decision immutability with a database trigger, and open-work cardinality with partial unique indexes. Enforce cross-table state, evidence, work, audit, and projection effects through the transactional lifecycle command.
- The Worker solely owns continuous ingestion, job claims, conflict processing, indexing, and sampling selection using existing lease, fencing, compare-and-swap, and idempotency protocols. Authenticated API commands may synchronously execute authorized operator decisions but never claim jobs or run ingestion/index loops. `apps/admin` is presentation-only and must not import database code or lifecycle commands.
- A lifecycle transition atomically updates the card, evidence/work effects, concise audit record, and dirty/index invalidation. Indexing is idempotent by card and content version; disabled or ineligible cards cannot regain eligibility from a delayed projection.
- API contracts, direct-admin projections, retrieval/search, source removal, seeds, fixtures, and tests use the target representation only. Preserve the existing NestJS session, CSRF, origin, request-ID, authorization, and safe-error boundary.

## UX & Interaction Patterns

- Authorized operators use direct `/v1/admin/knowledge/*` APIs to inspect technical job status/counters, candidate processing/disposition/reason, card lifecycle/classification/verification, and work type/status/resolution as distinct concepts. Mixed candidate results must not be presented as a rolled-up publication label.
- Operator review presents the current fact, conditions, bounded evidence, states, reasons, and versioned work context, then offers explicit supported resolutions. Low-risk active cards are not presented as awaiting approval.
- Admin views remain separate from traveler surfaces, are desktop-optimized for dense work, use safe error handling, and do not expose raw source or provider material.

## Cross-Story Dependencies

- Story 15.1 establishes the target schema, constraints, contracts, reset/reseed, seeds, and fixtures required by all later stories.
- Story 15.2 provides immutable candidate outcomes and technical job semantics used by lifecycle transitions and operator projections.
- Story 15.3 supplies the sole mutation boundary required by evidence removal, sampling containment, API decisions, and Worker flows.
- Story 15.4 and Story 15.5 rely on that boundary for atomic retrieval, source-removal, work, sampling, audit, and index behavior.
- Story 15.6 depends on target-shaped contracts and direct NestJS API ownership established by the completed Epic 14 boundary. Story 15.7 verifies the complete schema, command, API, Worker, and admin contract.
