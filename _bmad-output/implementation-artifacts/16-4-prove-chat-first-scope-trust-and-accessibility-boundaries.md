---
baseline_commit: cbf9efc
---

# Story 16.4: Prove Chat-First Scope, Trust, and Accessibility Boundaries

Status: ready-for-dev

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

- [ ] Complete recommendation contract and ownership regression matrix (AC: 1)
  - [ ] Extend `tests/trip-recommendations.test.ts` for every valid recommendation shape and invalid exact-shape input: injected fields, invalid action sets/order, malformed decision IDs, and prohibited `tripProjectId`/title leakage from `none`, `clarify`, and `multiple` results.
  - [ ] Extend `tests/trip-recommendations.integration.test.ts` for no owned match, one owned match, multiple owned matches, foreign-project-only inputs, decline/explicit-save fencing, retry/concurrent acceptance, stale revision/fingerprint, deleted conversation/project, and foreign decisions.
  - [ ] Add explicit negative tests for foreign or mismatched `continueInTrip(...)` selection and wrong decision kind. All failures must be non-disclosing and create/attach nothing.
  - [ ] Extend `tests/trip-recommendations-api.integration.test.ts` to cover authenticated principal, CSRF, strict body parsing, and safe result handling for decline, private, continue, and accepted creation. Keep accepted-creation `Idempotency-Key` unique to its endpoint.

- [ ] Prove private-answer and canonical selected-project data boundaries (AC: 2)
  - [ ] Add a database-level private-turn regression through the actual answer-context/source-bundle seam. After private selection from an ordinary conversation, assert the subsequent turn has no project scope/ID, constraints, anchors, or project-derived provenance/context and that the ordinary conversation remains unlinked.
  - [ ] Assert private/decline actions preserve the current unscoped URL; they must not load or persist a selected project or create a durable private-mode state.
  - [ ] Assert continue and accepted creation navigate only using the server-returned canonical `{ tripProjectId, conversationId }`, and the chosen project's existing same-owner primary conversation is used without copying, merging, linking, or replaying the ordinary conversation.
  - [ ] Reuse `packages/database/src/answer-context.ts`, `packages/database/src/trip-recommendations.ts`, and the direct Nest command routes. Do not duplicate context assembly in a test helper or browser code.

- [ ] Strengthen URL-shell and trust/recovery regression coverage (AC: 2-3)
  - [ ] Add narrow pure/direct-client coverage for canonical `/ai-ask` URL construction: unscoped route, ordinary conversation, server-returned project destination, and historic conversation review. Reject multi-valued query input and do not manufacture primary-conversation authority in the client.
  - [ ] Extend `tests/direct-shell-proposal-actions.test.ts` and/or existing compatible tests to prove a scope-key change blocks the old shell, stale/foreign/unlinked resources reconcile to `/ai-ask`, and no second shell loader, browser persistence owner, or breakpoint-specific selection state is introduced.
  - [ ] Extend `tests/traveler-ui-foundation.test.ts` with a positive Vietnamese-copy and forbidden-vocabulary matrix covering the composer and direct shell loader. Cover practical loading, verification, unavailable, retry, stale-scope, stream failure, and completed-follow-up-delay paths.
  - [ ] Assert safe disclosures derive only from persisted provenance/annotations, accept `detail: null` and withdrawn/missing detail without fallback exposure, do not expose raw URLs as quick facts, and never infer source/trust state by parsing answer text.
  - [ ] The forbidden traveler output includes internal state/job/consumer names, source/provenance/retrieval taxonomy, confidence codes, provider/model names, request or correlation IDs, error codes, diagnostics, raw source material, evidence, conditions, and provenance IDs.

- [ ] Verify feedback persistence and accessible interaction contracts (AC: 3-4)
  - [ ] Add a focused serial PostgreSQL suite, preferably `tests/answer-usefulness-feedback.integration.test.ts`, with local `resetTestDatabase()` setup. Prove insert, same-user/message update without duplication, owner isolation, assistant-message-only targeting, missing/foreign safe results, trimmed comments, and maximum-length validation.
  - [ ] Preserve `saveDirectAnswerUsefulnessFeedback()` relative cookie-authenticated CSRF/parsing behavior and validate the controller uses the authenticated principal rather than browser-supplied identity.
  - [ ] Extend the existing source-level/component-compatible UI tests for compact positive/negative controls, negative-only comment editor, pending disablement, polite announcement, message-scoped update, visible focus, 44px mobile targets, and no composer displacement. Do not introduce a new UI framework or dependency solely for this story.
  - [ ] Audit only the Story 16 flows for `Escape`, focus return to a connected trigger or composer fallback, mobile sheet focus trapping, keyboard-reachable active sidebar rows, `aria-current`, relevant `aria-live` updates, selected-trip visibility across layouts, and `motion-reduce:transition-none` on changed transitions. Fix only defects demonstrated by these checks.

- [ ] Run and record focused verification (AC: 5)
  - [ ] Run `pnpm test:unit -- tests/trip-recommendations.test.ts tests/ai-ask-direct-api.test.ts tests/direct-shell-proposal-actions.test.ts tests/traveler-ui-foundation.test.ts`.
  - [ ] Run `pnpm test:integration -- tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts` and the feedback integration suite if added. Integration suites remain serial and each suite requiring clean data calls `resetTestDatabase()` locally.
  - [ ] Run any directly affected persisted-provenance/source-withdrawal suite, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
  - [ ] Record exact commands, counts, pre-existing warnings, and any unavailable infrastructure in Completion Notes. Do not claim a UI interaction proof that the existing runner cannot execute.

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

### File List

- `_bmad-output/implementation-artifacts/16-4-prove-chat-first-scope-trust-and-accessibility-boundaries.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
