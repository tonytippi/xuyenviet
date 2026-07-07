---
title: 'Correct Trip Details Through Chat'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '0e7b886acd4a3027dde3a5fb24c850ea12b66ac5'
final_revision: 'UNCOMMITTED'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-4-use-chat-or-trip-context-in-answers.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Travelers can say corrections like "không phải 6 tuổi, bé 8 tuổi" in chat, but the system has no explicit correction contract, prompt guidance, or tests proving that corrected chat/trip details become the latest remembered context without leaking into the wrong scope.

**Approach:** Keep the existing append-only `chat_context` persistence model and latest-wins answer-context read path, but teach extraction and answer prompting to treat normal chat corrections as corrected facts or clarification triggers, then pin the behavior with direct extraction and answer-context tests.

## Boundaries & Constraints

**Always:**
- Corrections must be represented as a new active `chat_context` row for the same allowed field and scope; `loadAnswerContext` already chooses the latest row per field/scope.
- Corrections without a selected trip project stay conversation-scoped, even if the model proposes `trip_project` scope.
- Corrections inside a selected owned trip project may update project-scoped context when the wording clearly applies to the trip project; temporary chat-only details remain conversation-scoped.
- Ambiguous corrections must not overwrite remembered context; the assistant should ask a concise clarification instead of assuming the target field or scope.
- User-derived corrected values must continue through the existing validation/sanitization allowlist and sensitive-data filters.

**Block If:**
- The work requires changing the `chat_context` schema, editing/deleting superseded rows, adding a correction UI, or syncing `trip_projects` columns from chat corrections.
- Same-turn deterministic correction persistence is required before answer generation; current extraction intentionally runs via `after()` after the answer stream.

**Never:**
- No new tables, no context edit UI, no project detail edit UI, no provenance/retrieval changes, no embeddings, and no deletion behavior changes.
- No storing disallowed sensitive data, child full names, or facts outside `chatContextFieldValues`.
- No cross-user, cross-conversation, or mismatched project/conversation context writes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Conversation correction | Existing `children_ages=6 tuổi` in ordinary chat; user says `không phải 6 tuổi, bé 8 tuổi` and extraction returns corrected fact | A new conversation-scoped `children_ages=8 tuổi` row is inserted; future answer context uses `8 tuổi` | No error expected |
| Project correction | Existing selected trip project context has an old durable field; user corrects it while chatting in that project | A new trip-project-scoped row is inserted for the selected owned project; future project answers use the corrected value | No error expected |
| Ordinary chat proposes project scope | No trip project is selected; extraction output uses `scope=trip_project` | Parser coerces the fact to conversation scope; no project context row is inserted | No error expected |
| Ambiguous correction | User says `sửa lại thành 8 nhé` and extraction cannot identify a valid field | No new context row is inserted; answer prompt guidance favors a concise clarification | No error expected |
| Future answer after correction | Old and corrected rows exist for the same field/scope before the next answer | Gateway answer prompt contains the corrected value and omits the superseded value from the remembered context section | No error expected |

</intent-contract>

## Code Map

- `src/features/ai/prompts.ts` -- owns AI Ask answer prompt and chat/trip context extraction prompt; add correction and ambiguity guidance without changing message shapes.
- `src/features/chat-trips/context-extraction.ts` -- existing extraction parser/persistence path; keep append-only semantics and scope coercion, rely on tests to pin correction behavior.
- `src/features/chat-trips/answer-context.ts` -- existing latest-wins context read path; no behavior change expected beyond tests proving corrected values drive future answers.
- `src/app/api/ai-ask/stream/route.ts` -- extraction remains scheduled after streaming; answer prompt should be able to ask clarification from current message plus prior remembered context.
- `tests/chat-trip-context-extraction.test.ts` -- add correction persistence, scope, and ambiguity regression tests.
- `tests/answer-context.test.ts` -- add future-answer corrected-value regression tests for latest-wins context injection.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/prompts.ts` -- update extraction prompt with explicit correction semantics and update answer prompt with concise clarification guidance for ambiguous remembered-context corrections -- makes normal chat corrections first-class without adding schema or UI.
- [x] `tests/chat-trip-context-extraction.test.ts` -- add tests for conversation correction, project correction, ordinary-chat project-scope coercion, and ambiguous no-overwrite -- verifies correction persistence stays owner/scope safe.
- [x] `tests/answer-context.test.ts` -- add tests that future answer context uses the corrected latest value and omits the superseded value from the prompt -- verifies corrections affect future answers.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 3.5 in progress during implementation and done after verification -- keeps BMad sprint status aligned.

**Acceptance Criteria:**
- Given an authenticated traveler corrects a remembered chat detail in normal conversation, when extraction stores context for that message, then future answers use the corrected value as the latest conversation-scoped fact.
- Given an authenticated traveler corrects a durable trip detail while working inside a selected owned trip project, when extraction stores context for that message, then future project answers use the corrected project-scoped value.
- Given a traveler makes an ambiguous correction, when the system cannot determine the target field or scope, then no remembered context is overwritten and the assistant asks a concise clarification.
- Given a traveler corrects a chat-only detail outside a selected trip project, when extraction returns or implies project scope, then the correction does not update any trip project context.

## Spec Change Log

Empty -- no bad_spec loopback occurred.

## Review Triage Log

### 2026-07-07 -- Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 2, low 0)
- defer: 0
- reject: 8
- addressed_findings:
  - `[medium]` `[patch]` `src/features/chat-trips/context-extraction.ts` -- added parser-side vague-correction rejection so a model guess for text like `Sửa lại thành 8 nhé` is not persisted unless the user's message names a recognizable correction target.
  - `[medium]` `[patch]` `src/features/ai/prompts.ts` -- replaced the hardcoded `destination=Đà Nẵng` extraction output example with neutral placeholders to avoid biasing vague corrections toward a destination fact.

## Design Notes

- This story intentionally uses append-only correction: a correction is just a newer active row for the same field and scope. That preserves auditability and avoids premature edit/delete semantics before Stories 3.6 and 3.7 define deletion behavior.
- Current-turn corrections are not guaranteed to affect the same streamed answer because extraction runs via `after()`. The same answer can still ask clarification using the current user message and remembered context; persisted corrected context affects later answers.

## Verification

**Commands:**
- `pnpm test:run tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts` -- expected: Story 3.5 targeted tests pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: all tests pass.
- `pnpm build` -- expected: production build succeeds.

## Auto Run Result

**Summary:** Implemented Story 3.5 -- Correct Trip Details Through Chat. The extraction prompt now treats normal corrections as new allowed facts, refuses vague correction targets, and keeps project scope unavailable corrections conversation-scoped. The parser also rejects provider-returned facts for vague correction messages that do not name a recognizable target. The answer prompt asks a concise clarification when remembered-context corrections are ambiguous. Existing append-only persistence and latest-wins answer context behavior are pinned by targeted regression tests.

**Files changed:**
- `src/features/ai/prompts.ts` -- bumped answer/extraction prompt versions, added correction/clarification guidance, and replaced the hardcoded extraction example with neutral placeholders.
- `src/features/chat-trips/context-extraction.ts` -- rejects provider-returned facts for vague correction messages with no recognizable target before persistence.
- `tests/chat-trip-context-extraction.test.ts` -- added correction persistence, project correction, no-project scope coercion, and ambiguous no-overwrite tests.
- `tests/answer-context.test.ts` -- added latest-corrected-value prompt tests for conversation and trip-project context.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 3.5 done after verification.

**Review findings breakdown:**
- Patches applied: 2 (0 high, 2 medium, 0 low).
- Items deferred: 0.
- Items rejected: 8.
- Follow-up review recommendation: false -- review-driven changes were localized to one parser guard and one prompt-example neutralization, with targeted and full verification passing.

**Verification performed:**
- `pnpm test:run tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts` -- passed; 2 files, 27 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm test:run` -- passed; 10 files, 143 tests.
- `pnpm build` -- passed; 8 pages generated.

**Residual risks:**
- Same-turn correction freshness remains one turn stale by design because extraction runs after answer streaming.
- Ambiguity handling depends on model compliance with prompt guidance; persistence remains protected by field/scope allowlists and parser validation.

**Blockers:** None.
