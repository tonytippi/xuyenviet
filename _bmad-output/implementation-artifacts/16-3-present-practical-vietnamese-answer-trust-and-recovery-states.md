---
baseline_commit: 9161d4e0fca3699fa080686993dad6d158c0e7d7
---

# Story 16.3: Present Practical Vietnamese Answer, Trust, and Recovery States

Status: review

## Story

As a traveler,
I want answers, verification guidance, feedback, and recovery states expressed in clear practical Vietnamese,
so that I can act on travel guidance without seeing product internals or being pulled away from the conversation.

## Acceptance Criteria

1. **Calm, scannable answer path**
   - **Given** a persisted assistant answer is displayed
   - **When** it contains plan/options, rationale, practical tips, changing-detail guidance, or a next step
   - **Then** the default reading path is a calm, scannable Vietnamese conversation with relevant section chips and no mandatory outer answer card
   - **And** generic provenance, confidence, source-category, retrieval, reasoning, audit, processing, provider, model, request-ID, error-code, or diagnostic UI is absent.

2. **Safe, action-oriented verification disclosure**
   - **Given** persisted provenance shows a traveler-relevant verification need or safe source detail
   - **When** the answer or selected descriptor renders a disclosure
   - **Then** it uses a compact nearby plain-language explanation and an optional action-oriented trigger such as `Cần kiểm tra gì?` or `Xem nguồn tham khảo`
   - **And** the detail view resolves only stored traveler-safe provenance projections, never raw source material or answer-prose inference.

3. **Practical recovery projection**
   - **Given** the traveler encounters loading, streaming completion, unavailable detail, verification guidance, provider failure, stale planning state, or a retryable command failure
   - **When** the state is projected to the traveler
   - **Then** it states the practical situation and the permitted recovery action in Vietnamese
   - **And** it never renders machine-state discriminators, provider/model names, source/provenance taxonomy, confidence codes, internal status/job/consumer names, request IDs, error codes, or diagnostics.

4. **Accessible, non-disruptive interactions**
   - **Given** a feedback control, typed trip recommendation, verification disclosure, or recovery action is rendered
   - **When** the traveler uses keyboard, touch, or assistive technology
   - **Then** it has an accessible name, visible focus, appropriate `aria-live` announcement where state changes, and a mobile target of at least 44px
   - **And** it does not steal focus from or create a persistent card that displaces the composer.

5. **Predictable terminal focus and reduced motion**
   - **Given** an answer, source detail, proposal, or sheet is closed or reaches a terminal action
   - **When** focus returns to the conversation
   - **Then** it returns predictably to the initiating control or relevant composer state
   - **And** reduced-motion preferences suppress non-essential reveal, sheet, and toast transitions.

## Tasks / Subtasks

- [x] Simplify the persisted assistant-answer reading path (AC: 1)
  - [x] In `apps/web/src/features/ai/ai-ask-composer.tsx`, preserve persisted-message rendering, UTF-16 annotation ranges, and the existing section-chip anchor navigation in `AssistantMessageContent`; remove the mandatory bordered/shadowed answer and per-section card treatment.
  - [x] Retain only traveler-oriented section headings in the default hierarchy. Do not use legacy headings such as `Nguồn và độ tin cậy`, `Cảnh báo cần kiểm tra`, or `Điều chưa chắc chắn` as generic technical sections or as a trust-state signal.
  - [x] Preserve user-message rendering, typed trip-recommendation behavior, proposal rendering, direct NDJSON framing, and persisted answer reconciliation. This story changes presentation, not AI Ask command, stream, or Trip Project behavior.

- [x] Replace generic provenance UI with compact persisted disclosures (AC: 1-2)
  - [x] Refactor `AssistantProvenanceBlock` to render only a nearby practical verification sentence when the stored projection makes verification relevant, plus an optional action-oriented trigger. Use Vietnamese copy such as `Thông tin này có thể thay đổi. Kiểm tra lại trước khi đi hoặc đặt dịch vụ.`, `Cần kiểm tra gì?`, and `Xem nguồn tham khảo` where appropriate.
  - [x] Remove default traveler-visible generic source headings, categories, confidence labels, source types, trust/policy labels, reasoning labels, evidence quotes, conditions, provenance IDs, retrieval terms, and raw URL display. Never disclose `general` as AI reasoning or expose source taxonomy.
  - [x] Keep `createProvenanceAnswerEntityDescriptor(...)` identity bindings, `provenanceIds`, message/conversation binding, and safe URL handling intact. A disclosure is selected only from persisted safe `message.provenance` or persisted annotations; never parse answer text to infer a source, warning, or verification need.
  - [x] Reuse the existing selected-answer detail panel and `loadAnswerDetail(...)` projection. Do not add a second detail fetch, a browser provenance store, a modal stack, a Next route handler, or browser database access.
  - [x] Update `AnswerDetailPanel` as well as `AssistantProvenanceBlock`. For a source/verification disclosure, show only a traveler-safe title, practical verification instruction, optional safe URL with an action label, and safe checked date when present. For `place`, `hotel_area`, `route_segment`, `cost`, `warning`, and `trip_fact` descriptors, retain only bounded server-projected traveler-useful summary and quick facts. Never render `provenanceIds`, generic `detail` object entries, source category/type, confidence or trust labels, evidence/conditions, raw URL text, AI reasoning, or other trust taxonomy.
  - [x] For unavailable or withdrawn detail, keep the practical verification instruction and safe label/date only when present. Preserve the safe indistinguishable `detail: null` behavior for missing, foreign, and unavailable detail; never expose raw material as fallback.
  - [x] Preserve `DirectShellLoader.enrich(...)`: hydrate each persisted assistant message independently through `loadAnswerDetail(candidate.id, message.id)`, fall back to `detail: null` on a failed read, and merge `content`, `provenance`, and `annotations` only when both returned `conversationId` and `assistantMessageId` match the persisted shell message. A null, foreign, or mismatched detail result leaves the original persisted shell message unchanged.
  - [x] Replace implementation-facing annotation accessible names with traveler-oriented action labels while retaining `aria-controls`, `aria-expanded`, `aria-pressed`, and persisted capability gating. A historic action annotation remains inert unless its current owner-scoped capability is available.

- [x] Make feedback a compact answer-footer interaction without changing its contract (AC: 1, 4)
  - [x] Rework `AnswerUsefulnessFeedbackControl` from a full-width card into quiet answer-footer actions: `Hữu ích` and `Chưa đúng ý`.
  - [x] Keep the existing immediate rating save on either footer action. Reveal an optional targeted reason/comment input only after persisted or newly selected negative feedback; switching to `Hữu ích` must not leave the negative-only editor visible. The optional comment remains keyboard/touch reachable and does not block composing, move the composer, or consume card-sized vertical space.
  - [x] Preserve `handleSaveAnswerUsefulnessFeedback` in-flight deduplication, message-scoped optimistic update, max-length handling, retryable failure behavior, `saveAnswerUsefulnessFeedbackAction`, direct client parser, CSRF admission, and existing server-side Feedback/Eval ownership. Do not alter database/API contracts or introduce client persistence.
  - [x] Provide a polite local or global announcement for feedback save success/failure and pending state. Retain focus on the activated footer or comment-save control after a terminal result unless that control was removed; do not move focus merely because feedback state changed. All footer controls and the optional save action must meet the 44px target floor and visible-focus convention.

- [x] Project all traveler states as bounded Vietnamese recovery copy (AC: 3)
  - [x] Update `AiAskComposer` preparation, streaming, in-progress/retry, persisted-answer failure, refresh-required, detail-unavailable, and consumer-status presentation to state only the practical effect and permitted next action. A partial streamed answer remains visibly provisional until the persisted terminal answer reconciles; it must not be represented as saved.
  - [x] Keep a completed answer usable when optional follow-up work is delayed or unavailable, but hide consumer categories and processing terminology unless an actual traveler action needs a plain-language explanation.
  - [x] Remove the legacy technical headings `Cảnh báo cần kiểm tra`, `Nguồn và độ tin cậy`, and `Điều chưa chắc chắn` from `assistantSectionHeadings` rather than renaming them into generic trust sections. Suppress category-derived `AiAskConsumerStatusNotice` copy; when a completed answer needs a follow-up notice, render one bounded practical Vietnamese message without naming consumer category, processing stage, or internal status.
  - [x] Update `DirectShellLoader` loading and unavailable/authentication surfaces with polite status semantics, practical Vietnamese copy, visible focus, and safe recovery. Preserve stale scope reconciliation to `/ai-ask`, the generic missing/foreign/unlinked outcome, and sign-in recovery.
  - [x] Do not interpolate `DirectApiError.code`, raw error messages, provider payloads, model names, IDs, source/provenance fields, status discriminators, job/consumer names, diagnostics, or server error taxonomy into traveler copy.

- [x] Preserve detail/sheet focus and reduced-motion behavior (AC: 4-5)
  - [x] Reuse `answerEntityTriggerRef`, `closeAnswerDetailPanel()`, existing `Escape` handling, mobile focus trap, body-scroll cleanup, and composer fallback. Do not introduce another dialog or bypass the existing desktop-panel/mobile-sheet single-selection model.
  - [x] After disclosure close, terminal feedback/recovery action, or terminal proposal/sheet behavior, return focus to the initiating control when it remains connected; otherwise focus the composer/relevant established fallback. Do not steal focus merely because a disclosure or feedback footer appears.
  - [x] Add `motion-reduce:transition-none` to changed section chips, annotation/disclosure triggers, feedback controls, and detail-panel close/action controls that use local `transition`, following existing sheet-close controls. Preserve the global reduced-motion fallback in `apps/web/src/app/globals.css`; do not sweep unrelated sidebar or composer transitions unless their code is otherwise changed.

- [x] Add focused regression coverage (AC: 1-5)
  - [x] Extend `tests/ai-ask-direct-api.test.ts` for strict `loadAnswerDetail()` cookie-authenticated/safe-parser behavior and `saveDirectAnswerUsefulnessFeedback()` CSRF request/result behavior, including malformed safe responses.
  - [x] Preserve and extend `tests/answer-annotations.test.ts` and `tests/knowledge-source-removal.test.ts` coverage for persisted-provenance-only detail, cross-message/unsafe annotation rejection, withdrawn provenance, and safe unavailable projections. These server-side tests do not replace traveler-rendering coverage.
  - [x] Add infrastructure-free component-compatible or source-level web tests using the existing Vitest setup for: available, freshness-sensitive, withdrawn, and `detail: null` disclosure render paths; allowed Vietnamese copy and absence of category, confidence, source type, trust labels, evidence, conditions, raw URL text, and provenance IDs; `DirectShellLoader.enrich(...)` matching, null, and mismatched message/detail identity behavior; negative-only feedback editor, immediate rating submission/retry, pending disablement, message-scoped update, and composer availability; generic Vietnamese streaming/consumer/recovery copy with transient streamed content visibly provisional; connected-trigger and composer fallback focus restoration; and reduced-motion classes on changed controls. Do not introduce a new UI-test framework for this story.
  - [x] Run focused unit tests, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Use `pnpm test:integration` only if a changed test reads/mutates PostgreSQL; keep it serial and call `resetTestDatabase()` in each clean-table suite.

## Dev Notes

### Scope and Product Intent

Story 16.3 is a presentation and accessibility slice over completed persisted provenance, feedback capture, direct API, and URL-owned shell baselines. The traveler should receive a calm Vietnamese answer first, see a compact verification cue only when it affects a decision, and recover from failures without learning implementation vocabulary.

The implementation must simplify UI without weakening provenance safety. The browser consumes only owner-scoped, persisted, bounded projections and never produces trust state from assistant prose. Feedback remains a server-owned Feedback/Eval mutation; selected detail remains one derived UI state shared by desktop panel and mobile sheet.

### Architecture Compliance

- **Persisted provenance is the sole trust input.** Use stored response provenance and persisted annotations only. The default answer path must not display generic source/confidence/retrieval/reasoning/audit/provider data. [Source: `ARCHITECTURE-SPINE.md#AD-11`, `#AD-20`]
- **One URL-owned shell and derived detail state.** `apps/web/src/app/ai-ask/page.tsx` remains the route parser, `DirectShellLoader` remains the direct API loader, and `AiAskComposer` owns only transient workspace state. The desktop panel and mobile sheet are controlled views of one selected descriptor. [Source: `ARCHITECTURE-SPINE.md#AD-24`, `#AD-19`]
- **Plain-language state projection.** Traveler loading, unavailable, verification, and failure text must give a practical Vietnamese effect and recovery action; no technical discriminators or safe-error metadata may surface. [Source: `ARCHITECTURE-SPINE.md#AD-30B`; PRD `#FR-46A`, `#AC-27`]
- **Direct API boundary remains intact.** Browser calls stay relative and credentialed, mutations retain CSRF and strict parsers, Nest owns principal/session admission, and no Next server action/BFF/domain writer/browser DB access is added. [Source: `ARCHITECTURE-SPINE.md#AD-33`; `_bmad-output/project-context.md#Framework-Specific Rules`]
- **Feedback persistence is not presentation-owned.** Preserve the direct feedback command/result contract and server ownership. UI simplification may not turn feedback into local-only state or a no-op. [Source: `packages/contracts/src/index.ts#SaveAnswerUsefulnessFeedbackCommand`; `apps/web/src/features/ai/direct-api-client.ts#saveDirectAnswerUsefulnessFeedback`]
- **Streaming protocol and terminal semantics are immutable here.** Do not change `submitDirectAiAskStream`, `AiAskStreamEvent`, idempotency, scope selection, or command persistence. The UI only translates their current safe outcomes. [Source: `ARCHITECTURE-SPINE.md#AD-16`; `apps/web/src/features/ai/direct-api-client.ts#submitDirectAiAskStream`]

### Existing Code to Extend

| File | Current responsibility | Story 16.3 change / preservation |
|---|---|---|
| `apps/web/src/features/ai/ai-ask-composer.tsx` | Answer hierarchy, persisted annotation/provenance display, feedback, streaming/recovery UI, selected-detail focus/sheets. | Main implementation surface. Simplify answer/trust/feedback presentation and copy while preserving state machines, bindings, capability checks, focus trap, and one detail selection. |
| `apps/web/src/features/chat-trips/direct-shell-loader.tsx` | Direct shell reads, owner-safe detail hydration, stale-scope reconciliation, shell loading/failure views. | Improve traveler loading/unavailable accessibility and copy only; preserve detail hydration, URL reconciliation, and one loader. |
| `apps/web/src/features/ai/direct-api-client.ts` | Strict relative cookie-authenticated reads/mutations, CSRF, safe parsers, byte-sensitive stream protocol. | Reuse unchanged; extend focused tests only unless a strictly presentation-required safe wrapper gap is discovered. |
| `packages/contracts/src/index.ts` | Strict answer-detail and usefulness-feedback contracts. | Preserve exact projections/parsers. No new traveler source taxonomy or client-derived trust contract. |
| `tests/ai-ask-direct-api.test.ts` | Direct-client read/command/stream contracts. | Add detail/feedback client coverage without database requirements. |
| `tests/answer-annotations.test.ts` | Persisted annotation and provenance binding safety. | Preserve/add tests proving details are persisted/provenance-bound, never prose-derived. |
| `tests/knowledge-source-removal.test.ts` | Withdrawn-source traveler-safe projection behavior. | Preserve the unavailable-safe projection while changing disclosure appearance. |

### UX and Accessibility Guardrails

- The answer reads as companion guidance: orientation, scannable plan/options, practical next step, and at most a few concise follow-ups. Section chips remain compact navigation, not generic trust taxonomy. [Source: `EXPERIENCE.md#Assistant answer`, `#Section chips`]
- A source disclosure appears only where useful and says what to verify and why. It may use safe title/link/checked date in the selected detail surface, but never raw material, categories, confidence codes, provenance IDs, retrieval policy, provider/model data, or diagnostics. [Source: `EXPERIENCE.md#Source summary row`, `#Source detail`, `#Trust, Privacy, And Provenance`]
- Use compact footer feedback. Optional reason/comment appears only after negative feedback and never displaces or blocks the composer. [Source: `EXPERIENCE.md#Usefulness rating`; PRD `#FR-46`]
- Keep existing `aria-live`, keyboard, `Escape`, focus-return, and mobile sheet mechanics. All interactive controls need accessible action-oriented names, visible focus, and at least 44px mobile targets. [Source: `EXPERIENCE.md#Interaction Primitives`, `#Accessibility Floor`]
- Respect `prefers-reduced-motion`; all newly touched local transitions should use the existing `motion-reduce:transition-none` pattern. [Source: `EXPERIENCE.md#Accessibility Floor`; `apps/web/src/app/globals.css`]
- Do not create a persistent answer or feedback card that moves the composer out of the active conversation flow. Do not add a modal on top of the existing mobile detail sheet. [Source: `EXPERIENCE.md#Responsive navigation`, `#Rejected patterns`]

### Explicitly Out of Scope

- Changes to persisted provenance schema, source-bundle composition, retrieval policy, annotation generation, raw-source access, ownership checks, or answer-detail API semantics.
- Changes to Feedback/Eval persistence, feedback API/controller/database behavior, or feedback analytics.
- Changes to typed trip recommendation policy/actions, Trip Project scope/navigation, primary-conversation invariants, or Story 16.2 shell work.
- Changes to direct API protocol, AI provider integration, NDJSON framing, idempotency, AI Ask command lifecycle, consumer/worker execution, or error contracts.
- New dependencies, a new global state manager, a new UI/component-test framework, maps, booking, route/weather/availability claims, budget, checklist, collaboration, or new services.
- Story 16.4's final cross-epic ownership/privacy/responsive accessibility verification matrix.

### Testing Requirements

- Use `pnpm test:unit` for the direct-client, presentation helper, and source-level/component-compatible tests. These tests must not require `DATABASE_URL`, `DATABASE_URL_TEST`, migrations, or PostgreSQL.
- If integration behavior is changed unexpectedly, use `pnpm test:integration`; integration files are serial and every clean-table suite explicitly calls `resetTestDatabase()` in local setup.
- Test behavior, not only class names: persisted-only trust disclosure, safe unavailable detail, feedback mutation/result updates, composer remains usable, bounded Vietnamese recovery text, and focus/live-region behavior.
- Preserve existing anti-leak tests. Assert both positive allowed copy and absence of forbidden technical terms/fields in traveler render paths.

### Recent Git Intelligence

- `f2e9138 feat(trips): preserve planning shell scope` added the single direct-shell project-list flow, typed recommendation consumption, canonical scope routing, and focus behavior.
- `9161d4e fix(trips): harden planning shell scope` repaired stale-shell interaction, stale recommendation reconciliation, duplicate project actions, desktop focus fallback, and duplicate sidebar identities.
- Treat these as active constraints: Story 16.3 must not introduce a second shell loader, change scope authority, or regress current focus/reconciliation repairs.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 16`, `#Story 16.3`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#FR-7`, `#FR-32`, `#FR-33`, `#FR-46`, `#FR-46A`, `#AC-27`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-11`, `#AD-16`, `#AD-19`, `#AD-20`, `#AD-24`, `#AD-30B`, `#AD-33`]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Assistant answer`, `#Source summary row`, `#Usefulness rating`, `#State Patterns`, `#Interaction Primitives`, `#Accessibility Floor`, `#Trust, Privacy, And Provenance`]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-05-epic-16.md#Story Quality And Ordering`, `#Non-Blocking Findings`]
- [Source: `_bmad-output/implementation-artifacts/16-2-preserve-explicit-trip-scope-in-the-planning-shell.md#Architecture Compliance`, `#Review Findings`]
- [Source: `_bmad-output/project-context.md#Testing Rules`, `#Critical Don't-Miss Rules`]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- Story context created from the Epic 16 contract, current PRD, architecture/UX spines, readiness report, Story 16.1 and 16.2 implementation/review intelligence, direct-shell/API contracts, current answer/provenance/feedback implementation, and commits `f2e9138` and `9161d4e`.
- Existing behavior analysis confirmed that `AiAskComposer` already owns answer rendering, persisted-provenance display, feedback, transient streaming/recovery state, selected-detail focus, and mobile detail-sheet trapping. `DirectShellLoader` already enriches assistant messages with owner-safe answer detail and reconciles stale scope.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Status set to `ready-for-dev`.
- The guide explicitly preserves persisted-provenance-only disclosure, existing usefulness-feedback persistence, direct API/CSRF/parser boundaries, one URL-owned shell, one selected-detail state, and prior Story 16.2 scope/focus repairs.
- Simplified persisted assistant answers into a calm conversation flow with section chips but no mandatory answer or per-section cards; removed legacy trust headings and category-derived follow-up copy.
- Replaced generic provenance displays with persisted, practical Vietnamese verification cues. The existing selected detail surface now exposes only safe title, instruction, optional action-labeled URL, checked date, and server-projected quick facts.
- Converted feedback to compact `Hữu ích` and `Chưa đúng ý` footer actions, retaining immediate direct API saves, negative-only optional comments, live pending feedback, message-scoped updates, and established focus behavior.
- Added direct-client regressions for strict persisted answer-detail parsing and CSRF feedback results, plus source-level UI boundary coverage for practical copy, taxonomy removal, and reduced-motion controls.
- Validation passed: `pnpm test:unit` (23 files, 226 tests), `pnpm lint` (0 errors, 45 pre-existing warnings), `pnpm typecheck`, `pnpm build`, and `git diff --check`. No integration test was required because this story changed no PostgreSQL behavior.

### File List

- `_bmad-output/implementation-artifacts/16-3-present-practical-vietnamese-answer-trust-and-recovery-states.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/web/src/features/ai/ai-ask-composer.tsx`
- `apps/web/src/features/chat-trips/direct-shell-loader.tsx`
- `tests/ai-ask-direct-api.test.ts`
- `tests/traveler-ui-foundation.test.ts`

### Change Log

- 2026-08-05: Implemented practical Vietnamese answer, persisted verification disclosure, compact feedback, and recovery/accessibility presentation for Story 16.3.
