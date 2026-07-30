# Story 11.4: Bind Annotation Details and Actions to Current Ownership

Status: done

## Story

As a traveler,
I want source details and planning actions to stay safe after the answer was generated,
so that an old annotation cannot expose withdrawn data or mutate a resource I no longer own.

## Acceptance Criteria

1. **Given** a persisted descriptor exposes detail fields, **when** its safe detail projection is built, **then** it uses only title, type, location name, route segment, confidence, freshness flag, source type, verification status, checked date, and safe HTTP URL. **And** it supplies at most six trimmed `{ label, value }` quick facts of at most 160 characters each, never arbitrary `source_snapshot` JSON, raw source material, provider payload, or operator-only metadata.
2. **Given** a descriptor offers an action, **when** its owning read model resolves it for the current user, **then** the persisted action has a registered command, answer-anchored/safe label, and descriptive arguments only while the server derives the current descriptor-bound executable target and capability set. **And** the command validates typed input, authorization, ownership, and that binding before mutation.
3. **Given** an action is source-backed or owner-context-only, **when** descriptor validation runs, **then** source-backed actions require valid provenance and owner-context actions may omit provenance only when their server command derives the target from selected owner-scoped route state. **And** unknown commands, client-derived routes, label-only behavior, arbitrary persisted target IDs, and action resolution after provenance withdrawal are rejected.

## Tasks / Subtasks

- [ ] Define the bounded persisted descriptor and safe detail contract at the existing annotation boundary (AC: 1, 3)
  - [ ] Evolve `src/features/ai/answer-annotations.ts` as the sole proposal-validation and persisted-JSON sanitization contract. Do not add a second annotation store, generic entity/action model, browser parser, or raw provenance resolver.
  - [ ] Make the safe projection allowlist explicit: title, type, location name, route segment, confidence, freshness flag, source type, verification status, checked date, and a safe HTTP(S) URL. Rebuild source-backed values only from formatted, current provenance; never trust stored/provider display JSON.
  - [ ] Permit no more than six quick facts. Require trimmed, non-empty `{ label, value }` pairs, each at most 160 characters. Reject or omit arbitrary `sourceSnapshot`, raw material, provider payload, operator fields, unbounded fields, unsafe URLs, and a seventh fact.
  - [ ] Define exactly two forward persisted action commands: `trip_change_proposal.apply` and `trip_change_proposal.dismiss`. Each action is an `action` annotation with its normal final-message `{ id, start, end, text }` binding, a safe/answer-anchored label, and `arguments: {}` only. Reject every other command or argument key/value, including target IDs, project/proposal/entity IDs, URLs-as-actions, routes, capabilities, table names, and label-only behavior.
  - [ ] Retain the completed Story 11.3 policy: provider proposals do not create `action` annotations. Only the feature-owned proposal-drafting path may write this new forward action shape after it has created a pending proposal. Legacy persisted action guidance remains permanently non-executable and must never be promoted based on its stored JSON.
  - [ ] Require source-backed action descriptors to have unique, available provenance from the same owner-scoped assistant-message set. Permit a provenance-free owner-context action only for an explicit registered command that derives its target from current selected owner-scoped route state.

- [ ] Resolve safe detail and executable capabilities from current owner-scoped state (AC: 1-3)
  - [ ] Extend the existing authenticated `getOwnedConversation`/Chat-Trips read-model path in `src/features/chat-trips/conversations.ts`, or a feature-owned server helper it calls, to resolve persisted descriptors for the current authenticated user. Keep the current `(conversationId, userId)` scope and safe `null` behavior for missing/foreign resources.
  - [ ] Consume only `formatAssistantMessageProvenance` output from `packages/database/src/provenance.ts`. A withdrawn provenance variant must yield no source detail or action; do not inspect raw `sourceSnapshot` to recover a title, URL, quote, fact, or target.
  - [ ] Treat the descriptor as historic intent, not authority. For either registered command, bind the action by the tuple `(authenticated user ID, owned conversation ID, assistant message ID, selected trip project ID, annotation ID)`. The server finds the current pending proposal whose stored `sourceAssistantMessageId` equals that assistant message and whose project/conversation/user match the tuple; it must not accept a proposal ID from persisted JSON or the browser. Resolve at most one matching proposal to `{ command, label, available: true }`; zero or multiple matches yield no capability. Stale, deleted, cross-owner, unavailable, or mismatched resources must fail closed without existence disclosure.
  - [ ] Keep detail panels derived read models rather than mutable persisted detail state. Preserve one transient selected-detail state shared by desktop/mobile surfaces.

- [ ] Bind action execution to registered owner-confirmed commands (AC: 2-3)
  - [ ] Add one annotation-action server entrypoint in `src/features/chat-trips/actions.ts` with browser input limited to `{ conversationId, assistantMessageId, annotationId, command }`. It resolves the current capability from the tuple above, rejects unknown/mismatched commands, and delegates only to `applyApprovedTripChange` or `dismissTripChangeProposal`; do not let the detail panel mutate an aggregate directly or choose a server route.
  - [ ] At the entrypoint and delegated command boundary, validate the empty typed action arguments, authenticated authorization, current ownership, selected project/conversation relationship, current pending proposal/source-message binding, and provenance availability where required immediately before mutation. Recheck after any lock wait using the established project/proposal lock and fence behavior.
  - [ ] Preserve safe current result semantics: unauthenticated requests redirect only through the established server-action boundary; foreign/missing state is `not_found`; stale aggregate state is `refresh_required`; expired state is `expired`; and no rejected action partially mutates the aggregate.
  - [ ] Do not create generic command transport, capability minting from browser inputs, client-side source lookup, client-derived routing, or a new direct database write path.

- [ ] Render only server-resolved safe detail and capabilities (AC: 1-3)
  - [ ] Update `src/features/ai/ai-ask-composer.tsx` only as a display and interaction consumer of server-returned detail/action output. It must not execute persisted URLs, targets, routes, or capabilities from JSON.
  - [ ] Render action controls only for a current server-resolved, supported capability. Do not show inert/mock unsupported actions. Withdrawn, stale, foreign, invalid, or legacy non-executable actions remain non-interactive.
  - [ ] Preserve persisted-only annotation rendering, Vietnamese-first copy, keyboard selection state, `Esc` close, focus restoration, visible focus, 44px mobile controls, and exactly one interactive desktop/mobile detail surface.
  - [ ] Preserve ordinary completed answer text when enrichment, descriptor validation, detail resolution, or action capability resolution is absent or rejected.

- [ ] Prove projection, ownership, withdrawal, execution, and UI boundaries (AC: 1-3)
  - [ ] Extend `tests/answer-annotations.test.ts` for the detail allowlist, six/160 trimmed quick-fact limit, safe HTTP URL policy, rejection of raw/provider/operator fields, the exact two-command/empty-argument schema, unknown command, label-only behavior, persisted arbitrary target IDs, permanently legacy non-executable guidance, source-backed provenance, and narrow owner-context eligibility.
  - [ ] Extend owner-scoped conversation/read coverage and `tests/ai-ask-shell.test.ts` to prove only server-resolved safe fields/actions render; ordinary answer prose survives malformed/stale descriptors; withdrawn rows and actions are source-free/non-interactive; no selection means no inspector; and keyboard/mobile focus behavior remains intact.
  - [ ] Extend `tests/trip-change-proposals.test.ts` or focused command coverage to prove action lookup uses only `(user, conversation, assistant message, selected project, annotation, command)` and `sourceAssistantMessageId`, delegates only to the two existing proposal commands, and revalidates typed input, ownership, descriptor binding, and current state immediately before mutation. Cover cross-user, cross-conversation, stale/deleted selected state, no/multiple matching pending proposal, client proposal-ID substitution, stale capability, and no partial mutation.
  - [ ] Add withdrawal-before-resolution and withdrawal-before-execution coverage. Assert no prior detail/action is resurrected after current availability changes, while the completed answer itself remains unchanged.
  - [ ] Preserve Story 11.3 final-lock/outbox behavior and add regressions only if descriptor persistence changes: no provider work in detail/action paths, no unscoped provenance input, no duplicate durable effects, and no stale post-provider annotation persistence.
  - [ ] Run focused PostgreSQL-backed suites serially with `DATABASE_URL_TEST`, then typecheck, lint, build, and whitespace validation. Record actual results only after implementation.

## Dev Notes

### Architecture And Ownership

- **AD-19 and AD-20 are authoritative.** The detail panel is a derived read model. A persisted action stores intent only: registered command, safe label, and descriptive arguments. The server derives a current descriptor-bound target/capability and validates ownership, authorization, typed input, and binding at execution. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-19`; Source: `#AD-20`]
- **Current read ownership remains Chat/Trips.** `getOwnedConversation` authenticates before querying and scopes conversation, messages, and provenance by user. Preserve its safe `null` response for missing/foreign state; do not leak cross-user resource existence. [Source: `src/features/chat-trips/conversations.ts#getOwnedConversation`]
- **Current source-detail ownership remains the provenance formatter.** `formatAssistantMessageProvenance` is the boundary that converts database rows to available or localized withdrawn traveler-safe variants. Do not read or emit raw snapshots in a detail/action resolver. [Source: `packages/database/src/provenance.ts#formatAssistantMessageProvenance`]
- **Current mutation ownership remains feature commands.** Reuse the owner-confirmed action and locked aggregate/proposal mutation patterns; server UI entrypoints call feature-owned commands rather than writing another aggregate directly. [Source: `src/features/chat-trips/actions.ts`; Source: `src/features/chat-trips/trip-change-proposals.ts#applyApprovedTripChange`]

### Existing Implementation And Required Evolution

| File | Current state to preserve | Story 11.4 evolution |
| --- | --- | --- |
| `src/features/ai/answer-annotations.ts` | Validates proposals, sanitizes hostile persisted JSON, rebuilds source-backed details from scoped formatted provenance, and limits quick facts. Provider-created `action` annotations are rejected; legacy action history is non-executable. | Define the bounded safe detail/action persisted schema, command registry validation, provenance/owner-context eligibility, and rejection of stored target/route/capability fields. Keep two-pass sanitization and provider-action rejection. |
| `src/features/chat-trips/conversations.ts` | Authenticates, scopes a conversation to its owner, groups formatted provenance per assistant message, and sanitizes stored annotations before history output. | Resolve current safe detail/action capabilities through owner-scoped state without changing the no-existence-leak behavior or querying unscoped provenance. Bind the two proposal commands through the owned conversation/assistant-message/selected-project/annotation tuple and the proposal's `sourceAssistantMessageId`, never a persisted/browser proposal ID. |
| `packages/database/src/provenance.ts` | Produces safe available/withdrawn provenance union; safe URL formatting rejects unsafe protocols, credentials, and Facebook-family hosts. | Consume this union only. Withdrawn output remains exactly unavailable and actionless. Do not broaden its raw snapshot exposure. |
| `src/features/chat-trips/actions.ts` / `trip-change-proposals.ts` | Establish typed server-action results and owner-confirmed, locked, atomic trip change operations. | Add only `trip_change_proposal.apply` and `trip_change_proposal.dismiss`. The annotation-action entrypoint receives `{ conversationId, assistantMessageId, annotationId, command }`, derives one pending proposal via `sourceAssistantMessageId`, then delegates to the existing apply/dismiss mutations for immediate lock-time revalidation. |
| `src/features/ai/ai-ask-composer.tsx` | Renders supplied persisted annotations, keeps selected detail transient, and preserves keyboard/focus/mobile-sheet behavior. | Consume only server-resolved safe detail/actions. Do not add browser target derivation, generic routing, or persisted selection state. |
| `src/features/ai/domain-outbox-worker.ts` | Sole durable annotation writer; provider work occurs outside locks and candidates are re-sanitized under final locks. | Preserve unchanged unless bounded action descriptor persistence requires final-lock schema validation. Detail/action reads must never call the provider or write annotations. |

### Data, Security, And Concurrency Guardrails

- `messages.answerAnnotations` remains hostile JSON storage. Validate both stored and provider-derived data, retain exact final-message UTF-16 range rules, and rebuild traveler-visible source fields from current scoped formatted provenance.
- Source-backed types are `source`, `place`, `hotel_area`, `route_segment`, and `cost`; they require unique available provenance owned by the current assistant message, conversation, and user. A withdrawn dependency invalidates the source-backed annotation/action rather than degrading it into a local detail.
- `warning` and `trip_fact` remain answer-local/owner-context guidance under the prior contract. The only provenance-free forward actions are `trip_change_proposal.apply` and `trip_change_proposal.dismiss`, with `arguments: {}`. Their server implementation derives one current target using the authenticated owner, selected project/conversation, assistant-message/annotation binding, and proposal `sourceAssistantMessageId`; it may not persist or accept a target surrogate.
- Legacy action annotations are historic guidance only. They are permanently non-executable even if their label resembles a registered command; only the distinct forward action shape and feature-owned proposal-drafting write path may expose a capability.
- Never treat an annotation label, title, answer prose, URL, stored ID, or client field as authority. Never use normalization, title matching, URL matching, inference, or Vietnamese prose re-parsing to recover a source or target.
- Preserve Story 11.1 snapshot, renderer-ledger, project/conversation fence, deletion cleanup, and forward-only migration guarantees. Do not alter applied migrations, rebuild `TripAnswerContext`, or reintroduce prompt-use substring inference.
- Preserve Story 11.2's read-time withdrawal boundary: localized unavailable output only, no URL, quote, quick fact, source identity, derived fact, target, or executable action after withdrawal.
- Preserve Story 11.3's durable outbox final-lock behavior. Detail/action resolution cannot hold locks during provider work, create an enrichment effect, or change completed answer content.

### Testing Requirements

Use the serial PostgreSQL test configuration and `DATABASE_URL_TEST`; do not run reset-based suites concurrently.

```bash
pnpm vitest run tests/answer-annotations.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-shell.test.ts --maxWorkers=1 --no-file-parallelism
pnpm vitest run tests/trip-change-proposals.test.ts --maxWorkers=1 --no-file-parallelism
pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

### Scope Boundaries

- Story 11.1 owns canonical `TripAnswerContext`, immutable source-bundle snapshots, prompt-use ledgers, fences, and deletion cleanup. Preserve them.
- Story 11.2 owns historical provenance withdrawal/backfill/remediation. Honor its availability contract; do not alter removal classification or cutover.
- Story 11.3 owns UTF-16 annotation validity, provenance-bound persisted descriptor creation, and durable annotation enrichment. Extend the contract only where needed for registered actions; do not create a parallel path.
- Story 11.5 owns API/BFF/OpenAPI detail, provenance, and planning-context read cutover. Do not add endpoints, BFF handlers, transport flags, dual reads, or contract migration here.
- Do not add maps, routes/ETA, weather, booking, availability, provider snapshots, expenses, collaboration, location sharing, generic place/hotel/cost aggregates, browser source discovery, or unrelated schema work.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 11.4: Bind Annotation Details and Actions to Current Ownership`]
- [Source: `_bmad-output/implementation-artifacts/epic-11-context.md#Requirements & Constraints`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-19: Detail Panel Is a Derived Read Model`; Source: `#AD-20: Selectable Answer Annotations Use Persisted, Provenance-Bound Entity Descriptors`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/11-1-publish-canonical-trip-answer-context-snapshots.md`]
- [Source: `_bmad-output/implementation-artifacts/11-2-withdraw-historical-provenance-safely.md`]
- [Source: `_bmad-output/implementation-artifacts/11-3-validate-persisted-answer-annotations.md`]
- [Source: `src/features/ai/answer-annotations.ts`]
- [Source: `src/features/chat-trips/conversations.ts`]
- [Source: `src/features/chat-trips/actions.ts`]
- [Source: `src/features/chat-trips/trip-change-proposals.ts`]
- [Source: `packages/database/src/provenance.ts`]
- [Source: `src/features/ai/ai-ask-composer.tsx`]
- [Source: `tests/answer-annotations.test.ts`; Source: `tests/ai-ask-shell.test.ts`; Source: `tests/trip-change-proposals.test.ts`]

## Story Validation

### BMad Checklist Validation

- [x] All three authoritative BDD acceptance criteria are reproduced exactly and mapped to concrete implementation tasks.
- [x] The story identifies `answer-annotations.ts` as the single persisted descriptor validation/sanitization boundary and preserves Story 11.3's final-lock revalidation.
- [x] The safe detail allowlist, safe HTTP URL requirement, and six trimmed 160-character quick-fact limits are explicit; raw snapshots, provider payloads, and operator fields are prohibited.
- [x] Executable action authority is concrete: only `trip_change_proposal.apply` and `trip_change_proposal.dismiss`, with `{}` arguments, are valid forward actions. The binding key is authenticated user, conversation, assistant message, selected project, and annotation; the server derives one pending `sourceAssistantMessageId` proposal. Persisted/client targets, routes, URLs-as-actions, capabilities, and label-only behavior are rejected.
- [x] Source-backed versus narrow owner-context action provenance eligibility is explicit, including unique available message/conversation/user scope and selected owner-scoped route derivation.
- [x] Current owner-scoped conversation/provenance read, server-derived capability, and immediately-before-mutation authorization/ownership/binding revalidation are explicit.
- [x] Withdrawal, stale/deleted resource, cross-owner, unknown-command, malformed input, target-substitution, and no-partial-mutation failure paths fail closed without existence disclosure.
- [x] Existing safe formatter, permanently non-executable legacy action compatibility, server action result semantics, lock/fence behavior, and selected-detail keyboard/mobile behavior are preserved.
- [x] Tests cover projection, persistence, owner-scoped read, capability resolution, execution-time revalidation, withdrawal races, UI non-interactivity, and completed-answer non-regression.
- [x] Story 11.1, 11.2, 11.3, and 11.5 ownership boundaries are explicit; no API/BFF cutover or unrelated product domain is included.

### Validation Outcome

Validation passed. The story is complete, traceable, and ready for development. It extends the existing persisted descriptor, provenance formatter, owner-scoped read, and feature-owned mutation boundaries rather than inventing a second source/action system. The only executable actions are explicitly registered proposal apply/dismiss commands with empty descriptive arguments; their target is derived from the current owner/conversation/message/project/annotation binding and `sourceAssistantMessageId`, never from historic JSON or browser input. Current ownership and provenance availability are re-evaluated at read and execution time, so historic annotations cannot disclose withdrawn data or authorize stale targets.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story context created and validated on 2026-07-30 from the authoritative Epic 11/Story 11.4 BDD contract, complete Epic 11 context, architecture decisions AD-19/AD-20, project context, completed Stories 11.1-11.3 records, sprint state, current annotation/provenance/conversation/action/composer implementation seams, focused tests, and recent Story 11 commits.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Validation passed before implementation: safe projection allowlist, exact two-command/empty-argument action contract, current owner/conversation/message/project/annotation binding through `sourceAssistantMessageId`, provenance withdrawal suppression, immediate pre-mutation revalidation, permanently legacy action non-executability, and API/BFF deferral are complete and traceable.
- No production code, migration, test execution, deployment, or non-story artifact was modified by this story-creation workflow.
- 2026-07-30: Unattended independent review was blocked before analysis. The supplied range `615ef9da17c81da1f6202562afc252f6d26d9088..1e53a0ac5c17f361901e2962f5d2d1a1f9143d4c` could not be constructed because the exact end object is unavailable locally. Blind Hunter failed with `fatal: Invalid revision range`; Edge Case Hunter recorded the required failed-input result; Acceptance Auditor failed with `fatal: Needed a single revision`. No substitute range was reviewed, no acceptance or scope determination was made, and no production or test files were changed. Restore or provide the exact commit object, then rerun all three layers.
- 2026-07-30: Narrow recovery independently reviewed the corrected verified range `615ef9da17c81da1f6202562afc252f6d26d9088..1e53a0a4760135f41a19bced0fa07e0254eaf6a2` synchronously with Blind Hunter, Edge Case Hunter, and Acceptance Auditor. The range passes `git diff --check`, but completion is blocked by three actionable findings: (1) [MEDIUM][patch] `ai-ask-composer.tsx:435-446` renders every persisted action annotation as an enabled inspector trigger even when no server-resolved capability exists; unsupported, stale, withdrawn, and legacy actions must remain non-interactive. (2) [MEDIUM][patch] `ai-ask-composer.tsx:1491-1506` relies only on React state for in-flight exclusion, allowing two rapid clicks before rerender to submit apply and dismiss concurrently. (3) [MEDIUM][patch] the required direct DB-backed coverage for `executeAnnotationAction` is absent; `tests/trip-change-proposals.test.ts:706-846` exercises delegated internal commands, not the public four-field browser boundary, exact-one proposal lookup, malformed input, cross-owner/cross-conversation, zero/multiple match, stale capability, and no-client-proposal-ID cases. Blind Hunter additionally noted that one-code-point answers cannot host both action markers; this is recorded as a deferred product edge case because it fails closed without exposing or mutating an unbound target. AC1 passes; AC2 and AC3 implementation align but their required public-entrypoint proof is incomplete. Scope remains compliant. No code, tests, or commits were changed during review.
- 2026-07-30: Repaired the three narrow-recovery findings without expanding story scope. Capability-less persisted `action` annotations now render as ordinary answer text, the annotation execution handler uses a synchronous ref-based in-flight guard, and PostgreSQL-backed public `executeAnnotationAction` tests cover strict four-field input, additional/malformed input, cross-user/cross-conversation isolation, zero/multiple source-message matches, stale/deleted capability, proposal-ID injection rejection, and no mutation on rejection.
- Verification completed serially with `DATABASE_URL_TEST`: `pnpm vitest run tests/trip-change-proposals.test.ts --maxWorkers=1 --no-file-parallelism` (80 passed); `pnpm vitest run tests/ai-ask-shell.test.ts --maxWorkers=1 --no-file-parallelism` (154 passed); `pnpm typecheck` passed; `pnpm lint` passed with 5 pre-existing warnings outside this repair; `pnpm build` passed; `git diff --check` passed. Status returned to `ready-for-dev`; this record does not mark the story done.
- 2026-07-30: Second and final unattended independent review of the exact verified range `615ef9da17c81da1f6202562afc252f6d26d9088..d6d82e3` completed synchronously with Blind Hunter, Edge Case Hunter, and Acceptance Auditor. Blind Hunter and Edge Case Hunter found no actionable findings; no review layer failed. Acceptance Auditor confirmed AC1 and AC3 pass and AC2 is partial: [MEDIUM][patch] `tests/trip-change-proposals.test.ts:860-909` exercises only rejected public `executeAnnotationAction` paths, not a valid four-field apply or dismiss request that delegates to the existing command and asserts its mutation/result. Required public-entrypoint success/delegation proof at task line 48 remains absent. [MEDIUM][patch] status artifacts are inconsistent: this story and the sprint entry remained `ready-for-dev`, while the generated spec declared `done`; the required authoritative story/sprint status is now synchronized to `in-progress` pending the test repair and final re-review. Scope passes. Serial verification completed with `DATABASE_URL_TEST`: annotation/context/shell suite (199 passed), proposal suite (80 passed), and outbox/command/stream suite (62 passed); `pnpm typecheck`, `pnpm build`, and requested-range `git diff --check` passed; `pnpm lint` had 0 errors and 5 pre-existing unrelated warnings. No production code, test, or commit changes were made during review.
- 2026-07-30: Final bounded repair added PostgreSQL-backed proof that a valid four-field `executeAnnotationAction` apply request resolves its one permitted current capability, delegates through the existing command, returns the allowed success result, and durably applies the plan item, proposal, and history mutation. No production behavior changed. Required serial verification with `DATABASE_URL_TEST` passed: annotation/context/shell suite (199 passed), proposal suite (81 passed), and outbox/command/stream suite (62 passed); `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` had 0 errors and 5 pre-existing unrelated warnings. The sole final independent-review finding is repaired; status is synchronized to done.

### File List

- `_bmad-output/implementation-artifacts/11-4-bind-annotation-details-and-actions-to-current-ownership.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`
- `tests/trip-change-proposals.test.ts`
