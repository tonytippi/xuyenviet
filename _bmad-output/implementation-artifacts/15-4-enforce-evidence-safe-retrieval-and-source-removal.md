# Story 15.4: Enforce Evidence-Safe Retrieval and Source Removal

Status: ready-for-dev

## Story

As a traveler, I want only supported current knowledge used in answers, so that withdrawn or unsupported facts cannot remain available through stale projections.

## Acceptance Criteria

1. A card without validated-span, eligible source/capture, and required retrieval metadata cannot become or remain retrievable; retrieval fails closed despite an old search document.
2. Losing final eligible supporting evidence atomically disables projection and transitions through the matrix, with follow-up work only where target state permits it.
3. Retryable source removal locks dependent evidence/cards, immediately removes traveler eligibility, re-evaluates every card, and completes only when removed evidence is not traveler eligible.
4. Indexing stays idempotent by card/version and delayed indexing cannot re-enable prohibited content.

## Tasks / Subtasks

- [ ] Start from Story 15.1's target-only schema, Story 15.2's durable AI-first discovery/candidate accounting, and Story 15.3's sole lifecycle writer. Do not add a migration, legacy field, fallback read, compatibility fixture, alternate lifecycle writer, or a second ingestion/index loop. (AC: 1-4)
- [ ] Make every traveler-facing retrieval path use one complete target eligibility predicate, extending existing state-policy/read-model seams rather than duplicating checks. A factual premise requires `lifecycle_state = active`, `verification_requirement = none`, permitted non-conflicted classification/use policy, complete safe card metadata, active supporting evidence, validated non-empty code-point span/quote, eligible source, current eligible capture with retained payload, traveler-safe source metadata, and required retrieval metadata. Missing, stale, disabled, operator-only, failed-verification, unsupported, or conflicted data fails closed even if a search document exists. (AC: 1)
- [ ] Preserve the Story 15.2 AI-first pipeline: Worker-owned discovery and relation judgment remain the only automated path; candidate AI disposition/reason are immutable; job counters/status are technical observations only. Retrieval and removal must never reinterpret `apply`, `needs_operator`, or `discard`, treat a job status as publication state, or expose raw capture/provider material. (AC: 1-3)
- [ ] Route evidence invalidation, source/capture ineligibility, and final-support loss through `transitionKnowledgeCard` with current card fences and the same transaction. Let the command select the approved matrix outcome, atomically disable current projection, supersede prohibited work, enqueue only the current version, and write lifecycle audit effects. Do not directly update card lifecycle, verification requirement, recommendation state, lifecycle audit, or lifecycle-caused dirty markers. (AC: 2)
- [ ] Consolidate existing removal entrypoints around the canonical retryable Knowledge removal command. Protected API/admin intake delegates after existing authorization, CSRF, and validation; `removeKnowledgeSource` and `withdrawKnowledgeEvidence` retain Knowledge/Worker-domain ownership. Preserve advisory-lock order, provenance-withdrawal backfill gate, provenance redaction, source/capture payload scrubbing, actor attribution, and completion audit. `apps/admin` remains a direct API presentation client and imports neither database nor Worker/domain commands. (AC: 2-3)
- [ ] Make removal idempotent and resumable without a second protocol. Lock source, evidence, provenance anchors, and dependent cards in established deterministic order; revoke source/evidence eligibility before completion; re-evaluate every card at its current fence; and return `completed` only when no removed evidence remains traveler eligible. A duplicate/remedial call is safe; a stale fence/claim leaves card, evidence, work, audit, provenance, dirty-marker, and projection effects unchanged together. (AC: 3)
- [ ] Update the existing indexing queue/Worker and backfill path to recompute target eligibility from current owner rows before writing or retaining a document. Preserve existing lease, fencing-token, content-version, and marker idempotency rules; an old/delayed claim must never activate a stale or newly prohibited document. API requests must not claim or run indexing work. (AC: 4)
- [ ] Add serial PostgreSQL integration coverage for target retrieval eligibility, final-support loss, source/evidence withdrawal, provenance safety, retries, duplicate delivery, stale fences, concurrent ingestion/removal ordering, and delayed index claims. Each clean-table suite calls `resetTestDatabase()` locally and uses `DATABASE_URL_TEST`; do not add a global reset hook or integration parallelism. (AC: 1-4)

## Dev Notes

### Completed-Story Intelligence

- Story 15.2 is complete. `runKnowledgeIngestionPipeline` performs Worker-owned durable AI-first discovery from an immutable current capture before `discoveryTerminal`; it validates Unicode code-point spans and persists candidates idempotently by `(ingestionJobId, fingerprint)`. Candidate relation processing uses bounded system-owned shortlist context, validates AI output, and delegates durable card/evidence/work effects to `transitionKnowledgeCard`.
- A completed candidate's `aiDisposition` and `outcomeReasonCode` are immutable evidence of the AI decision. `apply`, `needs_operator`, and `discard` are not retrieval labels; `failed` is technical and retains neither business value. Job `queued|running|completed|failed` plus counters are technical execution/accounting only, never evidence or publication authority.
- Story 15.3 is complete. `transitionKnowledgeCard` in `packages/database/src/knowledge-lifecycle.ts` is the only production writer for lifecycle state, verification requirement, recommendation lifecycle, candidate-card association, lifecycle audit, and lifecycle-caused index invalidation. It returns typed `resolved`, `stale`, or `invalid`; stale outcomes must have no partial effects.
- Reuse its `support_loss` trigger after evidence/source eligibility changes under the same transaction and current card fence. The matrix requires final eligible-support loss to suppress an active card, supersede open work, and disable its projection. Do not add a direct suppression, recommendation, audit, or dirty-marker shortcut.

### Retrieval And AI-First Safety

- `evaluateKnowledgeTravelerPolicy` in `packages/database/src/knowledge-state.ts` is the card-state policy seam. Extend/reuse it and `packages/database/src/knowledge-search.ts`; do not create an unconnected parallel predicate. The final query must also verify current evidence/source/capture/span facts, because a policy evaluated from a stale projection is insufficient.
- `approved-knowledge.ts`, source-bundle construction, answer freshness, search, and provenance/detail projections are traveler-read seams. A source-bundle item must originate only from the complete target predicate. Prompt formatting is defense in depth, not authorization to use a row admitted incorrectly by retrieval.
- Preserve trust/ranking thresholds, independent-corroboration semantics, source labels, and policy wording. This story tightens ownership and fail-closed evidence eligibility; it does not make raw, operator-only, Facebook, provider, or unapproved evidence traveler-visible and does not change AI extraction/judgment policy.
- A stale search document has no authority. Retrieval must join it to current owner rows and reject mismatched content versions, disabled/stale documents, non-active cards, non-`none` verification requirement, conflicted/unsupported policy, invalid or removed evidence, ineligible/withdrawn source, non-current or scrubbed capture, invalid span/quote, or incomplete retrieval metadata.

### Source Removal And Indexing

- Existing `packages/worker-domain/src/features/knowledge/source-removal.ts` already performs provenance-backfill gating, deterministic provenance-anchor locking, source/evidence/card locking, `withdrawAssistantProvenance`, source/capture payload scrubbing, and audit. Preserve those behaviors while making retry/completion semantics and lifecycle delegation target-safe.
- Keep the established source/removal lock ordering. Ingestion serializes candidate publication with the source advisory lock and validates current source/capture/payload before candidate completion. A source removal racing an AI-first candidate must make obsolete Worker work return safely without changing a card, immutable outcome, job accounting, audit, or index state.
- Reuse `enqueueKnowledgeIndexWork` and `disableStaleKnowledgeSearchProjection` from `packages/database/src/knowledge-indexing-queue.ts`; lifecycle effects stay transaction-coupled. `packages/worker-domain/src/features/knowledge/indexing-worker.ts` owns continuous claims, lease recovery, retries, and backfill. It must derive projection eligibility from authoritative current rows at projection time, not a previously claimed marker or prior AI outcome.
- No new API endpoint, UI, BFF/proxy, Worker runtime, external service, environment variable, or migration is required unless direct inspection proves an existing target contract cannot represent the needed retry state. If so, document the concrete gap before adding a second removal lifecycle.

### Project Structure Notes

- Update only established ownership seams as needed:
  - `packages/database/src/knowledge-state.ts`, `knowledge-search.ts`, `approved-knowledge.ts`, `source-bundle.ts`, and related retrieval/provenance readers for the target eligibility predicate.
  - `packages/database/src/knowledge-lifecycle.ts` and `knowledge-indexing-queue.ts` only for a demonstrated missing target-safe transition/effect; retain their existing ownership.
  - `packages/worker-domain/src/features/knowledge/source-removal.ts` and `indexing-worker.ts` for canonical removal and current-row projection checks.
  - Existing protected API/action adapters only to delegate to the canonical command after current admission controls. Do not introduce direct database imports in `apps/admin`.
- Primary tests: `tests/knowledge-search.test.ts`, `tests/knowledge-source-removal.test.ts`, `tests/knowledge-source-removal-action.test.ts`, `tests/knowledge-indexing-worker.test.ts`, plus focused lifecycle/ingestion regressions where a source-removal race crosses the Story 15.2/15.3 boundary.

### Verification

```bash
pnpm test:integration -- tests/knowledge-search.test.ts
pnpm test:integration -- tests/knowledge-source-removal.test.ts
pnpm test:integration -- tests/knowledge-source-removal-action.test.ts
pnpm test:integration -- tests/knowledge-indexing-worker.test.ts
pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts
pnpm test:integration -- tests/knowledge-lifecycle-transition-matrix.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Cross-Table Guarantees]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Clean-Break Migration]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Ownership]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Matrix]
- [Source: _bmad-output/implementation-artifacts/15-2-complete-candidate-processing-and-technical-job-accounting.md#AI-First Discovery and Relation Semantics]
- [Source: _bmad-output/implementation-artifacts/15-3-centralize-version-fenced-lifecycle-transitions.md#Dev Notes]
- [Source: _bmad-output/implementation-artifacts/epic-15-context.md#Technical Decisions]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-08-04: Created and validated after Story 15.2 completed durable AI-first candidate discovery, immutable technical outcomes, and transactional job accounting, and Story 15.3 completed the version-fenced lifecycle writer boundary. Implementation must reuse those seams to fail closed on current evidence/source/capture eligibility, source removal, and delayed indexing.

### File List

- _bmad-output/implementation-artifacts/15-4-enforce-evidence-safe-retrieval-and-source-removal.md
