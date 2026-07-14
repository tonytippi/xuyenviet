---
title: 'Story 5.10: Generate And Validate Answer Annotations'
type: 'feature'
created: '2026-07-14'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-5-persist-retrieval-decision-and-answer-provenance.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-6-render-clickable-answer-annotations.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Inline highlights should be backed by structured, validated answer annotations, but the frontend must not guess clickable phrases from Vietnamese free text. Without a backend annotation contract, highlights can drift from source provenance, mislead users, or expose unsafe details.

**Approach:** Extend the AI Ask answer generation/finalization path so assistant answers may include structured annotations tied to current-turn provenance, chat/trip context, warnings, and safe action descriptors. Validate annotation offsets and references server-side, persist or include the sanitized annotation read model with the assistant message, and drop anything invalid before it reaches the traveler UI.

## Boundaries & Constraints

**Always:**
- Treat backend/model annotations as proposals until server validation passes.
- Validate annotation ranges against the final persisted assistant answer text after any formatting/finalization step.
- Validate each referenced provenance id belongs to the current assistant answer and authenticated user/conversation.
- Build traveler-facing annotation detail descriptors from safe provenance/context read models, not raw model-provided detail blobs.
- Preserve existing `assistant_response_provenance` as the source of truth for source labels, verification status, URLs, checked dates, and freshness flags.
- Preserve existing conversations without annotations; missing annotations must not block answer display.
- Drop invalid, overlapping, duplicate, unauthorized, or unsafe annotations instead of failing the answer after the assistant message is otherwise valid.
- Keep web search facts external/unverified and keep general reasoning clearly labeled as not a verified source.
- Record prompt/schema version changes for AI Ask answer generation when annotation output expectations change.

**Block If:**
- The database deletion contract for any new persisted annotation table is unclear. If annotations are persisted outside existing message payload/read model storage, chat/project deletion behavior must be defined before migration approval.
- The model/gateway cannot reliably return structured annotation proposals without corrupting normal answer content. In that case, keep annotations disabled and ship only the frontend renderer.

**Never:**
- Do not trust model-provided URLs, source labels, verification labels, provider scores, or raw source excerpts for traveler detail display.
- Do not let annotations reference provenance from another user, another conversation, another assistant answer, draft/archived knowledge, raw source material, or operator-only data.
- Do not create annotations by frontend free-text parsing.
- Do not make annotation persistence a new hidden source of truth for provenance.
- Do not block answer generation solely because optional annotation generation fails.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Knowledge-backed place annotation | Final answer mentions `Vinh`; model proposes range tied to current answer provenance for an approved knowledge card | Server validates range/reference and returns an annotation whose detail descriptor is built from stored provenance | No error expected |
| Web freshness warning | Final answer includes a price/opening-hours warning tied to web provenance | Annotation renders as warning/unverified/freshness-sensitive using stored provenance metadata | No error expected |
| Trip context annotation | Answer references `đi cùng trẻ nhỏ` from chat/trip context provenance | Annotation references safe context category and labels it user-provided context, not external verified source | No error expected |
| Bad offset | Model returns start/end that do not match final answer text | Annotation is dropped; answer still displays | Log/debug metric if existing pattern exists |
| Cross-answer provenance reference | Model references a provenance id from another answer/conversation/user | Annotation is dropped before client payload | No data leak |
| Overlap or duplicate | Model returns overlapping ranges or duplicate ids | Server normalizes by deterministic earliest non-overlapping order or drops duplicates | Answer still displays |
| Annotation generation failure | Gateway returns plain answer or malformed annotation JSON | Persist/display answer and provenance normally with no annotations | No user-facing failure beyond missing highlights |

</intent-contract>

## Code Map

- `src/features/ai/prompts.ts` -- add or version AI Ask prompt/schema guidance for optional annotation proposals, with explicit rules that annotations must reference provided source/provenance handles and must not invent detail metadata.
- `src/app/api/ai-ask/stream/route.ts` -- integrate annotation validation after final answer text exists and after `ensureAiAskFreshnessWarning` has produced the exact persisted assistant text. Current flow streams provider deltas first, appends any freshness warning delta, then persists assistant message, provenance, and usage in one transaction before sending the `done` event. Annotations must attach to that same final `done` assistant message payload and must not require pre-stream annotation availability.
- `src/features/retrieval/provenance.ts` or adjacent AI orchestration read-model module -- add safe builder that maps validated provenance/context references into `AnswerEntityDescriptor`/annotation read models.
- `src/db/schema.ts` and migration files -- only if annotations need durable persistence outside the existing message/read model path; include deletion behavior tied to conversation deletion.
- `tests/answer-annotations.test.ts` or `tests/ai-ask-shell.test.ts` -- cover server validation, safe descriptor construction, invalid proposal dropping, cross-user/reference rejection, and client payload shape.

## Tasks & Acceptance

**Execution:**
- [ ] Define the canonical server-side `AnswerAnnotation` proposal and sanitized read-model types -- makes the backend/frontend contract explicit.
- [ ] Update AI Ask prompt/schema expectation so the model may propose annotations with text ranges and current-turn provenance/context references -- enables backend-sourced highlights without frontend guessing.
- [ ] Add server validation for offsets, text match when available, duplicate ids, overlap, current-answer provenance ownership, and allowed annotation types -- prevents misleading or unsafe highlights.
- [ ] Build annotation detail descriptors from stored provenance/context data only -- keeps source/trust labels authoritative and traveler-safe.
- [ ] Attach sanitized annotations to assistant messages returned in the stream `done` event and any later conversation read model, preserving no-annotation fallback -- wires the backend contract into the existing UI renderer.
- [ ] Keep annotation failure outside the atomic assistant/provenance/usage success path unless annotations are persisted in the same transaction by explicit design -- prevents optional highlight generation from causing a completed answer to be reported as failed.
- [ ] If annotations are persisted, add schema/migration plus conversation/project deletion behavior; otherwise document why annotations are transient/read-model only -- prevents hidden retrievable content from escaping deletion rules.
- [ ] Add tests for knowledge, web, chat/trip context, general reasoning, freshness warning, invalid offsets, overlap, malformed output, and cross-user/cross-answer reference rejection -- pins correctness and safety.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update story state during implementation and completion -- keep BMad status aligned.

**Acceptance Criteria:**
- Given the model proposes annotations for a final assistant answer, when server validation succeeds, then the client receives sanitized annotations that render as clickable inline highlights tied to the existing detail panel.
- Given `ensureAiAskFreshnessWarning` appends warning text after provider streaming, when annotation offsets are validated, then validation uses the final persisted assistant content, not the raw provider content.
- Given an annotation references provenance or context, when the descriptor is built, then source/confidence/freshness labels come from stored provenance/context read models rather than model-generated detail text.
- Given the model returns invalid ranges, overlapping ranges, malformed JSON, duplicate ids, or references outside the current answer/user/conversation, when validation runs, then invalid annotations are dropped and the assistant answer still displays.
- Given an existing conversation has assistant messages without annotations, when opened, then it renders normally and source/provenance fallback remains available.
- Given annotations are persisted, when the owning chat session or trip project is deleted, then annotations are removed or disabled from normal UI/retrieval according to the established deletion contract.
- Given traveler UI receives annotation data, when inspected, then raw source material, provider metadata, operator-only fields, and unauthorized provenance references are absent.

## Design Notes

- Target architecture: backend decides what is clickable; frontend decides how clickable things look and behave.
- Annotation generation is optional. The answer and provenance path remains successful even when annotation proposals are missing or invalid.
- Prefer annotation references to existing provenance rows/handles over model-provided titles or URLs. The model can identify the text span; the server decides what safe detail to show.
- Existing provenance formatter already strips traveler-facing detail down to safe fields (`title`, `sourceType`, `url`, `checkedAt`, `confidenceLabel`, `verificationStatus`, `freshnessSensitive`). Reuse or extend this safe read model instead of exposing raw `sourceSnapshot` keys such as `providerScore`, snippets, or operator-only source material.

## Verification

**Commands:**
- `pnpm test:run tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts` -- expected: annotation validation and client rendering tests pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: full suite passes.
- `pnpm build` -- expected: production build succeeds.
