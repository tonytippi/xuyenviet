# Story 11.2: Withdraw Historical Provenance Safely

Status: ready-for-dev

## Story

As a traveler,
I want removed or withdrawn sources to disappear from past answer details,
so that old links, quotes, and derived facts are not presented as still usable.

## Acceptance Criteria

1. **Given** Knowledge removes or withdraws a source or evidence record, **when** its retryable source-removal command commits, **then** it identifies linked assistant provenance by source, evidence, and card references; marks each row `withdrawn` with timestamp and safe reason; redacts traveler URL, quote, and quick-fact snapshot fields; and invalidates dependent annotations. **And** the transaction is idempotent and audit records only safe identifiers/counts.
2. **Given** a traveler opens provenance or a detail view for a withdrawn row, **when** the read model renders it, **then** it returns only a localized unavailable marker with no source URL, quote, derived fact, or executable action. **And** an annotation whose final required provenance row is withdrawn is omitted while an independently valid answer-local annotation remains available.
3. **Given** historic answers predate the withdrawal contract, **when** source-removal cutover is prepared, **then** a backfill safely identifies and redacts their provenance before source hiding/deletion is enabled. **And** a source-removal command fails closed rather than deleting evidence if any affected answer cannot be safely identified and redacted.

## Tasks / Subtasks

- [ ] Add first-class withdrawn provenance availability and an executable forward-only cutover (AC: 1, 3)
  - [ ] Extend `assistant_response_provenance` with availability (`available | withdrawn`), `withdrawnAt`, and a bounded safe withdrawal reason. Preserve `verificationStatus`; availability is a separate concern.
  - [ ] Add only a new forward Drizzle migration and schema/journal entry. Do not modify applied migrations, especially `0013`; preserve Story 11.1's `0017`/`0018` forward-migration and direct-project-delete guarantees.
  - [ ] Add AI-Orchestration-owned durable state `assistant_provenance_withdrawal_backfill_state` with singleton contract key `v1`, immutable `cutoverAt`, compound checkpoint `{ cursorCreatedAt, cursorId }`, `completedAt`, `failedAt`, and bounded `failureCode`; include it in the forward migration. `assistant_response_provenance.id` is random UUID text and is not a monotonic cursor. `completedAt` means every pre-cutover provenance row was scanned under the v1 classifier with no unresolved row, not merely that a job was invoked.
  - [ ] The forward migration initializes `v1.cutoverAt` from one database `transaction_timestamp()` while adding default-available columns. The backfill population is fixed to rows with `created_at < cutoverAt`, plus any row inserted by the migration transaction before the state initialization if applicable. New post-cutover rows receive `available` by schema default and are handled synchronously by withdrawal commands; they are not silently included in or allowed to race the historic scan.
  - [ ] Treat cutover as an explicit compatibility gate, not an online best-effort migration: before the migration begins, verify and record that every old runtime capable of terminal or evaluation provenance persistence is drained/quiesced and cannot accept new work; wait for all in-flight AI finalizations to terminalize or be safely fenced/discarded. Only then deploy the compatible runtime containing the coordinated writer, run the migration, and resume traffic. Do not capture `cutoverAt` while an old provenance writer can still commit.
  - [ ] During the migration, obtain the provenance-cutover transaction advisory lock and an `ACCESS EXCLUSIVE` lock on `assistant_response_provenance` before `cutoverAt`/state initialization, then commit the state and schema together. Runtime admission is a release precondition from this story; Epic 12 owns generalized deployment automation, not permission to bypass this required gate.
  - [ ] Implement an explicit bounded in-repository maintenance command `backfillHistoricalAssistantProvenanceWithdrawal({ batchSize? })`, callable synchronously by an operator/test and not dependent on new Epic 12 scheduling infrastructure. Under the singleton state lock, it scans only the fixed pre-cutover population in deterministic `(created_at ASC, id ASC)` order, resumes strictly after the durable compound checkpoint, commits each bounded batch with its checkpoint, writes only safe counts/IDs/reason codes to audit/reporting, and retries a failed batch from the unchanged checkpoint.
  - [ ] The v1 classifier supports only exact, parsed historical anchors: `sourceReferenceType === "knowledge_card"` with a nonblank `sourceReferenceId`; `sourceSnapshot.knowledgeCardId`; `sourceSnapshot.evidence[]` objects with nonblank `sourceId` and/or `evidenceId`; and the existing bounded legacy `sourceSnapshot.sources[]` objects with a nonblank exact source ID. It does not use titles, URLs, quotes, mutable eligibility, or substring matching as evidence of identity.
  - [ ] For every identifiable row, compare its exact anchors to current withdrawn source/evidence/card relationships and atomically apply the same withdrawn/redacted projection when matched. A knowledge provenance row with no valid v1 anchor, malformed anchor shape, or an anchor that cannot be resolved to its required current owner relation is `unclassifiable`: persist a bounded failure code, do not advance past it, and leave `completedAt` null.
  - [ ] Admission to every destructive source/evidence withdrawal requires `v1.completedAt` and no failure. Before that condition, return a safe `withdrawal_backfill_required`/`withdrawal_backfill_failed` operational result and change no eligibility, evidence, card, payload, provenance, annotation, or audit-completion state. A previously withdrawn source must be remediated through this command before its idempotent result is permitted.
  - [ ] Make the database-layer `persistAssistantAnswerProvenance` function (or a required transaction-local wrapper at that same boundary) the sole coordinated provenance insertion boundary. Its `ProvenanceDb` transaction interface must support the shared advisory/row locks and current-state checks; callers may not write `assistant_response_provenance` directly or bypass the wrapper.
  - [ ] Require both current writer paths to use this boundary: fenced terminal persistence in `packages/database/src/ai-ask-stream-execution.ts` and evaluation-answer persistence in `src/features/ai/evaluation-answer.ts`. Under its locks it rechecks each exact source/evidence/card anchor against current owner state; if an anchor is already withdrawn/removed, it writes the exact withdrawn/redacted variant instead of an available snapshot. This applies regardless of `created_at`, so a transaction that began before the migration but inserts later cannot create an unscanned available historic row after `v1.completedAt`.
- [ ] Make the existing Knowledge source-removal transaction withdraw historical answer provenance atomically (AC: 1, 3)
  - [ ] Extend `removeKnowledgeSource` in `src/features/knowledge/source-removal.ts`; do not create a competing deletion/removal writer.
  - [ ] Retain its source advisory lock, card lock ordering, card re-evaluation, indexing work, idempotent result contract, and source/capture payload scrubbing behavior.
  - [ ] Introduce one shared transaction-local coordination helper used by provenance finalization, `removeKnowledgeSource`, and `withdrawKnowledgeEvidence`. Given exact source/evidence/card anchors, it acquires advisory locks in global sorted groups: source IDs with namespace `44`, evidence IDs with a new dedicated namespace, then card IDs with namespace `46`; it then locks matching provenance rows and affected message rows. No caller may lock a later group before it has completed the prior group.
  - [ ] Before inserting `assistant_response_provenance`, finalization extracts the exact anchors from the source bundle, takes the same helper locks, rechecks `sources.eligibility`, evidence state, and card/source relation, and writes only available snapshots for still-eligible anchors. If a removal wins first, finalization must write the redacted withdrawn variant (or fence/discard under the existing terminal transaction if the answer cannot remain valid); it must never insert an available row after the removal transaction's provenance scan.
  - [ ] Before source eligibility/evidence state changes and always before raw capture/source payload scrubbing, identify and lock affected provenance rows through all three paths: historical `sourceSnapshot.evidence[*].sourceId`; historical `sourceSnapshot.evidence[*].evidenceId`; and `sourceReferenceType = knowledge_card` / `sourceReferenceId` intersecting affected card IDs.
  - [ ] In the same transaction, mark each match withdrawn, set timestamp and safe reason, replace/redact its snapshot to the bounded unavailable shape, and invalidate only annotations whose persisted provenance dependencies require a withdrawn row. Use an exact parsed JSON structure for annotation dependencies, never ID substring matching.
  - [ ] Re-evaluate `already_completed`: it may return only after the completed withdrawal/remediation state is verified. A prior partial removal must not hide unredacted historical provenance.
  - [ ] Retain unrelated historical provenance even where a card remains independently supported; answer-time provenance naming the removed source/evidence is still withdrawn.
  - [ ] Keep the removal audit aggregate-safe: source/card/provenance counts and IDs/reason code only. Never serialize snapshot JSON, URL, quote, title, raw text, source payload, or unbounded failure detail.
- [ ] Define the evidence-withdrawal boundary and route it through the same remediation transaction (AC: 1, 3)
  - [ ] Add one explicit Knowledge command in the source-removal module for destructive evidence withdrawal, e.g. `withdrawKnowledgeEvidence({ evidenceId, reason, actor })`. It locks the source (source lock key 44), then every affected card (key 46), the evidence row, sorted provenance rows, and affected assistant-message annotation rows; it returns an idempotent completed/already-completed result with safe IDs/counts.
  - [ ] Both source and evidence commands use the shared global source/evidence/card lock ordering before their existing row locks. They must not scan and update provenance while a finalization can still pass an uncoordinated eligibility check.
  - [ ] This command must invoke the shared provenance/annotation withdrawal helper in the same transaction before setting the selected evidence `removed`, suppressing/reindexing a card, or hiding any linked capture/source payload. It matches the selected evidence ID directly, the evidence source ID, and affected card IDs; unrelated historical rows remain available.
  - [ ] `resolve_relation` conflict disposal in `recommendations.ts` and retention/cap trimming in `ingestion-pipeline.ts` are non-destructive evidence lifecycle transitions, not withdrawal commands. They must remain explicit `removed` state changes without historical redaction unless a caller deliberately invokes the new withdrawal command with an accepted removal reason. Do not silently make pipeline retention trim erase historic traveler provenance.
  - [ ] Map only bounded destructive reasons (`withdrawn`, `inaccessible`, `removed`) into the shared safe withdrawal reason. Reject any other reason at the command boundary; neither caller-provided prose nor recommendation rationale enters provenance, audit, or user-visible output.
- [ ] Project withdrawn provenance safely at every current read and annotation seam (AC: 2)
  - [ ] Define `AssistantMessageProvenanceItem` as an explicit discriminated union. An available item retains the current safe fields and has `availability: "available"`. A withdrawn item is exactly `{ id, rank, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt, citedInAnswer }`; it has no category, title, source type, URL, checked date, confidence, conditions, evidence, quick facts, derived fact, source/card identity, or executable capability.
  - [ ] Make `packages/database/src/provenance.ts` format every `withdrawn` row only as that exact withdrawn variant, regardless of historic snapshot contents. The formatter is authoritative for history, terminal responses, and outbox annotation inputs; consumers must narrow on `availability` rather than rely on nullable hidden fields.
  - [ ] Preserve compatibility handling for older provenance snapshot vocabularies (`verified_fact` and `verified`) for rows that remain available.
  - [ ] Extend `getOwnedConversation` in `src/features/chat-trips/conversations.ts` to select availability metadata with the owner-scoped provenance read and pass formatted withdrawn items into annotation sanitization.
  - [ ] Harden `sanitizeStoredAnswerAnnotations` and descriptor validation in `src/features/ai/answer-annotations.ts`: omit an annotation when any final required provenance dependency is withdrawn; retain a valid source-free answer-local `warning` or `trip_fact`; do not turn unavailable provenance into new source detail.
  - [ ] Harden `src/features/ai/domain-outbox-worker.ts` so it selects availability under the existing locks and cannot generate, persist, or resurrect a source-backed annotation after withdrawal between terminal persistence and delayed/retried delivery.
  - [ ] Defend in depth in `AssistantProvenanceBlock` in `src/features/ai/ai-ask-composer.tsx`: the withdrawn variant renders the exact unavailable label as non-interactive text and exposes no selection button, detail descriptor, URL, evidence quote, quick fact, category, confidence, or action. Client behavior is not the authority; its server payload must already be redacted.
- [ ] Prove removal, historic cutover, read-time safety, and delayed-work regressions (AC: 1-3)
  - [ ] Extend `tests/knowledge-source-removal.test.ts` with source-ID, evidence-ID, and card-reference provenance matches; unrelated provenance preservation; atomic rollback/fail-closed behavior; retry/idempotency; snapshot redaction; annotation invalidation; and audit non-disclosure assertions.
  - [ ] Extend `tests/ai-ask-shell.test.ts` and focused provenance formatting coverage for owner-visible historic output containing only the unavailable marker, with no old URL, quote, quick fact, title, source action, or cross-user disclosure. Prove independently valid source-free annotations remain.
  - [ ] Extend `tests/chat-trip-context-extraction.test.ts` or the focused outbox suite for removal after terminal answer persistence and before annotation delivery; delayed/retried delivery must not restore a withdrawn dependency.
  - [ ] Add focused maintenance-command tests for deterministic checkpointing, all supported historical anchor shapes, already-withdrawn sources, malformed/unresolvable provenance, partial batch failure/retry, and removal admission before/after `v1.completedAt`. Add evidence-withdrawal tests that distinguish destructive withdrawal from recommendation conflict disposal and ingestion retention trimming.
  - [ ] Add concurrency regressions for source/evidence withdrawal racing both fenced AI Ask terminal finalization and `evaluation-answer.ts` persistence. In both interleavings, prove the completed removal leaves no newly inserted available provenance snapshot or annotation with the withdrawn URL/quote/quick facts.
  - [ ] Retain Story 11.1 regression coverage in `tests/answer-context.test.ts`: exact renderer-owned prompt ledgers, capped knowledge-card accounting, immutable source-bundle snapshots, fenced terminal persistence, and project/conversation deletion cleanup.
  - [ ] Run PostgreSQL-backed focused suites serially, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, migration/schema verification appropriate to the approved compatibility path, and `git diff --check`. Record actual outcomes only after implementation.

## Dev Notes

### Architecture And Ownership

- **AD-11 and AD-20 remain authoritative.** Traveler source/confidence UI derives from stored row-per-source provenance, and persisted annotations are validated against owned assistant text and provenance. Do not parse answer prose or create a parallel mutable detail state. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Provenance Contract`; Source: `src/features/ai/answer-annotations.ts`]
- **AD-18/AD-34 remain authoritative.** Knowledge owns retryable source removal; AI Orchestration owns assistant provenance; background annotation work is transactional-outbox work. Use the existing transaction and fencing/claim paths rather than a second removal or annotation invalidation protocol. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-18: Knowledge Is An Immutable Source-to-Card Pipeline`; Source: `src/features/ai/domain-outbox-worker.ts`]
- **AD-36 is the direct Story 11.2 decision.** `assistant_response_provenance` must record `available | withdrawn`, a withdrawal time, and safe reason. Withdrawal matches source/evidence/card references; it redacts traveler snapshots and invalidates annotations transactionally. Historical rows require backfill before destructive source removal, which fails closed for unsafe linkage. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-36: Withdrawable Historical Provenance And Safe Detail Projections`]
- **Story 11.1 is a completed dependency, not scope to rework.** Preserve the exact prompt-use ledger, immutable answer-context snapshot references, command fences, forward-only migration discipline, and conversation/project deletion cleanup. Do not modify applied migration `0013` or reintroduce substring prompt-use inference. [Source: `_bmad-output/implementation-artifacts/11-1-publish-canonical-trip-answer-context-snapshots.md#Final Bounded Repair`]

### Current Implementation And Required Evolution

| File | Current state to preserve | Story 11.2 evolution |
| --- | --- | --- |
| `src/features/knowledge/source-removal.ts` | A single transaction takes source/card locks, withdraws source/evidence, re-evaluates cards/indexing, scrubs capture/raw payloads last, audits safely, and returns idempotently for withdrawn sources. | Add locked provenance/annotation remediation before any destructive payload scrub. Verify remediation before `already_completed`; fail closed if historical linkage/redaction is unsafe. |
| `src/features/knowledge/recommendations.ts` and `src/features/knowledge/ingestion-pipeline.ts` | They can mark conflicting or capped evidence `removed` while resolving relations or retaining bounded evidence. | Preserve those non-withdrawal lifecycle paths. Route only an explicit destructive evidence-withdrawal command through the shared provenance-remediation transaction. |
| new AI-Orchestration provenance-backfill maintenance module | No current durable withdrawal-remediation checkpoint exists. | Add the bounded `v1` command/state contract: deterministic ID cursor, complete/failure state, exact anchor classifier, safe reporting, and source/evidence-removal admission gate. |
| `packages/database/src/schema.ts` and `drizzle/migrations/` | Provenance has bounded `sourceSnapshot`, source-reference indexing, verification state, Story 11.1 snapshots, and forward migrations. | Add availability/withdrawal fields, constraints/indexes, and a forward-only migration/backfill cutover compatible with durable/runtime-overlap policy. |
| `packages/database/src/provenance.ts` | Builds knowledge snapshots containing evidence source/evidence IDs and formats stored snapshots into traveler-visible title, URL, date, conditions, and evidence. | Make availability-aware formatting the central non-disclosure boundary. Withdrawn rows must have only the localized unavailable projection, regardless of stored historic snapshot content. |
| `packages/database/src/ai-ask-stream-execution.ts` and `src/features/ai/evaluation-answer.ts` | Both persist AI answer provenance through `persistAssistantAnswerProvenance`; the former is fenced terminal persistence and the latter is the evaluation answer transaction. | Both must use the mandatory coordinated insertion boundary; neither may insert available provenance after removal wins its shared locks. |
| `src/features/chat-trips/conversations.ts` | Loads owner-scoped provenance and sanitizes persisted annotations against formatted provenance. | Select availability fields and ensure the unavailable projection reaches every historic read and annotation sanitization path. |
| `src/features/ai/answer-annotations.ts` | Validates/sanitizes persisted descriptors using provenance existence and supports source-free answer-local annotation types. | Treat withdrawn provenance as ineligible; invalidate dependent descriptors while retaining valid source-free answer-local warnings/trip facts. |
| `src/features/ai/domain-outbox-worker.ts` | Locks final assistant/provenance state before annotation generation and rechecks fences before write. | Select and enforce current availability at both reads so retries cannot recreate withdrawn annotations. |
| `src/features/ai/ai-ask-composer.tsx` | Renders stored provenance details, links, quotes, and selectable descriptors. | Render unavailable rows without any interactive/detail/link/evidence surface as defense in depth. |

### Data, Security, And Concurrency Guardrails

- Never reconstruct historic linkage from mutable current `knowledge_cards` or evidence eligibility. The provenance snapshot is the answer-time record; match direct source IDs, evidence IDs, and card references.
- Current owner relations are used only to validate an already-extracted exact anchor. They must never turn titles, URLs, quotes, current eligibility, or a broad card search into historical linkage evidence.
- Never use JSON or text substring matching for provenance or annotation IDs. Parse bounded JSON and compare exact values; malformed/unclassifiable affected data blocks destructive removal.
- Lock affected provenance and message/annotation rows in a deterministic order within the existing source-removal transaction. Do not hold an external provider call or outbox worker operation under that transaction.
- The shared provenance/removal helper is the only cross-aggregate synchronization protocol: sorted source locks, sorted evidence locks, sorted card locks, then row locks and current-state recheck. The sole `persistAssistantAnswerProvenance` insertion boundary uses it for both fenced terminal and evaluation persistence; source/evidence removal uses it before scan/redaction/scrub. Do not rely solely on source/card rows already read before an external AI call.
- Withdrawal is availability, not a new verification status. Existing verification semantics and available historical compatibility must remain intact.
- Redaction must happen before source capture/raw material hiding and roll back with it. A transaction failure leaves source eligibility, evidence, card/index state, payloads, provenance, annotations, and removal audit completion unchanged.
- The only traveler-visible withdrawn projection is `{ id, rank, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt, citedInAnswer }`. Do not add historic title, URL, quote, source type, date, confidence, conditions, quick facts, card/source identity, category, annotation handle, detail/action, audit serialization, log, or error detail to it.
- A source-free `warning` or `trip_fact` is retained only when it independently meets the existing answer-local/non-navigable contract. A descriptor with one or more required withdrawn provenance IDs is omitted.
- Migration/backfill handling must respect project schema compatibility: a disposable-only clean break needs verified preconditions; durable data or overlapping runtimes need approved expand-migrate-contract handling. [Source: `_bmad-output/project-context.md#Testing Rules`; Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-33: Releases Declare Schema Compatibility And Workload Admission`]
- The backfill is a bounded, explicitly invoked maintenance command, not a new always-on worker. A verified old-writer quiescence gate plus the migration's provenance-table drain fixes its database-time population; the `(created_at, id)` checkpoint makes that fixed scan repeatable despite random UUID IDs. The sole coordinated persistence boundary classifies any later write directly, so it cannot bypass completed historic remediation. Backfill must be complete and durable before destructive withdrawal is admitted; operational deployment/scheduling remains Epic 12 scope.

### Testing Requirements

Use the serial PostgreSQL test configuration and `DATABASE_URL_TEST` where required. Do not run reset-based suites concurrently.

```bash
pnpm vitest run tests/knowledge-source-removal.test.ts tests/knowledge-search.test.ts
pnpm vitest run tests/ai-ask-shell.test.ts tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts
pnpm vitest run tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/domain-outbox.test.ts
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

### Scope Boundaries

- Story 11.3 owns the complete persisted annotation range/provenance validation contract; this story changes only the withdrawal availability constraint necessary to prevent stale descriptors.
- Story 11.4 owns server-bound detail/action resolution and current ownership; this story removes all withdrawn detail/action capability rather than expanding action behavior.
- Story 11.5 owns API/BFF provenance/detail read cutover. Preserve current server read behavior; do not add a public API endpoint here.
- Epic 12 owns worker deployment, scheduled runtime, and schema-overlap release operations. This story may define a safe backfill/cutover contract but must not invent deployed worker infrastructure outside current ownership.
- Do not change source ranking, card publication policy beyond existing removal effects, TripAnswerContext construction, provider prompts, booking/maps/weather domains, or browser transport ownership.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 11.2: Withdraw Historical Provenance Safely`]
- [Source: `_bmad-output/implementation-artifacts/epic-11-context.md#Requirements & Constraints`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-36: Withdrawable Historical Provenance And Safe Detail Projections`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/11-1-publish-canonical-trip-answer-context-snapshots.md`]
- [Source: `src/features/knowledge/source-removal.ts`]
- [Source: `packages/database/src/schema.ts#assistantResponseProvenance`]
- [Source: `packages/database/src/provenance.ts#formatAssistantMessageProvenance`]
- [Source: `src/features/chat-trips/conversations.ts#getOwnedConversation`]
- [Source: `src/features/ai/answer-annotations.ts#sanitizeStoredAnswerAnnotations`]
- [Source: `src/features/ai/domain-outbox-worker.ts#loadFinalStateInTransaction`]
- [Source: `src/features/ai/ai-ask-composer.tsx#AssistantProvenanceBlock`]
- [Source: `tests/knowledge-source-removal.test.ts`]

## Story Validation

### BMad Checklist Validation

- [x] All three authoritative BDD acceptance criteria are reproduced exactly and mapped to concrete tasks.
- [x] The story preserves aggregate ownership: Knowledge owns removal, AI Orchestration owns provenance and annotation flow, and Chat/Trips owns historical conversation reads.
- [x] Every existing update seam was read and documented with current behavior, required change, and invariants to retain: removal transaction, schema, provenance formatter, owner-scoped read, annotations, outbox worker, UI, migrations, and focused tests.
- [x] Source, evidence, and card linkage paths are explicit; mutable-state reconstruction and substring matching are prohibited.
- [x] The story names one explicit destructive evidence-withdrawal command and distinguishes it from existing non-destructive recommendation/pipeline evidence removal.
- [x] Transaction ordering, idempotency, audit non-disclosure, fail-closed remediation, raw-payload scrubbing, delayed outbox behavior, and rollback requirements are explicit.
- [x] The historic cutover has a concrete AI-Orchestration-owned singleton state, exact supported anchors, deterministic bounded maintenance command/checkpoint, failure disposition, and removal admission predicate.
- [x] The cutover has a database-time fixed population and stable `(created_at, id)` checkpoint rather than an unsafe UUID cursor; the unavailable variant and exact Vietnamese marker are a discriminated formatter/UI/annotation/outbox contract.
- [x] Migration cutover draining and the shared provenance-finalization/removal lock/recheck protocol prevent late transactions or concurrent AI finalization from bypassing completed remediation or reinserting available withdrawn provenance.
- [x] The migration cannot start until old terminal/evaluation provenance writers are verifiably quiesced, and the sole coordinated insertion boundary covers both current production writers with concurrency regressions.
- [x] The unavailable read contract forbids all URL, quote, derived-fact, quick-fact, and executable-action leakage at formatter, read, annotation, outbox, and UI seams.
- [x] The scope differentiates this story's withdrawal constraint from Story 11.3 validation, Story 11.4 actions/details, Story 11.5 API cutover, and Epic 12 operations.
- [x] Story 11.1 forward-migration, exact-ledger, fence, immutable snapshot, and deletion guarantees are included as non-regression constraints.
- [x] Focused PostgreSQL regression coverage and baseline verification commands are complete and serial execution is required.

### Validation Outcome

Validation passed. The story is complete, traceable, and ready for development. It directs implementation through the existing Knowledge removal transaction and AI provenance/annotation read seams, defines the evidence-withdrawal boundary and a durable, bounded backfill admission gate, requires forward-only remediation before destructive cutover, and prevents stale historic source content from leaking through any current traveler projection.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story context created and validated on 2026-07-30 from the complete Epic 11 context, epics, architecture spine, project context, Story 11.1 implementation/review record, current source-removal transaction, provenance/schema/read/annotation/outbox/UI seams, focused tests, and recent Story 11.1 commits.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Validation passed before implementation: authoritative ownership, explicit source/evidence withdrawal boundaries, exact linkage, atomic destructive ordering, idempotency, safe audit, durable historic backfill/admission/fail-closed cutover, read-time non-disclosure, annotation/outbox race prevention, migration discipline, and regression coverage are complete and traceable.
- No production code, migration, test execution, deployment, or non-story artifact was modified by this story-creation workflow.

### File List

- `_bmad-output/implementation-artifacts/11-2-withdraw-historical-provenance-safely.md`
