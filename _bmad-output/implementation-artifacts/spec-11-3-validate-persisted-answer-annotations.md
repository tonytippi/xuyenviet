---
title: 'Validate Persisted Answer Annotations'
type: 'feature'
created: '2026-07-30'
status: 'done'
baseline_revision: 'd96a20feb699a047bbdfb5dd9ab7a820dce35621'
final_revision: 'PENDING_COMMIT'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/11-3-validate-persisted-answer-annotations.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Persisted selectable answer annotations must be evidence about the immutable final assistant text and its scoped, available provenance. Existing validation is close, but duplicate and source-free policies can retain unsafe or inconsistent descriptors.

**Approach:** Harden the existing proposal validator, final locked sanitizer, owner-scoped history read, and display guard. Rebuild source-backed details only from formatted scoped provenance, while accepting only canonical local warning/trip-fact guidance without provenance.

## Boundaries & Constraints

**Always:** Anchor ranges to final `messages.content` using zero-based JavaScript UTF-16 indexes, exclusive end, exact slice equality, deterministic non-overlap, global duplicate-ID rejection, and a maximum of 20 annotations. Keep two validation passes: before candidates and under final outbox locks. Source-backed types (`source`, `place`, `hotel_area`, `route_segment`, `cost`) require unique available IDs from the supplied same-message scoped provenance; entity owner IDs must be included. Derive source details exclusively through `buildAnswerAnnotationDetail` from `AssistantMessageProvenanceItem`. Keep provider work outside locks, preserve claim/fence/effect/usage idempotency, and retain the authenticated message-local history scope. The renderer may only reject invalid supplied annotations defensively.

**Block If:** Existing persisted action compatibility cannot be distinguished from a new or executable action shape without changing historical behavior beyond the authoritative story.

**Never:** Do not update the supplied story or sprint status. Do not add schema/migrations, an annotation store, source resolver, unscoped provenance query, browser prose parsing/rematching, public/API/BFF endpoint, routing, target/capability/action execution, raw source snapshot/provider payload exposure, or Story 11.4 behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid source-backed descriptor | Exact final-text range plus available scoped provenance IDs | Canonical annotation sorted by range; safe detail rebuilt from formatted provenance | No provider/stored display field is trusted |
| Invalid range or duplicate | Empty/non-integer/mismatched/overlapping range, duplicate ID, or more than 20 candidates | Descriptor is omitted; answer text is unchanged | No recovery through prose matching |
| Local guidance | Provenance-free `warning` or `trip_fact` | Canonical non-navigable local descriptor with no owner, detail, URL, quick facts, action, or provenance IDs | Source-like stored fields invalidate it |
| Changed final state | Content/provenance becomes stale or withdrawn after provider returns | Final locked write fences source-backed descriptor out; valid independent local guidance may remain | No effect/usage duplication on redelivery |
| Hostile stored history | Malformed/duplicate/foreign-looking persisted JSON | Ordinary answer content remains; invalid annotations and details are absent | No cross-user resource disclosure |

</intent-contract>

## Code Map

- `src/features/ai/answer-annotations.ts` -- sole proposal/persisted descriptor validator and formatter-derived safe-detail builder.
- `src/features/ai/domain-outbox-worker.ts` -- sole durable post-answer annotation writer with final locks and effect guard.
- `src/features/chat-trips/conversations.ts` -- authenticated owner-scoped history read that supplies message-local provenance.
- `src/features/ai/ai-ask-composer.tsx` -- persisted-annotation renderer and defense-in-depth range normalizer.
- `packages/database/src/provenance.ts` -- formatted available/withdrawn provenance safety boundary.
- `tests/answer-annotations.test.ts` -- validator and sanitizer contract coverage.
- `tests/chat-trip-context-extraction.test.ts` -- outbox fence, withdrawal race, and redelivery coverage.
- `tests/ai-ask-shell.test.ts` -- owner-safe history and renderer regressions.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/answer-annotations.ts` -- globally reject proposal duplicate IDs, enforce the 20-item creation bound, and preserve exact UTF-16 range/overlap checks -- makes the validator the sole bounded creation contract.
- [x] `src/features/ai/answer-annotations.ts` -- allow new provenance-free descriptors only for canonical local `warning`/`trip_fact`; reject source-like local fields and new source-free actions while retaining only exact non-executable persisted legacy-action compatibility -- enforces local-guidance and Story 11.4 boundaries.
- [x] `src/features/ai/answer-annotations.ts` -- retain formatter-only reconstruction and scoped available-provenance membership for every source-backed type -- prevents raw, inferred, cross-scope, duplicate, and withdrawn detail exposure.
- [x] `src/features/ai/ai-ask-composer.tsx` -- suppress every duplicate supplied display ID before existing range/text/overlap filtering -- keeps client defense deterministic without creating annotations.
- [x] `tests/answer-annotations.test.ts` -- cover UTF-16/exclusive-end boundaries, malformed/oversized proposals, duplicate IDs/provenance, each source-backed type, rebuilt-detail safety, source-free policy, withdrawal, and legacy action compatibility -- proves creation and persisted-read boundaries.
- [x] `tests/chat-trip-context-extraction.test.ts` -- cover malformed provider output, stale final content, post-provider withdrawal, failed preclaim/no provider call, and redelivery -- proves durable outbox fencing and idempotency.
- [x] `tests/ai-ask-shell.test.ts` -- cover malformed/overlapping/duplicate/foreign-looking stored descriptors, no prose synthesis, and withdrawn non-interactivity -- proves owner-safe historical display.

**Acceptance Criteria:**
- Given final persisted assistant text and descriptor proposals/stored JSON, when validation runs, then accepted annotations have unique IDs, non-overlapping integer zero-based UTF-16 exact-slice ranges with exclusive ends and no more than 20 entries; invalid, stale, malformed, duplicate, or mismatched annotations are omitted before persistence and rendering.
- Given a source-backed descriptor, when persisted or read, then every unique dependency is in the existing same-user/conversation/assistant-message scoped available provenance set, entity owner dependencies are included, and traveler-visible fields are rebuilt only from formatted provenance.
- Given a provenance-free descriptor, when accepted, then it is only `warning` or `trip_fact` local guidance with no source-derived/navigable/action data; historic exact legacy actions remain non-executable only; client rendering consumes server-persisted descriptors and never parses or rematches answer prose.
- Given enrichment races with final content, claim/fence state, provenance withdrawal, or redelivery, when the outbox consumer reaches final locked persistence, then stale source-backed candidates are fenced out, completed answers are unchanged, and effect/usage persistence remains atomic and idempotent.

## Spec Change Log

## Review Triage Log

### 2026-07-30 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 2, medium 2, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Rejected oversized stored annotation arrays rather than truncating them, so hostile persisted JSON cannot retain a partial selectable subset.
  - `[high]` `[patch]` Narrowed direct proposal/display inputs before sorting and moved display normalization to full-content scope, preventing malformed entries from crashing rendering or allowing duplicate IDs across sections.
  - `[medium]` `[patch]` Calculated provider duplicate IDs before proposal-shape filtering and rejected all new provider `action` descriptors, preserving strict duplicate semantics and Story 11.4 action ownership.
  - `[medium]` `[patch]` Added focused malformed, duplicate, oversized, and source-backed-action regressions.

## Auto Run Result

**Summary:** Hardened the existing persisted annotation contract without adding a parallel store, resolver, browser parser, action capability, schema, or transport. Proposal, persisted-read, and client display validation now fail closed for hostile duplicate, oversized, malformed, or source-free action input; valid source-backed details remain formatter- and scope-derived.

**Files changed:**
- `src/features/ai/answer-annotations.ts` -- validates all duplicate IDs before shape filtering, rejects oversized persisted/provider inputs and new actions, and preserves canonical local guidance/legacy action handling.
- `src/features/ai/ai-ask-composer.tsx` -- normalizes persisted display annotations once against complete content and safely ignores malformed/duplicate input.
- `tests/answer-annotations.test.ts` -- extends UTF-16, range, duplicate, malformed, oversized, local-guidance, action, and provenance validation coverage.
- `tests/chat-trip-context-extraction.test.ts` -- updates outbox fixture to use allowed local warning guidance.
- `tests/ai-ask-shell.test.ts` -- adds duplicate/malformed display defense coverage.

**Review:** Synchronous Blind Hunter and Edge Case Hunter passes produced four repaired contract-boundary findings. The final review repair was rechecked by both layers; no residual intent gap, bad-spec issue, defer item, or unaddressed finding remains. A follow-up review is recommended because the repair pass hardened several security/data-integrity input boundaries.

**Verification:**
- `pnpm vitest run tests/answer-annotations.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-shell.test.ts --no-file-parallelism` -- passed, 183 tests.
- `pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts --no-file-parallelism` -- passed, 57 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed with 0 errors and five pre-existing warnings outside changed files.
- `pnpm build` -- passed.
- `git diff --check` -- passed.

**Residual risks:** The sanitizer deliberately relies on its caller-controlled message-local provenance projection for ownership. The outbox and authenticated history seams remain that authority; no unscoped lookup was introduced.

## Design Notes

The sanitizer's provenance parameter is deliberately a controlled scoped projection, not an ownership assertion supplied by an arbitrary caller. The outbox query and `getOwnedConversation` establish ownership; the validator only verifies exact membership and availability in that supplied message-local set. This avoids both unscoped lookups and cross-user existence disclosure.

## Verification

**Commands:**
- `pnpm vitest run tests/answer-annotations.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-shell.test.ts` -- expected: serial focused annotation/history/outbox suites pass.
- `pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts` -- expected: related durable AI persistence suites pass.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: production build passes.
- `git diff --check` -- expected: no whitespace errors.
