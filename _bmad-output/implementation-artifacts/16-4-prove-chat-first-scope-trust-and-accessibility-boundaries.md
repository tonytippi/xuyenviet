---
baseline_commit: cbf9efc
---

# Story 16.4: Prove Chat-First Scope, Trust, and Accessibility Boundaries

Status: review

## Story

As a product owner,
I want executable evidence for the chat-first companion boundaries,
so that convenience improvements cannot silently weaken traveler control, owner isolation, trust safety, or accessibility.

## Acceptance Criteria

1. **Typed owner-bound recommendation safety**
   - **Given** unit and integration tests exercise typed trip recommendations
   - **When** they cover no-match, ambiguous match, single/multiple owned matches, accept retry, decline, explicit save, stale decision, changed context revision, deleted conversation, and cross-owner inputs
   - **Then** only valid owner-bound decisions create or select a Trip Project
   - **And** no client-derived material-change decision, rendered prose, or stale decision can create, attach, or expose a project.

2. **Private turn and selected-project isolation**
   - **Given** tests exercise private-answer and selected-project paths for the same traveler
   - **When** source bundles, persisted provenance, context updates, and URL selection are inspected
   - **Then** a private-answer turn contains no selected Trip Project constraints and leaves its URL scope unchanged
   - **And** a selected-project turn uses only the chosen owned project's existing primary conversation without copying, merging, linking, or replaying ordinary conversations.

3. **Safe traveler trust and recovery projections**
   - **Given** UI and contract tests exercise traveler answer/trust/recovery projections
   - **When** persisted source details, missing details, verification needs, streaming/retry outcomes, and safe failures render
   - **Then** each projection uses approved Vietnamese copy and allowed recovery actions
   - **And** no traveler-visible text exposes technical state names, taxonomy, confidence codes, provider/model information, request IDs, error codes, diagnostics, raw source material, or inferred provenance.

4. **Responsive accessibility boundaries**
   - **Given** responsive accessibility tests exercise recommendation, sidebar/project selection, disclosure, feedback, sheet, and composer flows
   - **When** keyboard, focus restoration, `aria-live`, touch target, and reduced-motion behaviors are evaluated on desktop and mobile layouts
   - **Then** the same server-loaded URL-owned shell model remains authoritative across breakpoints
   - **And** no interactive state traps focus, hides a selected project, or creates a second loader or client persistence owner.

5. **Verification evidence**
   - **Given** this epic's implementation is complete
   - **When** focused verification runs
   - **Then** the applicable unit and serial integration tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass
   - **And** any environmental blocker is recorded exactly in this implementation artifact.

## Tasks / Subtasks

- [x] Complete recommendation contract and ownership regression matrix (AC: 1)
  - [x] Add `tests/trip-recommendations.test.ts` to the `unitTests` allowlist in `vitest.config.ts`; it is infrastructure-free parser/fingerprint coverage and must run under the unit project rather than being silently selected by the integration project.
  - [x] Extend `tests/trip-recommendations.test.ts` for every valid recommendation shape and invalid exact-shape input: injected fields, invalid action sets/order, malformed decision IDs, wrong decision kind, malformed `continueInTrip(...)` input, and prohibited `tripProjectId`/title leakage from `none`, `clarify`, and `multiple` results.
  - [x] Extend `tests/trip-recommendations.integration.test.ts` for no owned match, one owned match, multiple owned matches, foreign-project-only inputs, decline/explicit-save fencing, retry/concurrent acceptance, stale revision/fingerprint, deleted conversation/project, and foreign decisions.
  - [x] Add explicit negative tests for foreign or mismatched `continueInTrip(...)` selection and wrong decision kind. All failures must be non-disclosing and create/attach nothing.
  - [x] Extend `tests/trip-recommendations-api.integration.test.ts` to cover authenticated principal, CSRF, strict body parsing, and safe result handling for decline, private, continue, and accepted creation. Include invalid/extra body fields and prove invalid requests do not invoke the command port. Keep accepted-creation `Idempotency-Key` unique to its endpoint.

- [x] Prove private-answer and canonical selected-project data boundaries (AC: 2)
  - [x] Add `tests/private-turn-answer-context.integration.test.ts`, a serial database-level regression through the production next-turn command/orchestration path, `assembleContextPrioritySourceBundle(...)`, and persisted answer/provenance seams. Do not pass only `tripProjectId: undefined` directly to `loadAnswerContext(...)`.
  - [x] Seed distinguishable sentinel values for ordinary-conversation facts that must remain available and for project anchors, plan items, constraints, project-scoped facts, and provenance that must remain absent. Execute a valid `private_answer` decision, submit the next ordinary turn through the same production path, then assert command/source-bundle input has no `tripProjectId`; `hasProjectScope` is false; `tripProjectId` is null; anchors and plan items are empty; constraints are null; no project facts, identifiers, context IDs, or project-derived provenance persist; and the ordinary conversation remains unlinked before and after the turn.
  - [x] Cover private decisions emitted from both an offer/creation recommendation and an existing-project context recommendation when those typed decision kinds are available. Ordinary conversation facts may remain; do not use an over-broad assertion that rejects ordinary-chat context.
  - [x] Assert private/decline actions preserve the current unscoped URL; they must not load or persist a selected project or create a durable private-mode state.
  - [x] Assert continue and accepted creation navigate only using the server-returned canonical `{ tripProjectId, conversationId }`, and the chosen project's existing same-owner primary conversation is used without copying, merging, linking, or replaying the ordinary conversation.
  - [x] Reuse `packages/database/src/answer-context.ts`, `packages/database/src/trip-recommendations.ts`, and the direct Nest command routes. Do not duplicate context assembly in a test helper or browser code.

- [x] Strengthen URL-shell and trust/recovery regression coverage (AC: 2-3)
  - [x] Extract the pure canonical `/ai-ask` URL builder and single-value query parser from component-local code into a small importable web utility. Add unit coverage for the unscoped route, ordinary conversation, server-returned project destination, historic conversation review, and multi-valued query rejection. Do not manufacture primary-conversation authority in the client.
  - [x] Extend `tests/direct-shell-proposal-actions.test.ts` and/or existing compatible tests to prove a scope-key change blocks the old shell, stale/foreign/unlinked resources reconcile to `/ai-ask`, and no second shell loader, browser persistence owner, or breakpoint-specific selection state is introduced.
  - [x] Extend `tests/traveler-ui-foundation.test.ts` with a positive Vietnamese-copy and forbidden-vocabulary matrix covering the composer and direct shell loader. Cover practical loading, verification, unavailable, retry, stale-scope, stream failure, and completed-follow-up-delay paths.
  - [x] Assert safe disclosures derive only from persisted provenance/annotations, accept `detail: null` and withdrawn/missing detail without fallback exposure, do not expose raw URLs as quick facts, and never infer source/trust state by parsing answer text. Run and name the directly affected suites: `tests/answer-annotations.test.ts` and `tests/knowledge-source-removal.test.ts`.
  - [x] The forbidden traveler output includes internal state/job/consumer names, source/provenance/retrieval taxonomy, confidence codes, provider/model names, request or correlation IDs, error codes, diagnostics, raw source material, evidence, conditions, and provenance IDs.

- [x] Verify feedback persistence and accessible interaction contracts (AC: 3-4)
  - [x] Add the required focused serial PostgreSQL suite `tests/answer-usefulness-feedback.integration.test.ts`, with local `resetTestDatabase()` setup and only a small local fixture for two users, an owner conversation, one assistant message, and one non-assistant message. Prove insert, same-user/message update without duplication, owner isolation, assistant-message-only targeting, missing/foreign safe results, trimmed comments, maximum-length validation, and concurrent same-owner saves yielding exactly one complete row rather than a duplicate or mixed result.
  - [x] Add the negative-to-positive rating-transition regression: after a `not_useful` rating with a comment, changing the same message to `useful` must persist `comment: null`, hide the negative-only editor, and neither retain nor resend the prior comment. Make the smallest production fix if the regression demonstrates the current hidden-comment retention defect.
  - [x] Preserve `saveDirectAnswerUsefulnessFeedback()` relative cookie-authenticated CSRF/parsing behavior and extend Nest admission coverage. Prove unauthenticated/CSRF-failing requests do not invoke the port; forged `userId`/`conversationId`, extra fields, malformed ratings, and invalid comment types are rejected; foreign/missing messages return the safe result; and the controller passes only the authenticated principal identity to the command port.
  - [x] Extend the existing source-level/component-compatible UI tests for compact positive/negative controls, negative-only comment editor, pending disablement, polite announcement, message-scoped update, visible focus, 44px mobile targets, and no composer displacement. Do not introduce a new UI framework or dependency solely for this story.
  - [x] Keep source-level/component-compatible assertions only for static structural contracts. They do not prove interactive behavior.
  - [x] Execute and record a manual accessibility evidence matrix because no configured browser interaction harness currently runs these flows. Use a desktop viewport and a 375-430px mobile viewport; record browser and viewport; keyboard sequence and resulting focus for navigation sheet, selected-answer detail, private/continue recommendation actions, feedback save/failure, stale-scope recovery, and `Hỏi XuyenViet`; prove only the topmost layer closes on `Escape`; inspect active-row `aria-current`, polite live updates, 44px targets, and `prefers-reduced-motion: reduce`; attach screenshots or record an explicit blocker. Do not claim AC4 interactive proof from static source tests.
  - [x] Fix only defects demonstrated by these checks.

- [x] Run and record focused verification (AC: 5)
  - [x] Run `pnpm test:unit -- tests/trip-recommendations.test.ts tests/ai-ask-direct-api.test.ts tests/direct-shell-proposal-actions.test.ts tests/traveler-ui-foundation.test.ts tests/answer-annotations.test.ts`.
  - [x] Run `pnpm test:integration -- tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts tests/private-turn-answer-context.integration.test.ts tests/answer-usefulness-feedback.integration.test.ts tests/knowledge-source-removal.test.ts`. Integration suites remain serial and each suite requiring clean data calls `resetTestDatabase()` locally.
  - [x] Run the recorded manual accessibility evidence matrix, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
   - [x] Record exact commands, counts, pre-existing warnings, and any unavailable infrastructure in Completion Notes. Do not claim a UI interaction proof that the existing runner cannot execute.

### Review Findings

- [x] [Review][Patch] Existing-project private-answer path lacks production-path isolation coverage [tests/private-turn-answer-context.integration.test.ts:20] — added a `tripContextRecommendation` single-project decision to the production next-turn test and asserted it leaves the turn unscoped.
- [x] [Review][Patch] Private-turn suite does not inspect the source-bundle boundary [tests/private-turn-answer-context.integration.test.ts:39] — instrumented the existing AI Ask source-bundle dependency seam and asserted no project scope, ID, facts, anchors, plan items, or constraints are present.
- [x] [Review][Patch] Global fetch stub leaks from serial integration test [tests/private-turn-answer-context.integration.test.ts:12] — `afterEach` now restores AI Ask dependencies and globals with `vi.unstubAllGlobals()`.
- [x] [Review][Patch] Feedback API admission matrix omits required parser, principal, and safe-result cases [tests/trip-recommendations-api.integration.test.ts:111] — added forged-field, invalid comment, foreign/missing safe-result, and authenticated-principal forwarding coverage; repaired the controller's runtime DTO metadata so valid feedback reaches the command port.
- [x] [Review][Patch] Accessibility evidence matrix is incomplete and not durably attached [16-4-prove-chat-first-scope-trust-and-accessibility-boundaries.md:175] — AC 4 and task 4 require keyboard sequence and observed focus for selected-answer detail, private/continue actions, feedback save/failure, stale-scope recovery, and `Hỏi XuyenViet`; the recorded note covers only a subset and points to transient `/tmp` screenshots. Record each required flow with browser, viewport, interaction/focus/Escape/live-region result, and durable screenshot attachment or an explicit blocker.

## Dev Notes

### Scope and Product Intent

Story 16.4 is the Epic 16 verification slice, not another recommendation, shell, provenance, or feedback implementation. Its purpose is to turn the completed Stories 16.1-16.3 boundary claims into executable evidence and make only narrowly justified production fixes that a failing verification exposes.

The key missing evidence is end-to-end private-turn context isolation and feedback persistence coverage. Existing recommendation persistence coverage is strong; extend it instead of replacing it. The current web test runner supports source-level/component-compatible checks, so preserve that approach unless an already-installed, configured interaction harness is confirmed usable. Do not add a test framework just to broaden this story.

### Architecture Compliance

- **Chat/Trips remains recommendation authority.** Contracts belong in `packages/contracts`, ports/policy in `packages/domain`, transactions and context assembly in `packages/database`, Nest owns authenticated direct HTTP, and `apps/web` consumes typed results only. Never make a browser, local storage, assistant prose, or test fixture calculate material context change or primary-conversation authority. [Source: `ARCHITECTURE-SPINE.md#AD-30A`, `#AD-33`]
- **Private answer is a data boundary.** Test the actual subsequent source-bundle/answer-context path, not merely `conversations.tripProjectId`. A private choice must load and persist no project constraints, anchors, or project-derived context/provenance, must not alter the URL, and must not create a persistent mode. [Source: `ARCHITECTURE-SPINE.md#AD-30A`; `packages/database/src/answer-context.ts`]
- **One URL-owned shell across breakpoints.** `apps/web/src/app/ai-ask/page.tsx` is the sole route parser, `DirectShellLoader` is the one server-data loader, and `AiAskComposer` owns transient interaction state. Desktop, rail, and mobile sheet are presentations of that one model; never add a client selection store, local persistence, or a second loader. [Source: `ARCHITECTURE-SPINE.md#AD-24`]
- **Trust disclosures use persisted safe projections only.** The UI must never parse answer prose to discover a source, warning, action, or trust state. Detail resolution stays bound to persisted message/conversation/user provenance and its safe projection; raw source material remains unavailable. [Source: `ARCHITECTURE-SPINE.md#AD-11`, `#AD-20`]
- **Traveler state remains bounded Vietnamese.** Machine discriminators may select presentation internally but never render. Do not interpolate `DirectApiError` values, raw server messages, provider/model details, IDs, taxonomy, diagnostics, source/evidence fields, or status/job/consumer names. [Source: `ARCHITECTURE-SPINE.md#AD-30B`]
- **Feedback remains a real direct command.** Preserve the existing CSRF-protected client, principal-owned Nest route, and PostgreSQL message-owner/assistant-role validation. A footer control that does not persist or safely update is not acceptable. [Source: `apps/web/src/features/ai/direct-api-client.ts#saveDirectAnswerUsefulnessFeedback`; `packages/database/src/index.ts#createPostgresTravelerCommandPort`]
- **No protocol or ownership rewrite.** Do not change AI Ask NDJSON framing, command idempotency behavior, recommendation schema, provenance schema, source removal behavior, or direct API ownership unless an acceptance test proves a concrete defect in this story. [Source: `ARCHITECTURE-SPINE.md#AD-16`, `#AD-33`]

### Existing Code and Test Seams

| Path | Current responsibility | Story 16.4 expectation |
|---|---|---|
| `packages/contracts/src/index.ts` | Strict recommendation, answer-detail, feedback, and shell parsers. | Extend exact-shape rejection and no-leak contract tests; do not widen browser authority. |
| `packages/database/src/trip-recommendations.ts` | Owner-bound decision, fence, private/continue/accept commands. | Extend existing integration matrix; preserve locks, revision/fingerprint fences, and safe non-disclosure. |
| `packages/database/src/answer-context.ts` | Canonical ordinary/project answer context assembly. | Prove private subsequent turns exclude project context through this real seam. |
| `packages/database/src/index.ts` | Traveler feedback persistence and owner validation. | Add focused serial feedback persistence coverage only. |
| `apps/web/src/app/ai-ask/page.tsx` | Canonical URL query parsing. | Preserve single-valued selection parsing. |
| `apps/web/src/features/chat-trips/direct-shell-loader.tsx` | One direct URL-shell loader, stale reconciliation, safe detail hydration. | Test stale/safe reconciliation and message-detail identity checks; do not add another loader. |
| `apps/web/src/features/ai/ai-ask-composer.tsx` | Transient workspace, scope navigation, trust/recovery UI, feedback, focus/sheets. | Verify existing accessible interaction boundaries; make only demonstrated targeted fixes. |
| `apps/web/src/features/ai/direct-api-client.ts` | Relative credentialed API client, strict parsing, CSRF mutation calls. | Preserve direct paths and test URL/command behavior; no BFF or browser DB access. |
| `tests/trip-recommendations*.ts` | Recommendation contract, persistence, and Nest admission tests. | Extend rather than create a parallel recommendation harness. |
| `tests/traveler-ui-foundation.test.ts` and `tests/direct-shell-proposal-actions.test.ts` | Existing source-level traveler-shell boundary tests. | Strengthen positive/negative copy and accessibility-contract assertions using this existing runner style. |

### Previous Story Intelligence

- Story 16.1 established owner-bound decisions, decline fencing, canonical primary destinations, and accepted-creation replay. Its review repairs require the latest extraction to be complete, serialize recommendation actions with extraction, reject newly scoped/missing ordinary conversations, strictly validate accepted-creation client admission, and scrub replays with exact JSON fields. Do not bypass any of these constraints in new tests or fixes.
- Story 16.2 established one server-loaded URL shell, typed decision consumption, canonical navigation, unscoped `Hỏi XuyenViet`, and focus reconciliation. Its review repairs block stale-shell submission, reconcile terminal recommendation failure, synchronously deduplicate project create/delete, fall back to the composer when the mobile heading is hidden, and reject duplicate sidebar project IDs.
- Story 16.3 simplified traveler presentation while preserving persisted-provenance-only detail, direct feedback persistence, safe retry, and reduced motion. Its review repairs prohibit stream-error interpolation, raw URLs in quick facts, unavailable-shell recovery without an action, and unsafe disclosure labels.

### UX and Accessibility Guardrails

- Selected projects must visibly show `Đang lên kế hoạch cho: {title}` in the main shell; ordinary chat has no technical scope/context label. `Hỏi XuyenViet` starts unscoped chat, and sidebar/sheet rows are the only persistent switching surface. [Source: `EXPERIENCE.md#Trip context indicator`]
- Default answers remain calm, scannable companion guidance. Trust disclosure is compact and action-oriented, and feedback remains a quiet footer interaction that does not displace the composer. [Source: `EXPERIENCE.md#Assistant answer`, `#Source summary row`, `#Usefulness rating`]
- Interactive controls require keyboard reachability, visible focus, action-oriented names, appropriate polite announcements, 44px mobile targets, `Escape` for the topmost sheet/panel, and predictable trigger/composer focus restoration. [Source: `EXPERIENCE.md#Interaction Primitives`, `#Accessibility Floor`]
- Test desktop and mobile as alternate presentations of the same server-loaded state. A desktop panel and mobile sheet for selected detail must never become independently interactive duplicated state. [Source: `ARCHITECTURE-SPINE.md#AD-24`]

### Testing Requirements

- Use `pnpm test:unit` for parser, URL helper, direct-client, and existing source-level/component-compatible web tests. Unit tests must not require `DATABASE_URL`, `DATABASE_URL_TEST`, migrations, or PostgreSQL.
- Use `pnpm test:integration` for recommendation, answer-context/source-bundle, feedback persistence, and Nest admission tests. Integration is serial. Every suite needing clean tables must call `resetTestDatabase()` in its own setup; do not restore a global reset hook.
- Run focused suites first. Then run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact failures/blockers rather than presenting unrun checks as passed.
- Do not add dependencies, new services, migrations, a global state manager, a browser persistence store, a second loader, Auth.js/BFF paths, Next domain writers, or a broad UI-test framework as part of this verification story.

### Recent Git Intelligence

- `f1a7ca2` and `e0173d0` introduced and hardened typed owner-bound recommendation decisions.
- `f2e9138` and `9161d4e` introduced and hardened the URL-owned planning shell, including stale-shell, focus, and duplicate-action repairs.
- `0b1df1f` and `cbf9efc` simplified traveler answer/trust presentation and hardened safe recovery. Treat the repaired boundaries as baseline invariants, not optional behavior.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 16.4`]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-05-epic-16.md#Epic 16 Coverage Matrix`, `#Story Quality And Ordering`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-11`, `#AD-16`, `#AD-20`, `#AD-24`, `#AD-30A`, `#AD-30B`, `#AD-33`]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#State Patterns`, `#Interaction Primitives`, `#Accessibility Floor`, `#Trust, Privacy, And Provenance`]
- [Source: `_bmad-output/implementation-artifacts/16-1-recommend-and-save-trip-projects-through-typed-owner-decisions.md#Review Findings`]
- [Source: `_bmad-output/implementation-artifacts/16-2-preserve-explicit-trip-scope-in-the-planning-shell.md#Review Findings`]
- [Source: `_bmad-output/implementation-artifacts/16-3-present-practical-vietnamese-answer-trust-and-recovery-states.md#Review Findings`]
- [Source: `_bmad-output/project-context.md#Testing Rules`, `#Critical Don't-Miss Rules`]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- Story context created from the Epic 16 acceptance contract, readiness assessment, architecture/UX guardrails, persistent project context, completed Stories 16.1-16.3 artifacts and review repairs, current source/test seams, and recent commit history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Status set to `ready-for-dev`.
- 2026-08-05: Added unit recommendation exact-shape, command-shape, canonical URL, trust-copy, and feedback UI structural regressions. `tests/trip-recommendations.test.ts` now runs in the infrastructure-free unit project.
- 2026-08-05: Added serial PostgreSQL feedback persistence coverage for owner isolation, assistant-only targeting, trimming, maximum length, upsert, useful-rating comment clearing, and concurrent writes. Extended direct API and recommendation integration negative matrices.
- 2026-08-05: A focused production fix clears the negative-only feedback comment when a traveler changes the rating to `useful`, preventing hidden-comment retention.
- 2026-08-05: Verification passed: `pnpm test:unit -- tests/trip-recommendations.test.ts tests/ai-ask-direct-api.test.ts tests/direct-shell-proposal-actions.test.ts tests/traveler-ui-foundation.test.ts tests/answer-annotations.test.ts` (24 files, 236 tests); `pnpm test:integration -- tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts tests/answer-usefulness-feedback.integration.test.ts` (47 files, 438 tests); `pnpm lint` (0 errors, 45 pre-existing warnings); `pnpm typecheck`; `pnpm build`; and `git diff --check`.
- 2026-08-05: Completed the private-turn production-path regression. `tests/private-turn-answer-context.integration.test.ts` verifies that a private decision preserves ordinary conversation facts while excluding Trip Project scope, anchors, constraints, context IDs, and project provenance from the next persisted answer.
- 2026-08-05: Ran an isolated Chromium 149.0.7827.55 Playwright browser matrix against a local Next shell with route-level typed API fixtures at `390x844` and `1440x900`. It verified navigation-sheet `Escape` focus restoration, `aria-current="page"` for unscoped `Hỏi XuyenViet`, feedback negative-to-useful editor removal, polite rendering, reduced-motion emulation, and a 44px product-control floor. Screenshots: `/tmp/opencode/story-16-4-mobile.png` and `/tmp/opencode/story-16-4-desktop.png`.
- 2026-08-05: Browser geometry inspection found and fixed three product controls below the 44px floor: optional image attachment, mobile-sheet new chat, and conversation delete. The Next development-tools overlay remains 32px but is framework-owned and excluded from product-control evidence.
- 2026-08-05: Final verification passed: focused unit command (24 files, 237 tests); focused serial integration command (48 files, 439 tests); `pnpm lint` (0 errors, 45 pre-existing warnings); `pnpm typecheck`; `pnpm build`; and `git diff --check`. PostgreSQL migration notices and test worker telemetry were expected integration setup output.
- 2026-08-06: Accessibility evidence recovery blocker: no Playwright/browser-harness configuration exists in the repository, and the previous Chromium screenshots were only stored under ephemeral `/tmp/opencode/` paths and are no longer available to attach. Do not treat static source tests as interaction proof. A reproducible browser run must record Chromium version and desktop/mobile viewports, then preserve screenshots under a versioned story artifact path for: navigation-sheet Escape/focus, selected-answer detail Escape/focus, private and continue actions, feedback save/failure with polite updates, stale-scope recovery, and `Hỏi XuyenViet`; it must also inspect active-row `aria-current`, 44px targets, and reduced motion. This blocker does not alter the existing source-level accessibility contracts.
- 2026-08-06: Review repairs verified: private turns from both creation and existing-project recommendations reach the source-bundle seam with no project scope; global fetch stubs are restored after the serial suite; feedback admission covers strict body parsing, safe command results, and principal-only forwarding. The review also found and fixed runtime Nest DTO metadata that had blocked every otherwise-valid feedback request before the command port. Focused unit verification passed (24 files, 237 tests); focused integration verification passed (48 files, 440 tests); `pnpm typecheck` and `git diff --check` passed. Browser interaction evidence remains blocked as recorded above.
- 2026-08-11: Completed the accessibility evidence matrix using Playwright Chromium 149.0.7827.55 (headless) with a minted database session. Evidence covers desktop (1440x900) and mobile (390x844) viewports with durable screenshots and a JSON matrix saved under `_bmad-output/implementation-artifacts/evidence/story-16-4/`. All required flows recorded: navigation sheet Escape/focus restoration (desktop collapsed-rail toggle + mobile session sheet), composer focus, `aria-current="page"` on unscoped `Hỏi XuyenViet`, `aria-live` polite regions, 44px product-control target floor, recommendation private/continue actions (private_answer and save_trip buttons visible), feedback controls, stale-scope recovery, and `prefers-reduced-motion: reduce` emulation. The evidence script is `scripts/story-16-4-evidence.ts`.
- 2026-08-11: Browser evidence revealed 4 desktop collapsed-rail icon buttons at 40px (`size-10`) instead of the 44px WCAG floor: `Mở thanh bên`, `Hỏi XuyenViet`, `Mở chuyến đi`, and `Mở tài khoản` in `ai-ask-composer.tsx:1853-1882`. Fixed by changing `size-10` to `size-11` (44px) on all four buttons. Post-fix evidence confirms all 9 desktop and 6 mobile product buttons pass the 44px target floor.
- 2026-08-11: Final verification passed: `pnpm test:unit` focused suite (40 files, 337 tests); `pnpm lint` (0 errors, 54 pre-existing warnings); `pnpm typecheck`; `pnpm build`; `git diff --check`. Integration tests (`pnpm test:integration`) encountered a pre-existing test-database migration blocker (`ALTER TABLE knowledge_ingestion_jobs DROP CONSTRAINT knowledge_ingestion_jobs_discovery_cursor_check` fails during `resetTestDatabase()`); this is an environmental issue unrelated to the 44px button fix and was not introduced by this story. Status set to review.

### File List

- `_bmad-output/implementation-artifacts/16-4-prove-chat-first-scope-trust-and-accessibility-boundaries.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/evidence/story-16-4/accessibility-matrix.json`
- `_bmad-output/implementation-artifacts/evidence/story-16-4/*.png`
- `apps/web/src/app/ai-ask/page.tsx`
- `apps/api/src/conversations/traveler-commands.controller.ts`
- `apps/web/src/features/ai/ai-ask-composer.tsx`
- `apps/web/src/features/chat-trips/conversation-list.tsx`
- `apps/web/src/features/chat-trips/ai-ask-url.ts`
- `scripts/story-16-4-evidence.ts`
- `tests/answer-usefulness-feedback.integration.test.ts`
- `tests/private-turn-answer-context.integration.test.ts`
- `tests/traveler-ui-foundation.test.ts`
- `tests/trip-recommendations-api.integration.test.ts`
- `tests/trip-recommendations.integration.test.ts`
- `tests/trip-recommendations.test.ts`
- `vitest.config.ts`

## Change Log

- 2026-08-05: Started Story 16.4 and added completed recommendation, feedback, URL, and static traveler trust/accessibility verification coverage.
- 2026-08-05: Completed private-turn and browser accessibility evidence, repaired demonstrated mobile target-size defects, and moved Story 16.4 to review.
- 2026-08-11: Completed durable browser accessibility evidence matrix via Playwright Chromium 149.0.7827.55; fixed 4 collapsed-rail icon buttons below 44px floor; moved Story 16.4 to review.
