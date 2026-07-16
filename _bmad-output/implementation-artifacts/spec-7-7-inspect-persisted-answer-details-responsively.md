---
title: 'Inspect Persisted Answer Details Responsively'
type: 'feature'
created: '2026-07-16'
status: 'done'
baseline_revision: '3edec76'
final_revision: '858c50a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Persisted answer annotations currently support only limited source-style details and trust stored JSON too broadly. Travelers need to inspect supported place, hotel area, route, and cost details safely without losing the active conversation, while stored annotation references must not cross message, conversation, or user boundaries.

**Approach:** Extend the existing post-persistence annotation contract and shared responsive inspector with bounded, provenance-validated descriptors. Keep the inspector transient and reuse its current single selection state, focus handling, and responsive desktop/mobile presentations.

## Boundaries & Constraints

**Always:** Validate descriptor ranges against final persisted assistant content with zero-based UTF-16 offsets and exclusive end. Validate every provenance ID against the same assistant message, conversation, and user when persisting, loading, or backfilling. Limit quick facts to six trimmed `{ label, value }` pairs of at most 160 characters, projected only from traveler-safe provenance fields. Preserve original answer text when descriptors are unavailable or invalid. Use the local typed icon boundary, semantic controls, visible focus, shared selected-detail state, and focus restoration.

**Block If:** A required action cannot be represented by an existing registered owning-feature, descriptor-bound server capability. Do not invent an executable action contract; omit the action instead.

**Never:** Do not parse answer prose to infer entities or source claims; expose raw source material, source snapshots, operator fields, provider payloads/scores, arbitrary JSON, or internal target IDs; add a table, route, alternate loader, Google Maps dependency, map UI, or independent mobile/tablet inspector state. Do not render label-only actions or client-derived routing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Valid entity annotation | Final persisted answer has a range-anchored `place`, `hotel_area`, `route_segment`, or `cost` descriptor with same-owner provenance | Keyboard/tap selection opens the shared inspector with a type icon, Vietnamese title/summary, bounded quick facts, and safe provenance chips. | No action is shown unless an owner mints a current bound capability. |
| Invalid stored descriptor | JSON has unmatched range, overlap, duplicate/unknown/cross-owner provenance, unsafe fields, or unbounded facts | Original answer remains readable and the invalid descriptor is not rendered or resolved. | Return a compact unavailable inspector state only for a selected but unresolved valid UI descriptor. |
| Breakpoint change or close | A descriptor is selected then layout changes, or traveler presses Escape/close | The same selected detail moves to the active presentation; exactly one view is interactive. Close returns focus to the opener, with composer fallback only if detached. | Clear modal scroll/focus state without duplicating accessible inspector content. |

</intent-contract>

## Code Map

- `src/features/ai/answer-annotations.ts` -- Owns annotation types, proposal parsing, descriptor construction, and structural/persistence validation.
- `src/features/retrieval/provenance.ts` -- Owns traveler-safe provenance DTOs and any server-only safe entity-fact projection.
- `src/features/chat-trips/conversations.ts` -- Loads user-owned messages/provenance, sanitizes persisted annotations, and performs annotation backfill.
- `src/app/api/ai-ask/stream/route.ts` -- Persists final assistant content/provenance and emits post-persistence annotation enrichment.
- `src/features/ai/ai-ask-composer.tsx` -- Renders validated annotation controls and the shared responsive inspector.
- `src/components/ui/icons.tsx` -- Provides the one typed local semantic icon boundary.
- `tests/answer-annotations.test.ts` -- Tests validation, range, safe-detail, and provenance rules.
- `tests/ai-ask-shell.test.ts` -- Tests persisted shell rendering, ownership-safe loading, and inspector accessibility contracts.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/answer-annotations.ts` -- Extended the descriptor schema and validation to all eight supported types; rejects malformed, overlapping, duplicate-ID, duplicate/unknown provenance, unanchored entity, unsafe-field, and invalid quick-fact descriptors -- makes JSONB annotations safe, typed persisted UI contracts.
- [x] `src/features/retrieval/provenance.ts` -- Reused the existing traveler-safe provenance DTO and URL filtering for descriptor projections -- prevents raw snapshot leakage without expanding client data.
- [x] `src/features/chat-trips/conversations.ts` and `src/app/api/ai-ask/stream/route.ts` -- Revalidate stored/backfilled and newly enriched annotations against message-scoped provenance after final content exists -- prevents cross-owner and stale persisted descriptors from resolving.
- [x] `src/features/ai/ai-ask-composer.tsx` and `src/components/ui/icons.tsx` -- Renders all validated descriptor types through the existing single responsive inspector state, with semantic icons, safe cards/facts/provenance, unavailable recovery, and no executable action without a server-owned capability -- completes responsive detail inspection without a parallel entity model.
- [x] `tests/answer-annotations.test.ts` and `tests/ai-ask-shell.test.ts` -- Covers UTF-16 range correctness, every descriptor type, provenance ownership/reference rejection, quick-fact limits, safe rendering/no inference, conditional inspector, and keyboard/mobile accessibility contracts -- prevents safety and responsive regressions.

**Acceptance Criteria:**
- Given any supported persisted descriptor is valid, when a traveler clicks, taps, or focuses it, then the contextual inspector displays a semantic icon, Vietnamese title/summary, safe quick facts, related safe provenance, and only owner-authorized executable actions.
- Given an entity descriptor is proposed or loaded, when it has invalid final-message range text, missing/duplicate/unknown/cross-owner provenance, unsafe metadata, or unsupported action data, then it is rejected without changing the answer prose or exposing private detail.
- Given no descriptor is selected, when the active workspace renders, then no blank desktop inspector is forced; given a selection across desktop, tablet, or mobile, then the same transient state drives exactly one accessible detail presentation and closing restores focus to the opener.

## Design Notes

Stored `answer_annotations` is untrusted at load time. Validation must be reusable for new enrichment, backfill, and rendering input. An action remains absent until a feature-owned server capability can be verified; this story must not create a client-routed substitute.

## Review Triage Log

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (high 1, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Rebuilt every rendered descriptor from scoped provenance rather than trusting persisted display metadata.
  - `[low] [patch]` Bounded untrusted stored annotation processing to accepted descriptors.

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (medium 2, low 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Preserved compatible legacy source/warning descriptors while rebuilding safe display fields.
  - `[medium] [patch]` Bounded provenance-derived quick facts and validated optional stored display shapes before rebuilding.
  - `[low] [patch]` Continued scanning after malformed entries until the accepted descriptor limit.
  - `[low] [patch]` Isolated malformed descriptor tests so overlap handling cannot mask validation coverage.

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (medium 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Rejects a duplicated ID across the entire persisted payload, including when the first occurrence is invalid.

### 2026-07-16 - Final review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Verification

**Commands:**
- `pnpm test:run tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts` -- expected: annotation and traveler-shell contracts pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds.
- `pnpm test:run` -- expected: full suite passes or existing unrelated failures are recorded exactly.
- `git diff --check` -- expected: no whitespace errors.

## Auto Run Result

**Summary:** Added safe, responsive inspection for all persisted answer descriptor types while retaining one transient inspector state and preventing stored JSON from fabricating traveler-facing provenance detail.

**Files changed:**
- `src/features/ai/answer-annotations.ts` -- Typed eight descriptor types, validates ranges/references, bounds facts, and rebuilds display projections from scoped provenance.
- `src/features/chat-trips/conversations.ts` -- Applies the shared sanitizer when loading and backfilling owned conversation history.
- `src/app/api/ai-ask/stream/route.ts` -- Sanitizes post-persistence answer enrichment before storage and terminal emission.
- `src/features/ai/ai-ask-composer.tsx` -- Renders typed selected details through the existing responsive inspector.
- `src/components/ui/icons.tsx` -- Adds typed semantic detail icons.
- `tests/answer-annotations.test.ts` and `tests/ai-ask-shell.test.ts` -- Cover descriptor safety and persisted-history rendering.
- `sprint-status.yaml` -- Records Story 7.7 completion.

**Review findings:** Three review-driven patch rounds addressed provenance-derived display reconstruction, safe fact bounds, legacy compatibility, untrusted-array handling, and duplicate-ID rejection. Final independent review found no actionable defects. Follow-up review is not recommended.

**Verification:** `pnpm test:run tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts` passed (81 tests). `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm test:run` remains unreliable in the shared DB suite (441 passed, 34 failed): failures include pre-existing auth mock leakage, duplicate/foreign-key test setup, Facebook capture timestamps, and unrelated feedback/evaluation assertions.

**Residual risks:** Browser-level interaction at 200% zoom and breakpoint transitions remains a manual check; no automated browser interaction suite exists.
