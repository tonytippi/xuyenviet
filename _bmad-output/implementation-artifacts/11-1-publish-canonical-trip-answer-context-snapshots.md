# Story 11.1: Publish Canonical TripAnswerContext Snapshots

Status: ready-for-dev

## Story

As a traveler,
I want AI Ask to use my confirmed structured trip state ahead of stale chat details,
so that planning answers and proposals are based on the Trip Project I actually control.

## Acceptance Criteria

1. **Given** AI Ask reads an owned selected Trip Project, **when** Chat/Trips produces `TripAnswerContext v1`, **then** it captures the Trip Project aggregate version, stable anchors, ordered plan items, structured constraints, primary-conversation ID, and bounded current-conversation facts. **And** it includes no raw transcript, provider data, hidden proposal, dynamic/deferred domain data, or another module's mutable aggregate.
2. **Given** structured state, legacy project fields, project-scoped chat context, and conversation-scoped chat context disagree, **when** the context is assembled, **then** structured anchors, plan items, and `trip_project_constraints` are canonical; legacy fields are migration-only aliases that cannot override them; and project chat supplements only absent structured fields. **And** a material lower-priority conflict is a typed context entry that allows the answer to ask a concise clarification while proposal drafting uses canonical structured state only.
3. **Given** a source bundle includes Trip Project context, **when** it is persisted for generation, **then** it records the context version, aggregate version, ordered included field/item identifiers and versions, typed conflicts, deterministic bounded serialization, selected-but-compacted exclusions with reasons, and final prompt-section SHA-256 digest. **And** provenance, usage, and evaluation reference that immutable source-bundle snapshot.

## Tasks / Subtasks

- [ ] Define the Chat/Trips-owned `TripAnswerContext v1` contract and owner-scoped publisher (AC: 1-2)
  - [ ] Replace/evolve the flat `AnswerContextDigest` contract in `packages/database/src/answer-context.ts`; do not introduce a second context assembler in AI Orchestration, proposal drafting, or a compatibility re-export.
  - [ ] Read the owned selected Trip Project and publish only: captured `aggregateVersion`; stable structured anchors; deterministically ordered structured plan items with identifiers and versions; versioned structured constraints; primary conversation ID; and bounded active facts from the current conversation.
  - [ ] Use owner-scoped project/conversation linkage. A supplied project/conversation mismatch or other owner must produce no context and must never leak existence or data.
  - [ ] Treat `trip_projects.origin`, `destination`, dates, travelers, and notes as migration-only aliases. They may fill an explicitly absent structured field only where the v1 contract defines that compatibility behavior; they never override structured anchors, items, or constraints.
  - [ ] Exclude transcript/message bodies, provider input/output, hidden or pending proposal data, dynamic weather/route/availability/booking/maps data, raw source material, and mutable aggregates owned by another module.
  - [ ] Retain `chat_context` as lower-priority, bounded conversational input only. Project-scoped context may fill fields absent from structured state; conversation-scoped context cannot override canonical state.
  - [ ] Define a bounded typed conflict shape with stable source/field/priority semantics. Only material lower-priority disagreement may enter it. Answer prompting may request concise clarification; proposal drafting must read canonical structured state only and must not use lower-priority values as a draft premise.
- [ ] Make v1 serialization, prompt selection, and compaction deterministic and auditable (AC: 1-3)
  - [ ] Evolve `packages/database/src/source-bundle.ts` to consume one v1 context instance, preserve the existing source priority, and render the exact context selected for the final prompt section.
  - [ ] Establish explicit stable ordering for anchors, plan items, fields, conflicts, included references, and exclusions. Do not rely on database default order, object insertion order, or parallel loader completion order. Preserve existing plan ordering semantics by parent scope and ordinal with a deterministic ID tie-breaker.
  - [ ] Bound every serialized field/collection and use the existing source-bundle prompt cap. Record selected context references as included only when the exact rendered final prompt contains them; record every selected context reference removed by compaction with a safe, finite exclusion reason.
  - [ ] Hash the exact final bounded prompt section using SHA-256 hex after all rendering and compaction. Do not hash a pre-compaction object or infer prompt usage through substring matching.
  - [ ] Preserve prompt-injection data boundaries, traveler-safe source-bundle constraints, freshness warnings, knowledge/web/general ordering, and the existing `answer_context_load_failed` safe-warning behavior.
- [ ] Persist an immutable source-bundle/context snapshot inside the existing fenced terminal transaction (AC: 3)
  - [ ] Add the smallest schema and forward-only Drizzle migration required for an immutable, bounded snapshot and its references. Before applying a migration, follow the project schema compatibility policy: disposable-only clean break is permitted only when its precondition is verified; durable data or runtime overlap requires approved expand-migrate-contract handling.
  - [ ] Snapshot data must include v1 version, project aggregate version, ordered included field/item identifiers and versions, typed conflicts, deterministic bounded serialization, selected-but-excluded references/reasons, and final prompt digest. Persist no raw transcript, provider payload, hidden proposal, secrets, raw source material, or dynamic/deferred data.
  - [ ] In `packages/database/src/ai-ask-stream-execution.ts`, carry the exact assembled bundle and rendered section into `finalizeAiAskCommand`; write the snapshot with assistant message, retrieval decision/provenance, usage, command completion, and outbox work only after the existing conversation/project fence verifies.
  - [ ] Do not reload mutable Trip Project state during finalization. If a plan/constraint/primary-conversation/project-link/deletion mutation changes the captured fence, preserve existing `discarded`/`refresh_required` behavior and persist no assistant response, provenance, usage success, or source-bundle snapshot.
  - [ ] Make command, provenance, usage, and evaluation reach the same immutable snapshot by an explicit bounded reference. Do not overload row-per-source `assistant_response_provenance.sourceSnapshot` with full Trip Project context or expose context values in traveler provenance merely to approximate this requirement.
  - [ ] Preserve existing deletion/scrubbing guarantees. A retained command or snapshot reference must not reconstitute deleted chat or Trip Project content; source withdrawal/backfill behavior itself remains Story 11.2 work.
- [ ] Preserve Chat/Trips ownership and proposal behavior (AC: 1-2)
  - [ ] Reuse the aggregate-version and owner-locking behavior in `src/features/chat-trips/trip-projects.ts` and `packages/database/src/ai-ask-commands.ts`. Do not add a second fence or direct AI-owned writer for Trip Planning tables.
  - [ ] Verify every structured context-changing command continues to advance `trip_projects.aggregate_version`, including plan item create/update/delete/reorder/state changes, constraint changes, primary-conversation replacement/project linking, and deletion.
  - [ ] Keep AI response generation read-only with respect to confirmed plan state. Persistent plan changes remain owner-confirmed `applyApprovedTripChange(...)` results.
- [ ] Prove canonicality, snapshot integrity, owner isolation, and regressions (AC: 1-3)
  - [ ] Extend `tests/answer-context.test.ts` for all v1 fields, absence of prohibited data, owner/project/conversation mismatch, deterministic ordering/serialization/digest, bounded current-conversation facts, canonical structured precedence, legacy alias non-override, project-chat gap fill, typed material conflict, and proposal-draft canonical-only input.
  - [ ] Extend `tests/trip-projects.test.ts` and proposal tests for aggregate-version advancement across every canonical-context mutation and primary-conversation changes.
  - [ ] Extend `tests/ai-ask-commands.test.ts` and source-bundle/execution tests to prove the persisted snapshot is the exact post-compaction prompt input; included/excluded accounting and SHA-256 are correct; provenance/usage/evaluation reach the snapshot; and stale fences/deletions leave no partial snapshot or terminal answer-side state.
  - [ ] Retain API/BFF regression coverage only as needed for the shared execution seam: byte-compatible NDJSON, owner-scoped request handling, `refresh_required`, outbox behavior, and no browser disclosure of prompt, snapshot, credentials, or raw/private data.
  - [ ] Run focused PostgreSQL suites serially, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, migration/schema verification appropriate to the approved compatibility path, and `git diff --check`. Record actual results and blockers after implementation only.

## Dev Notes

### Architecture And Ownership

- **AD-35 is authoritative.** Chat/Trips exclusively publishes `TripAnswerContext v1`; AI Orchestration consumes it. There must be one canonical builder, not separate legacy, source-bundle, and proposal-draft interpretations. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-35: Chat/Trips Publishes A Versioned TripAnswerContext`]
- **AD-16 fences remain authoritative.** AI Ask admission captures project `aggregate_version`; final assistant/provenance/usage/source-bundle persistence occurs atomically only if the fence still matches. Reuse `finalizeAiAskCommand`; do not add a second invalidation protocol. [Source: `packages/database/src/ai-ask-commands.ts#finalizeAiAskCommand`; Source: `_bmad-output/implementation-artifacts/10-2-fence-terminal-ai-ask-persistence.md`]
- **AD-29/30 ownership remains authoritative.** Chat transcripts and `chat_context` are not confirmed itinerary writers; only owner-confirmed proposal application mutates structured plan state. The primary conversation is the plan-authoring surface. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29: Trip Planning Is A Chat/Trips-Owned Structured Aggregate`; Source: `src/features/chat-trips/trip-projects.ts`]
- **AD-34 remains authoritative.** Do not make source snapshots or context extraction into fire-and-forget work. Preserve transactional outbox behavior and immutable completed-result semantics from Stories 10.3-10.4. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34: Durable Work Uses A PostgreSQL Transactional Outbox`]

### Current Implementation And Required Evolution

| File | Current state to preserve | Story 11.1 evolution |
| --- | --- | --- |
| `packages/database/src/answer-context.ts` | Loads a flat, owner-scoped `AnswerContextDigest` using legacy project fields and chat facts; current project chat overwrites legacy values. | Replace/evolve it into the one Chat/Trips-owned v1 publisher. Structured anchors/items/constraints win; legacy fields are aliases only; conflicts become typed and deterministic. |
| `packages/database/src/source-bundle.ts` | Preserves priority, safe loading warnings, a 5,000-character cap, prompt injection boundaries, compact/minimal rendering, and traveler-safe knowledge/web handling. | Consume v1 once; deterministically record exact included/excluded context references and render/hash the final compacted section. Do not silently slice context. |
| `packages/database/src/ai-ask-stream-execution.ts` | Assembles context before provider execution and atomically finalizes assistant, provenance, usage, command, and outbox state behind existing fences. | Carry the exact generation-time context/bundle/rendered section into that transaction and persist its immutable snapshot there; never rebuild it at finalization. |
| `packages/database/src/provenance.ts` | Writes retrieval decision and row-per-source traveler-safe provenance with bounded source snapshots. | Reference the answer-level immutable snapshot without storing full Trip Project context in each source row or exposing hidden/private values. |
| `packages/database/src/schema.ts` and `drizzle/migrations/` | Has Trip Project aggregate/item/constraint versions and command fences, but no visible source-bundle snapshot reference. | Add only the required immutable snapshot/reference schema and migration, including safe bounds/checks and deletion compatibility. |
| `src/features/chat-trips/trip-projects.ts` | Owns structured aggregate reads/mutations, aggregate-version advancement, primary-conversation changes, and deletion invalidation. | Reuse/extend owner-scoped read models rather than directly reading Chat/Trips tables from AI Orchestration. Keep mutation fencing unchanged. |

### Security, Data, And Regression Guardrails

- All reads must scope `userId`, selected project, and current/primary conversation. Do not expose an unscoped `tripProjectId` context loader.
- The snapshot is immutable answer-generation evidence, not a mutable Trip Project cache, raw prompt archive, or traveler-readable data source.
- Deterministic serialization must be based on explicit contract order. JSON object-key ordering alone is insufficient for ordered references, conflicts, and prompt evidence.
- Compaction is evidence-bearing: selected-but-excluded items require a reason and must not be marked `usedInPrompt`; final digest is over the exact final section supplied to `buildAiAskMessages`.
- Preserve current source-bundle data treatment as data, not instructions. Never add raw transcripts, provider payloads, copied posts, OCR/vision notes, hidden proposals, operator-only evidence, or credentials to the snapshot or prompt.
- Preserve existing raw NDJSON/API/BFF contracts from Epic 10. This story adds no public read endpoint, no browser snapshot payload, and no second AI execution/persistence path.
- New persistent chat/project-derived data must define deletion behavior before migration approval. Do not pull historical source withdrawal/redaction into this story; Story 11.2 owns it.

### Testing Requirements

Use the serial PostgreSQL test configuration and `DATABASE_URL_TEST` where required. Do not run reset-based suites concurrently.

```bash
pnpm vitest run tests/answer-context.test.ts tests/trip-projects.test.ts tests/trip-change-proposals.test.ts
pnpm vitest run tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/domain-outbox.test.ts tests/chat-trip-context-extraction.test.ts
pnpm vitest run tests/ai-ask-api-adapter.test.ts tests/ai-ask-bff-api.integration.test.ts
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

### Scope Boundaries

- Story 11.2 owns historical provenance withdrawal, backfill, and redaction.
- Story 11.3 owns persisted annotation range/provenance validation.
- Story 11.4 owns annotation detail/action binding and current-ownership resolution.
- Story 11.5 owns planning-context/detail/provenance API/BFF read cutover.
- Epic 12 owns deployed worker/runtime operations and schema-overlap release operations; Epic 14 owns public-launch evidence.
- Do not add dynamic route/ETA, weather, maps, booking, availability, provider snapshots, actual expenses, collaboration, location sharing, or another deferred aggregate.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 11.1: Publish Canonical TripAnswerContext Snapshots`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16: Nest Owns Source-Bundled NDJSON AI Ask Streaming`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29: Trip Planning Is A Chat/Trips-Owned Structured Aggregate`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30: Primary Conversation And Change Proposals Are Explicit Commands`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34: Durable Work Uses A PostgreSQL Transactional Outbox`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-35: Chat/Trips Publishes A Versioned TripAnswerContext`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval Contract`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.2 User Authentication, Chats, And Trips`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5 Retrieval, Web Search, And Answer Grounding`]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#State Patterns`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/10-2-fence-terminal-ai-ask-persistence.md`]
- [Source: `_bmad-output/implementation-artifacts/10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md`]
- [Source: `_bmad-output/implementation-artifacts/10-4-preserve-completed-ai-ask-results-while-consumers-run.md`]
- [Source: `_bmad-output/implementation-artifacts/10-5-cut-ai-ask-streaming-to-the-versioned-api.md`]
- [Source: `packages/database/src/answer-context.ts`]
- [Source: `packages/database/src/source-bundle.ts`]
- [Source: `packages/database/src/ai-ask-stream-execution.ts`]
- [Source: `packages/database/src/provenance.ts`]
- [Source: `packages/database/src/ai-ask-commands.ts`]
- [Source: `packages/database/src/schema.ts`]
- [Source: `src/features/chat-trips/trip-projects.ts`]
- [Source: `tests/answer-context.test.ts`]

## Story Validation

### BMad Checklist Validation

- [x] All three authoritative BDD acceptance criteria are reproduced exactly and mapped to implementable tasks.
- [x] The contract has one stated owner: Chat/Trips publishes v1; AI Orchestration consumes the exact instance through existing source-bundle and fenced-finalization seams.
- [x] Existing files were read and their current behavior, required evolution, and preserved invariants are documented: answer context, source bundle, AI stream execution, provenance, command fencing, structured Trip aggregate, schema, and current tests.
- [x] Canonical precedence is unambiguous: structured anchors/items/constraints win; legacy fields never override; project chat fills gaps only; conversation chat remains lower priority; material disagreements are typed conflicts.
- [x] Snapshot evidence is complete: version, aggregate version, ordered IDs/versions, conflicts, bounded deterministic serialization, exclusions/reasons, post-compaction final-section SHA-256, and immutable cross-references.
- [x] Privacy and safety boundaries prohibit raw transcript, provider data, hidden proposals, dynamic/deferred data, another module's mutable aggregate, raw source material, and browser exposure.
- [x] Existing owner-scoped fences, atomic completion, deletion scrubbing, outbox behavior, source priority, safe warnings, prompt-injection boundaries, and byte-compatible API/BFF transport are explicitly preserved.
- [x] Deterministic ordering, compaction accounting, exact prompt digest semantics, migration compatibility, and stale-fence/deletion behavior are explicit and regression-testable.
- [x] Test targets and serial PostgreSQL verification requirements cover canonicality, isolation, exact snapshot persistence, references, exclusions, fences, deletion, and transport regressions.
- [x] Scope correctly excludes source withdrawal, annotation work, API read cutover, worker/deployment work, public-launch evidence, and deferred dynamic domains.

### Validation Outcome

Validation passed. The story is complete, traceable, and ready for development. It directs implementation to make the required storage topology and migration only through the existing architecture and schema-compatibility rules; it does not invent a second context owner, persistence path, or API surface.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story context created and validated on 2026-07-30 from the full Epic 11 context, PRD, architecture spine, UX behavior, project context, completed Epic 10 records, current shared AI execution/persistence seams, current Trip Planning aggregate code, schema, tests, and recent commit history.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Validation passed before implementation: canonical ownership, structured precedence, typed conflict behavior, deterministic compaction/digest evidence, immutable fenced persistence, privacy/deletion rules, prior-story invariants, regression coverage, and scope boundaries are complete and traceable.
- No production code, migration, test execution, deployment, or non-story artifact was modified by this story-creation workflow.

### File List

- `_bmad-output/implementation-artifacts/11-1-publish-canonical-trip-answer-context-snapshots.md`
