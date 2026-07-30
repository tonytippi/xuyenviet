# Story 11.3: Validate Persisted Answer Annotations

Status: ready-for-dev

## Story

As a traveler,
I want selectable answer details to correspond to real, safe sources or my current planning context,
so that the interface never invents links, source claims, or cross-user details from answer prose.

## Acceptance Criteria

1. **Given** post-answer enrichment creates a descriptor for final persisted assistant text, **when** annotation validation runs, **then** each range has integer zero-based UTF-16 `{ start, end, text }` values with `0 <= start < end <= content.length`, exclusive `end`, exact `content.slice(start, end)` equality, and no overlap. **And** invalid, stale, duplicate, or text-mismatched descriptors are rejected before persistence and rendering.
2. **Given** a `source`, `place`, `hotel_area`, `route_segment`, or `cost` descriptor, **when** it is persisted, **then** it has one or more unique provenance rows owned by the same assistant message, conversation, and user. **And** unknown, cross-message, cross-conversation, cross-user, raw/operator-only, or inferred-source references are rejected.
3. **Given** a `warning` or `trip_fact` has no provenance reference, **when** validation accepts it, **then** it represents only answer-local guidance or owner context, contains no source-derived quick fact/action, and is non-navigable. **And** the client renders persisted descriptors only and never parses or re-matches Vietnamese answer prose.

## Tasks / Subtasks

- [ ] Make the existing annotation validator the explicit sole creation and persisted-read contract (AC: 1-3)
  - [ ] Evolve `src/features/ai/answer-annotations.ts`; do not add a parallel annotation store, source resolver, browser parser, or generic entity model.
  - [ ] Keep `AnswerAnnotation` ranges anchored to the final persisted `messages.content`, not streamed chunks, markdown-normalized sections, headings/body-relative offsets, or reconstructed text. JavaScript string indexes are the required zero-based UTF-16 offsets; `end` is exclusive.
  - [ ] At proposal validation and persisted-JSON sanitization, reject non-integer/out-of-bound/empty ranges, exact-slice mismatches, duplicate IDs, duplicate provenance IDs, unknown types, and overlap. A duplicate ID anywhere in stored JSON invalidates every instance of that ID; retain deterministic start/end ordering for accepted non-overlapping annotations.
  - [ ] Preserve the bounded maximum of 20 annotations and reject malformed/oversized provider proposals safely. Invalid optional enrichment yields no descriptor, never a changed completed answer or fabricated fallback.
  - [ ] Keep both validation passes: validate untrusted provider proposals before they become candidates, then sanitize those candidates again under the final persistence locks immediately before `messages.answerAnnotations` is updated. Stored JSON remains untrusted on every history read and must be rebuilt from current scoped provenance, not rendered directly.
  - [ ] Permit provenance-free descriptors created by the current contract only for `warning` and `trip_fact`. They are answer-local/owner-context guidance only and must have no owner, provenance IDs, source category, source-derived detail, URL, quick fact, or executable action.
  - [ ] Do not introduce a new provenance-free `action` capability in this story. Preserve only the existing exact legacy non-executable action compatibility shape if persisted historic data requires it; sanitize/rebuild it as local guidance with no source binding or executable target. Story 11.4 owns registered command validation, current owner-scoped target derivation, and executable capabilities.
- [ ] Enforce provenance-bound descriptor eligibility at the existing owned seams (AC: 2-3)
  - [ ] Continue deriving every accepted source-backed detail exclusively through `buildAnswerAnnotationDetail` from formatted `AssistantMessageProvenanceItem` rows. Never trust provider/stored title, URL, source label, quick facts, source snapshot, provider payload, operator-only fields, raw material, or inferred source claims.
  - [ ] Require `source`, `place`, `hotel_area`, `route_segment`, and `cost` to reference one or more unique, available provenance rows. Each ID must resolve from the same assistant-message provenance set supplied by the owner-scoped write/read seam; `place`, `hotel_area`, `route_segment`, and `cost` also require an owner reference contained in their descriptor provenance IDs.
  - [ ] Preserve the current transaction/read scopes as the ownership authority: `loadFinalStateInTransaction` selects provenance by `(userId, conversationId, userMessageId, assistantMessageId)` under locks; `getOwnedConversation` selects conversation/messages/provenance by authenticated user and conversation before grouping provenance by assistant message. Do not make the sanitizer query unscoped provenance or accept caller-supplied ownership assertions.
  - [ ] Treat `withdrawn` provenance as ineligible for every source-backed descriptor. Any required withdrawn dependency omits the annotation; it must not be converted into a new local/source detail. Preserve independently valid source-free `warning` and `trip_fact` annotations.
  - [ ] Keep the safe provenance formatter as the only source-detail boundary. It must continue to project withdrawn rows as the localized unavailable variant only, and available details must remain limited to the architecture allowlist and six trimmed quick facts of at most 160 characters each.
- [ ] Preserve durable outbox, fencing, and owner-safe history behavior (AC: 1-3)
  - [ ] Retain `ai_ask.answer_annotation.v1` as best-effort post-answer enrichment after terminal assistant/provenance persistence. Do not move provider work into request/render paths, hold locks during provider calls, or allow annotation failure/delay/retry to alter the completed command, assistant text, initial provenance, or initial answer usage.
  - [ ] In `src/features/ai/domain-outbox-worker.ts`, preserve the active-claim and final-state checks before provider invocation; after it returns, reacquire the existing aggregate/provenance/message locks, require unchanged final assistant content, format current provenance, sanitize the candidate annotations, and atomically write annotations, annotation usage, effect guard, and claim completion.
  - [ ] Preserve redelivery idempotency and the `domainOutboxEffects` guard. A stale content/fence/ownership/withdrawal result is fenced out without descriptor persistence; a provider failure remains retryable and does not mutate the completed answer.
  - [ ] In `src/features/chat-trips/conversations.ts`, keep `getOwnedConversation` server-authenticated and owner-scoped, pass only each assistant message's formatted provenance to the sanitizer, and return empty annotations for malformed or unowned stored JSON. Do not expose cross-user resource existence through annotation behavior.
- [ ] Keep the client renderer as defense in depth only (AC: 1, 3)
  - [ ] Preserve `AiAskComposer`/`AssistantMessageContent` rendering from the server-returned persisted annotation list only. It may normalize invalid duplicate/range/overlap input defensively, but must not establish provenance ownership, synthesize highlights, parse, normalize, re-search, or re-match Vietnamese answer prose.
  - [ ] Preserve one selected derived detail state and current keyboard/focus behavior. No new client routing, source lookup, action execution, or persistent detail state belongs in this story.
  - [ ] Keep withdrawn provenance non-interactive and source-free. An unavailable marker must never cause an annotation button, URL, quote, quick fact, detail panel, or action to appear.
- [ ] Prove the contract at creation, durable persistence, read, and display boundaries (AC: 1-3)
  - [ ] Extend `tests/answer-annotations.test.ts` for range boundaries (`start === 0`, `end === content.length`), UTF-16 surrogate pairs and combining text, empty/mismatched text, duplicate IDs separated in stored order, overlap, malformed/unknown proposal types, max-count behavior, and exact exclusive-end semantics.
  - [ ] Add source-backed rejection coverage for empty, duplicate, unknown, unavailable, and cross-message/cross-conversation/cross-user-looking provenance IDs; cover all `source`, `place`, `hotel_area`, `route_segment`, and `cost` types. Assert stored owner IDs must be in `provenanceIds` and trusted output is rebuilt only from the scoped provenance input.
  - [ ] Add source-free `warning` and `trip_fact` assertions proving no owner, source category, URL, source-derived quick fact, action, or provenance dependency survives. Cover the explicit legacy action compatibility decision separately, proving it remains non-executable and cannot be combined with provenance IDs.
  - [ ] Extend `tests/chat-trip-context-extraction.test.ts` and/or focused outbox coverage for malformed provider output, stale assistant content after provider return, withdrawn provenance after provider return but before the final locked write, and redelivery. Prove invalid/stale candidates are not persisted, no provider call occurs after a failed claim/fence precheck, and successful redelivery records no duplicate effect/usage.
  - [ ] Extend `tests/ai-ask-shell.test.ts` or an owned-conversation read test for malformed/overlapping/duplicate persisted JSON and references absent from that assistant message's scoped provenance. Assert ordinary answer text is retained but no selectable annotation, detail, URL, quick fact, or cross-user detail is rendered; retain the no-prose-synthesis and withdrawn-marker regressions.
  - [ ] Run focused PostgreSQL-backed suites serially, then baseline verification. Record actual outcomes only after implementation.

## Dev Notes

### Architecture And Ownership

- **AD-20 is authoritative.** Annotations are best-effort post-answer enrichment validated against the final persisted assistant message and stored provenance before storage and rendering. They have one persisted contract; browser prose parsing cannot create links, details, or provenance claims. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-20: Selectable Answer Annotations Use Persisted, Provenance-Bound Entity Descriptors`]
- **AI Orchestration owns annotation enrichment and provenance; Chat/Trips owns conversation history reads.** The outbox consumer is the only annotation writer; `getOwnedConversation` is the current owner-scoped historical reader. Do not add cross-feature direct table writers. [Source: `src/features/ai/domain-outbox-worker.ts#annotate`; Source: `src/features/chat-trips/conversations.ts#getOwnedConversation`]
- **Story 11.2 is a completed dependency.** Provenance availability is separate from verification state. A withdrawn dependency omits source-backed annotations, and delayed enrichment must recheck current availability under locks. Never use text/JSON substring matching to recover dependencies. [Source: `_bmad-output/implementation-artifacts/11-2-withdraw-historical-provenance-safely.md#Data, Security, And Concurrency Guardrails`]
- **Story 11.4 owns executable detail/action behavior.** This story validates persisted descriptors only; it must not add server command registrations, client-derived routes, arbitrary target IDs, or capability minting. [Source: `_bmad-output/planning-artifacts/epics.md#Story 11.4: Bind Annotation Details and Actions to Current Ownership`]

### Current Implementation And Required Evolution

| File | Current state to preserve | Story 11.3 evolution |
| --- | --- | --- |
| `src/features/ai/answer-annotations.ts` | Validates provider proposals, sanitizes untrusted persisted JSON, rebuilds safe details from formatted provenance, and supports all descriptor types. | Make source-free type policy unambiguous, preserve two-pass validation, and comprehensively prove exact UTF-16 ranges, duplicate/overlap rejection, scoped provenance eligibility, and safe rebuilt output. |
| `src/features/ai/domain-outbox-worker.ts` | Runs annotation enrichment after terminal persistence; fences/locks before and after the provider call; writes annotations/usage/effect atomically. | Retain this sole durable writer and prove stale-content, withdrawal, and redelivery paths cannot persist a stale descriptor. |
| `src/features/chat-trips/conversations.ts` | Authenticates user, reads one owned conversation, groups formatted provenance per assistant message, and sanitizes stored annotations. | Preserve message-local scoped sanitizer input and add historical malformed/unowned JSON suppression coverage. |
| `packages/database/src/provenance.ts` | Formats persisted provenance into safe available/withdrawn discriminated variants. | Reuse it as the only annotation-detail input; do not expose raw snapshots or alter Story 11.1 prompt ledger/snapshot behavior. |
| `src/features/ai/ai-ask-composer.tsx` | Renders supplied annotations with a defensive range/duplicate/overlap normalizer and no source-title prose matching. | Keep it a secondary display guard only; prove it never creates annotations or detail from free-form answer text. |
| `tests/answer-annotations.test.ts` | Covers basic range, source detail, withdrawal, persisted sanitization, UTF-16, and legacy behavior. | Add complete AC and edge/race coverage without weakening existing withdrawal and legacy safety regressions. |

### Data, Security, And Concurrency Guardrails

- `messages.answerAnnotations` is JSON-array storage, so the application write/read validators are the safety boundary. Do not assume a database array check validates descriptor shape, range, provenance ownership, or safe detail fields. Avoid schema/migration work unless a concrete implementation need emerges; no new table is required by this story.
- Provenance ownership is guaranteed by the existing composite provenance relationships plus scoped queries. Never pass a mixed or unscoped provenance collection into `sanitizeStoredAnswerAnnotations`; the function verifies membership in its supplied scoped set, not arbitrary database ownership.
- The persisted descriptor is evidence about one immutable final answer. Do not rebase offsets after headings, markdown segmentation, content editing, replay, retry, or browser formatting. A content mismatch after the provider call fences the consumer out.
- Provider output and stored JSON are both hostile input. Accept only the bounded proposal fields, reconstruct traveler-visible descriptor fields from current formatted provenance, and silently omit invalid optional enrichment rather than logging or returning source snapshots/provider content.
- Available provenance can be used only through the safe formatter. Reject raw/operator-only or inferred-source references by never accepting model/stored detail fields as authoritative; `sourceSnapshot` and provider payloads must not enter annotation output.
- Preserve deterministic sorting and reject overlaps rather than choosing a partial/silent substring rematch. Do not use normalization, case folding, title matching, URL matching, or Vietnamese prose parsing as a recovery path.
- Annotation provider work must occur outside locks. Final locked sanitization must retain the existing lock order and claim/effect idempotency so source withdrawal, finalization, and redelivery cannot deadlock or resurrect details.
- Story 11.1 invariants remain non-regression constraints: immutable source-bundle snapshot references, renderer-owned exact prompt-use ledgers including capped knowledge-card accounting, existing command/project/conversation fences, deletion cleanup, and forward-only migration discipline. Do not modify applied migration `0013` or reintroduce substring prompt-use inference.

### Testing Requirements

Use the serial PostgreSQL test configuration and `DATABASE_URL_TEST` where required. Do not run reset-based suites concurrently.

```bash
pnpm vitest run tests/answer-annotations.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-shell.test.ts
pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

### Scope Boundaries

- Story 11.1 owns canonical `TripAnswerContext`, immutable source-bundle snapshots, exact prompt-use ledgers, fences, and deletion cleanup. Preserve it; do not rebuild context or snapshot persistence here.
- Story 11.2 owns historical provenance withdrawal/backfill/remediation. Honor its current availability and exact parsed dependency rules; do not change source-removal classification or cutover logic here.
- Story 11.4 owns server-bound safe detail projections, executable action binding, capability derivation, and current ownership at execution time. Do not implement those features here.
- Story 11.5 owns API/BFF read cutover. Do not add public/private API endpoints, BFF handlers, OpenAPI contracts, or transport migrations here.
- Do not add dynamic route/ETA, weather, maps, booking, availability, provider snapshots, browser-side source discovery, generic entity persistence, or schema work unrelated to enforcing this existing descriptor contract.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 11.3: Validate Persisted Answer Annotations`]
- [Source: `_bmad-output/implementation-artifacts/epic-11-context.md#Requirements & Constraints`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-20: Selectable Answer Annotations Use Persisted, Provenance-Bound Entity Descriptors`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/11-1-publish-canonical-trip-answer-context-snapshots.md`]
- [Source: `_bmad-output/implementation-artifacts/11-2-withdraw-historical-provenance-safely.md`]
- [Source: `src/features/ai/answer-annotations.ts`]
- [Source: `src/features/ai/domain-outbox-worker.ts`]
- [Source: `src/features/chat-trips/conversations.ts`]
- [Source: `packages/database/src/provenance.ts`]
- [Source: `src/features/ai/ai-ask-composer.tsx`]
- [Source: `tests/answer-annotations.test.ts`]
- [Source: `tests/chat-trip-context-extraction.test.ts`]
- [Source: `tests/ai-ask-shell.test.ts`]

## Story Validation

### BMad Checklist Validation

- [x] All three authoritative BDD acceptance criteria are reproduced exactly and mapped to concrete implementation tasks.
- [x] The story identifies the sole annotation creation/persistence/read boundaries: proposal validator, final locked outbox sanitizer, and authenticated owner-scoped conversation read.
- [x] UTF-16, exclusive-end, exact-slice, non-empty, deterministic non-overlap, stale-content, and duplicate descriptor rules are explicit for both creation and persisted rendering.
- [x] Every source-backed type has explicit unique, available, message/conversation/user-owned provenance requirements; unknown, cross-scope, duplicate, raw, operator-only, and inferred references are rejected.
- [x] Source-free `warning`/`trip_fact` policy is precise; current legacy non-executable action compatibility is preserved without expanding Story 11.4 action scope.
- [x] Stored/provider descriptor fields are untrusted and traveler output is rebuilt only from formatted safe provenance; no raw snapshot/provider payload/prose inference reaches the client.
- [x] Story 11.2 withdrawal availability, final-lock revalidation, and unavailable non-disclosure rules are retained.
- [x] Outbox claim fencing, no-lock provider work, atomic annotation/usage/effect writes, idempotent redelivery, and completed-answer immutability are explicit.
- [x] Client responsibilities are constrained to rendering persisted server output and secondary range defense; free-text Vietnamese parsing/rematching is prohibited.
- [x] Existing implementation seams were read and their current behavior, required evolution, and invariants to preserve are documented.
- [x] Focused unit, PostgreSQL-backed outbox, owner-scoped history, withdrawal-race, and renderer regressions cover all acceptance criteria and scope boundaries.
- [x] Story 11.1 snapshot/ledger/fence/deletion guarantees and Story 11.4/11.5 boundaries are explicit non-regression constraints.

### Validation Outcome

Validation passed. The story is complete, traceable, and ready for development. It strengthens the existing validated persisted-descriptor path rather than creating a parallel source, entity, action, or browser-parsing system, and it preserves final-text fences, provenance availability, owner-scoped reads, and optional durable outbox behavior.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story context created and validated on 2026-07-30 from the complete Epic 11 context, authoritative epics and AD-20 architecture contract, project context, completed Stories 11.1 and 11.2 records, current annotation validator/sanitizer, provenance formatter, outbox worker, owner-scoped conversation read, composer renderer, focused tests, and recent Story 11 commits.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Validation passed before implementation: final UTF-16 range semantics, exact persisted-text validation, scoped available-provenance eligibility, source-free local guidance limits, two-pass untrusted-input sanitization, outbox fencing/idempotency, withdrawn dependency suppression, owner-safe history reads, and persisted-only rendering are complete and traceable.
- No production code, migration, test execution, deployment, or non-story artifact was modified by this story-creation workflow.

### Independent Review Record

- 2026-07-30: Unattended independent review of `d96a20feb699a047bbdfb5dd9ab7a820dce35621..ae6814d30ce646dc93fef0a93183d075d443b0e6` completed synchronously with Blind Hunter, Edge Case Hunter, and Acceptance Auditor.
- Status: in-progress. Three actionable patch findings remain; no implementation changes were made during review.
- PATCH S11.3-R1 [MEDIUM]: `src/features/ai/answer-annotations.ts:357` advertises provider-created `action` annotations even though `validateAnswerAnnotations` rejects every new `action` at `:66`. Remove `action` from the provider contract and retain it only for the narrow persisted legacy compatibility read path.
- PATCH S11.3-R2 [MEDIUM]: `src/features/ai/answer-annotations.ts:76` treats an explicitly supplied empty `quote` as absent because it uses truthiness. Require every defined `quote`, including `""`, to equal the final-text slice so a mismatched provider proposal cannot pass the exact-slice boundary.
- PATCH S11.3-R3 [MEDIUM]: `tests/chat-trip-context-extraction.test.ts:666-757` does not prove the required post-provider races. Add controlled provider-return tests that change final assistant content and withdraw referenced provenance before the final locked write, then assert no annotation/detail persists while the completed answer remains unchanged.
- Review evidence: `git diff --check d96a20f..ae6814d` passed. The acceptance layer reports focused `answer-annotations`, context-extraction, and shell coverage plus typecheck/lint/build passing; it did not run the separate prescribed domain-outbox/command/stream suite. A local combined focused invocation did not complete within the review window after database migration startup, so no additional test result is claimed.

### Repair Record

- 2026-07-30: Repaired only independent-review patches S11.3-R1 through S11.3-R3. The provider contract no longer offers new `action` annotations; `action` remains accepted only through the existing narrow persisted legacy-read sanitizer. Defined quotes, including `""`, must match the exact UTF-16 final-text slice.
- Added controlled post-provider-return PostgreSQL coverage: a final-content change is fenced without overwriting the completed content, and a provenance withdrawal is re-sanitized to no persisted annotation. Both paths retain a completed answer with an empty persisted annotation list.
- Focused serial verification passed: `pnpm vitest run tests/answer-annotations.test.ts tests/chat-trip-context-extraction.test.ts` (2 files, 39 tests). Repair commit: `7b15df77346f28308715ee8d75713b96c44ceb01`.
- Status returned to `ready-for-dev` pending the required follow-up independent review. This repair does not mark the story done or start another story.

### File List

- `_bmad-output/implementation-artifacts/11-3-validate-persisted-answer-annotations.md`
- `src/features/ai/answer-annotations.ts`
- `tests/chat-trip-context-extraction.test.ts`
