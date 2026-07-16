---
title: 'Refine the AI Ask Composer and Streaming Feedback'
type: 'feature'
created: '2026-07-16'
status: 'in-review'
baseline_revision: '6cd7be3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The authenticated AI Ask composer works but presents processing before server-side context preparation starts, always exposes image attachment, uses oversized idle controls, and leaves request failures visible only to assistive technology or as a generic failed turn.

**Approach:** Refine the existing composer and NDJSON lifecycle so a server-owned image capability controls attachment input, visible transient feedback begins when context preparation does, completion reconciles only persisted content, and validation/failure states provide compact, actionable recovery without changing data ownership or persistence semantics.

## Boundaries & Constraints

**Always:** Keep the current authenticated, owner-scoped route and canonical URL reconciliation. Lock competing actions immediately on valid submission, but show the prominent pending surface only after the server emits a context-preparation event following user-turn persistence. Keep deltas transient, clear them on every non-success terminal path, and append assistant content only from `done`. Retain the text draft and valid selected image for pre-persistence/request failures. Use Vietnamese-first copy, polite bounded live announcements, visible focus, and 44px attachment/remove/send targets.

**Block If:** The existing server model catalog cannot derive a read-only image-input capability for the authenticated shell without moving model selection or authorization to the client.

**Never:** Do not add new persistence, loaders, aggregate ownership, maps, client-side ownership/model authorization, cancellation behavior, answer hierarchy/detail UI, free-text entity parsing, or a second API endpoint. Do not change user-turn-first persistence, server image validation, provider selection enforcement, provenance/usage persistence, or Story 7.4 selection semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Supported idle input | Authenticated shell has an active streaming/text/image model | Compact textarea, icon-only attachment, and icon-only send render; attachment row remains absent. | Server still rejects image submission if capability changes. |
| Unsupported image input | Shell lacks an active image-capable streaming model | Attachment input and trigger do not render; text composer remains available. | No client capability grants authorization. |
| Valid request lifecycle | Valid text or valid image reaches the stream route | Controls lock immediately; server emits `preparing` after user persistence and before source assembly; UI then presents subtle preparation feedback, transient deltas, and final persisted answer on `done`. | Long-running copy remains non-final and completion is politely announced. |
| Invalid attachment or pre-stream failure | Unsupported, empty, oversized image, or non-OK stream response | Draft is retained and compact nearby recovery explains how to retry; invalid file is cleared. | No provider call for invalid client attachment; server validation remains authoritative. |
| Terminal stream/persistence failure | `error` follows persisted user turn, optionally after deltas | Clear transient content, retain canonical conversation/project URL, show the persisted user turn with explicit no-saved-assistant recovery. | Never render partial text as saved assistant content. |

</intent-contract>

## Code Map

- `src/app/api/ai-ask/stream/route.ts` -- Existing NDJSON stream owner; emits the preparation lifecycle event after durable user-turn setup and before source-bundle work.
- `src/app/ai-ask/page.tsx` -- Authenticated server shell; derives the read-only image-input capability from the existing model catalog and passes it to the composer.
- `src/features/ai/ai-ask-composer.tsx` -- Client request lock, NDJSON parsing, compact composer, image preview/validation, transient status, completion, and recovery rendering.
- `tests/ai-ask-shell.test.ts` -- Route lifecycle and source-contract regression coverage for composer behavior.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/ai-ask/stream/route.ts` -- Add a typed `preparing` stream event after the user turn is persisted and immediately before context/source preparation -- makes pending timing truthful without altering persistence or gateway behavior.
- [x] `src/app/ai-ask/page.tsx` -- Resolve whether the currently active AI Ask model supports streaming image input and pass that server-owned read-only capability to the composer -- renders attachment only when supported while preserving route enforcement.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Separate immediate request locking from visible preparation/streaming feedback, consume the preparation event, compact idle controls, conditionally render attachment controls, make visual recovery contextual, and preserve only persisted `done` content -- meets lifecycle, accessibility, and no-partial-answer requirements.
- [x] `tests/ai-ask-shell.test.ts` -- Assert preparation event ordering, no preparation on early validation failure, and the server-owned composer capability/transient recovery contracts -- prevents lifecycle and ownership regressions.

**Acceptance Criteria:**
- Given the composer is idle in an empty or active workspace, when the active server-owned model supports image input, then it renders a compact prompt, icon-only attachment, and icon-only send with no persistent attachment/help chrome; when it does not, then the attachment control is absent.
- Given a valid submission begins, when the request is in flight before durable preparation, then competing actions are guarded without portraying an answer as pending; when the server begins source/context preparation, then subtle non-final preparation feedback appears and later deltas remain visibly transient.
- Given a valid image is selected or image validation fails, when contextual attachment UI is shown, then the valid image row has thumbnail, label, size, and accessible icon-only removal, while invalid input preserves the text draft, clears the invalid file, and presents specific nearby recovery guidance.
- Given a stream completes, when a `done` event returns persisted messages, then the transient stream is replaced by the returned assistant message, a polite completion announcement occurs, and the canonical conversation/project URL refreshes.
- Given a stream or final persistence fails, when the workspace remains available, then no partial text is represented as a saved assistant answer, the user receives retry/edit guidance, and any returned conversation/project scope remains canonical.

## Design Notes

The `preparing` event is intentionally emitted only after the transactional user turn succeeds and just before `assembleContextPrioritySourceBundle`. This keeps the client’s prominent processing state aligned with work that can take perceptible time, while the immediate local lock still prevents duplicate requests during validation and transport setup.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts` -- expected: stream lifecycle, image, persistence, and composer regressions pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds.
- `git diff --check` -- expected: no whitespace errors.

## Review Triage Log

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 2, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Cleared stale image-validation recovery copy when a valid replacement is selected or the attachment is removed.
  - `[medium]` `[patch]` Distinguished pre-persistence failures from persisted user-turn failures so recovery copy never claims an unsaved message exists.
  - `[low]` `[patch]` Activates the same transient progress surface on a received delta as a defensive fallback if the preparation event is unavailable.

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 1: (high 0, medium 1, low 0)
- addressed_findings:
  - none

## Auto Run Result

**Summary:** Refined the authenticated AI Ask composer so image attachment is server-capability-led, visible response feedback starts with durable context preparation, streamed text remains explicitly transient, and validation/terminal errors offer accurate recovery guidance.

**Files changed:**
- `src/app/api/ai-ask/stream/route.ts` -- Adds the ordered `preparing` NDJSON event after user-turn persistence and before source assembly.
- `src/app/ai-ask/page.tsx` -- Derives streaming image-input capability on the authenticated server shell.
- `src/features/ai/ai-ask-composer.tsx` -- Uses the capability to conditionally show attachment input; improves compact controls, transient lifecycle feedback, and contextual recovery handling.
- `tests/ai-ask-shell.test.ts` -- Covers the preparation event, early-validation behavior, capability wiring, recovery state contracts, and deterministic redirect-module setup.
- `spec-7-5-refine-the-ai-ask-composer-and-streaming-feedback.md` -- Records the Story 7.5 plan, review, and verification.

**Review findings:** Three localized issues were patched: stale validation recovery, inaccurate saved-turn recovery wording for pre-persistence errors, and a delta-triggered feedback fallback. One mixed-version/event-loss observation was rejected because this ordered monolith stream always emits preparation before source work and received deltas activate the same feedback surface.

**Verification:** `pnpm test:run tests/ai-ask-shell.test.ts` passed (73 tests). `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.

**Residual risks:** Real-browser mobile safe-area, keyboard tooltip, screen-reader live-region, and 200% zoom behavior remain manual checks.
