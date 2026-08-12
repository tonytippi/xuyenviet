---
story_id: 20-5
status: ready-for-dev
created: 2026-08-12
epic: 20
---

# Story 20.5: Verify Control Tower Accessibility and Operational Boundaries

## Story

As a product owner,
I want executable evidence that the Discovery control tower remains accessible and safely bounded,
so that operational convenience cannot bypass the Discovery, Knowledge intake, or manual capture contracts.

## Acceptance Criteria

1. **Given** control-tower UI and contract tests run across desktop plus a narrow 320 CSS-pixel/400%-zoom-equivalent presentation, **when** they exercise action queue, candidate review, Mission query actions, Health, and global switch flows, **then** every authorized function remains reachable through responsive sequential reflow without two-dimensional scrolling.
   - Keyboard operation, visible non-obscured focus, selected-state semantics, color-independent status, `aria-live`, and 44px touch targets meet the Discovery UX contract.
2. **Given** read models, errors, and action feedback are inspected, **when** safe-display tests run, **then** they exclude raw comments, source material, model/provider payloads, secrets, capture internals, evidence spans, and traveler content.
   - Submitted, duplicate, failed, and unknown intake outcomes never claim capture or publication.
3. **Given** role-protected API, Worker, and UI flows are tested end to end, **when** they exercise one representative Action queue item, one Mission/Health drill-down, Accept, and the global switch, **then** no hidden path directly creates a source, invokes Gemini video analysis, schedules/retries `youtube:capture`, or changes a Knowledge claim.
   - Only the existing Knowledge intake API may create a source after a Discovery Accept command.

## Prerequisite

- Story 20.1 is currently `in-progress` because its source-level pagination repair remains open. Do not claim final end-to-end completion until its Action queue behavior and focused regression suite are complete. This story may prepare its independent test/evidence work now, but must rerun the representative Action queue flow after Story 20.1 is done.

## Tasks / Subtasks

- [ ] Establish the verification boundary and controlled evidence setup (AC: 1-3)
  - [ ] Treat this as a verification story. Reuse the delivered Action Queue, review workspace, Mission, Health, enablement, API, and Worker seams; do not add a dashboard, new API route, persistence model, policy editor, direct Knowledge writer, capture scheduler, or product behavior unless executable evidence demonstrates an in-scope defect.
  - [ ] Use a controlled authorized operator fixture/session and only safe Discovery metadata. Record the admin/API runtime URLs, browser version, narrow-width method, fixture identity, commands, and timestamp. Keep setup and cleanup limited to the smallest fixture needed for the representative flow.
  - [ ] Keep DB-free UI/parser checks in the existing unit-test allow-list. Keep PostgreSQL/API/Worker tests under `pnpm test:integration`, serial with local `resetTestDatabase()` for every clean-table suite. Do not enable parallel integration workers or add a global reset hook.

- [ ] Prove responsive accessibility across the actual control tower (AC: 1)
  - [ ] Extend the existing Action Queue, candidate-review, Mission, and Health UI boundary suites rather than creating parallel presentation implementations. Exercise the representative flows on desktop; use one focused narrow presentation check at 320 CSS pixels/400%-zoom-equivalent to prove sequential reflow and no document horizontal overflow.
  - [ ] In the representative desktop flow, verify keyboard reachability, visible focus after the terminal candidate action and query validation failure, selected-state semantics, persistent `role="status"`/`aria-live="polite"` feedback, text plus non-color status cues, and 44px controls. Toasts cannot be the sole status/focus evidence.
  - [ ] Add and run a small Playwright evidence script for the required browser-level narrow reflow, overflow, and representative focus/target checks. Reuse the session/evidence structure in `scripts/story-16-4-evidence.ts` without copying its unrelated traveler fixture; write screenshots plus `accessibility-matrix.json` under `_bmad-output/implementation-artifacts/evidence/story-20-5/`.

- [ ] Lock safe display and truthful Knowledge-intake feedback (AC: 2)
  - [ ] Extend `tests/admin-youtube-discovery-contract.test.ts` as the canonical exact-key parser boundary. Add negative fixtures for raw comments/source material, prompts/model/provider payloads or diagnostics, credentials/secrets, capture internals, evidence spans, and traveler content across Action Queue, Mission, review, Health, and enablement projections.
  - [ ] Extend `tests/admin-youtube-discovery-review-ui.test.ts`, `tests/admin-youtube-discovery-mission-ui.test.ts`, and `tests/admin-youtube-discovery-health-ui.test.ts` only as needed to prove strict parse-before-render and that browser transport does not call a direct source, capture, Gemini, Knowledge mutation, or Worker endpoint.
  - [ ] Cover all Accept reconciliation outcomes: `submitted`, `duplicate`, confirmed failure, and unknown/reconciling. Submitted and duplicate may say that the canonical URL entered or already existed in Knowledge intake; neither may say or imply capture, Gemini analysis, evidence/card creation, publication, or traveler retrieval. Failure keeps the candidate reviewable and unknown reconciles before retry.
  - [ ] Preserve Vietnamese-first approved copy and the existing safe error envelope. Do not add raw IDs, provider error text, or unsafe diagnostics to make assertions easier.

- [ ] Prove API, Worker, and Knowledge ownership boundaries end to end (AC: 3)
  - [ ] Extend `tests/admin-youtube-discovery-api.integration.test.ts` to prove anonymous `401`, authenticated traveler `403`, authorization before port admission, malformed request rejection, CSRF/origin denial for Accept and enablement, operator success, and exact safe response/error envelopes.
  - [ ] Reuse `tests/youtube-discovery-accept.integration.test.ts` and/or `tests/youtube-discovery-review.integration.test.ts` for the real Accept handoff. Snapshot the relevant Discovery/Knowledge state before and after the command; prove the sole allowed cross-domain effect is the existing Knowledge seed-batch intake path, and that Discovery itself neither writes a source nor gains a source link.
  - [ ] Prove Accept and every inspected control-tower read/action do not create capture versions, ingestion jobs, evidence, cards, publication/suppression/conflict state, or Knowledge claims; do not invoke Gemini video analysis; and do not schedule, invoke, enqueue, or retry manual `youtube:capture`.
  - [ ] Extend `tests/youtube-discovery-execution.integration.test.ts` for the representative global-disable fence: the Worker, not API/UI code, stops Discovery at pre-provider/pre-write/retry boundaries; no provider/candidate/retry work follows a revoked policy; re-enabling does not revive terminal cancelled runs; Knowledge and manual capture state remain untouched.
  - [ ] Retain `tests/youtube-discovery-health.integration.test.ts` select-only assertions. Health and Action Queue reads must not reconcile reviews, write audits, invoke Knowledge intake/capture eligibility, call providers, claim/schedule/retry Worker work, or mutate Discovery policy/review state.

- [ ] Preserve the established seams and keep production repairs narrow (AC: 1-3)
  - [ ] Reuse the only Discovery admin namespace in `apps/api/src/admin/admin-youtube-discovery.controller.ts`, strict contracts in `packages/contracts/src/youtube-discovery/index.ts`, the typed `AdminYoutubeDiscoveryPort`, and direct credentialed API clients in `apps/admin`. Do not introduce an admin BFF, Next route handler, server-action writer, direct database import, or client-owned authorization/eligibility calculation.
  - [ ] Preserve `apps/admin/app/knowledge/youtube-discovery/queue.tsx`, `mission/mission.tsx`, `health/health.tsx`, and `youtube-discovery-review/review.tsx` interaction patterns: `cache: "no-store"`, request IDs, strict parsing, CSRF for mutations, visible persistent status, and narrow `min-w-0` reflow. Retain Mission/Health request fencing; add Queue fencing only if the representative retry/load-more evidence demonstrates a race.
  - [ ] Preserve `packages/worker-domain/src/features/youtube-discovery/execution.ts` and `packages/database/src/youtube-discovery/index.ts` as the scheduled execution/fence owners. Never add an API/admin cancellation loop.
  - [ ] If browser evidence reveals a defect, update only the implicated existing component/test with the smallest correction. Do not proactively refactor the control tower.

- [ ] Produce durable, auditable verification evidence (AC: 1-3)
  - [ ] Run focused DB-free checks via `pnpm test:unit -- tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-review-ui.test.ts tests/admin-youtube-discovery-mission-ui.test.ts tests/admin-youtube-discovery-health-ui.test.ts`.
  - [ ] Run the relevant serial suites individually via `pnpm test:integration`: `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/youtube-discovery-accept.integration.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, and `tests/youtube-discovery-health.integration.test.ts`.
  - [ ] Run `pnpm tsx scripts/story-20-5-evidence.ts` against a controlled runtime and retain its JSON matrix and screenshots in the Story 20.5 evidence directory. The matrix records the desktop representative flow and one 320 CSS-pixel/400%-zoom-equivalent reflow check; source inspection does not substitute for browser execution.
  - [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact commands, outcomes, coverage, and any external/runtime blocker in Completion Notes. Do not mark the story done on static UI checks alone.

## Dev Notes

### Scope and sequencing

- Story 20.5 is Epic 20's final cross-control-tower evidence layer. Stories 20.1-20.4 own their respective product behavior; this story verifies their integration and repairs only defects demonstrated by that verification.
- Current sprint status has Stories 20.2-20.4 done, Story 20.1 in progress, and this story newly ready for development. The unresolved Story 20.1 pagination work is a final-completion dependency, not permission to weaken Action Queue coverage.
- The required representative chain is Action Queue -> candidate review or Mission/Health drill-down -> Accept -> global enablement. It must prove access control and ownership, not merely render components in isolation.

### Architecture and safety guardrails

- Discovery is URL-only. `Accept` calls only the existing Knowledge seed-batch intake API using the canonical URL. `accepted` means that API returned `submitted` or `duplicate`; it does not prove capture, evidence, cards, publication, or traveler retrieval.
- Knowledge exclusively owns sources, capture, ingestion, evidence, verification, publication, suppression, conflict, and claim decisions. Discovery must not write any of them or retain a source ID/link.
- Manual `youtube:capture` is separately operator initiated and is the sole Gemini video-analysis path. Discovery UI/API/Worker proof must show no hidden manual-capture schedule, invocation, enqueue, or retry.
- Worker owns due-run execution, providers, retries, run transitions, leases, and policy-revocation fences. Admin/API commands are protected command/read-model seams only.
- Persist and display only bounded safe operational data. Never expose raw comments/source material, prompts/responses, provider payloads/diagnostics, video/media/transcripts, credentials/cookies/secrets, capture internals, evidence spans, or traveler content.
- Keep recommendation (`skip | defer | consider`), candidate state (`pending | accepted | deferred | skipped`), and run state (`queued | running | retrying | completed | failed | cancelled`) separate. A ranking outcome is not verified knowledge or publication authority.

### Existing implementation to preserve

- `apps/api/src/admin/admin-youtube-discovery.controller.ts` is the sole protected Discovery admin API namespace. Its browser-session/capability guards, strict request parsing, response parsing, and safe envelopes are mandatory.
- `packages/contracts/src/youtube-discovery/index.ts` is the exact-key, closed-union parser boundary. Unsafe or extra fields must fail before UI presentation.
- `apps/admin/app/knowledge/youtube-discovery/queue.tsx`, `mission/mission.tsx`, `health/health.tsx`, and `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` already implement the direct API, Vietnamese status, selected-state, focus, and responsive seams. Mission and Health use request fencing; only add equivalent Queue fencing if the representative retry/load-more evidence demonstrates a race.
- `packages/database/src/admin-youtube-discovery.ts#listReview` has reconciliation side effects. Never use it as generic proof that a Mission, Health, or Action Queue read is side-effect free; retain the owner-specific read tests.
- The existing Story 16.4 Playwright script is a durable-evidence precedent, not a fixture to copy blindly: it mints a local browser session and targets unrelated traveler flows. Story 20.5 needs controlled operator data plus explicit 320px/400% assertions.

### Project Structure Notes

- Expected updates are focused tests: `tests/admin-youtube-discovery-contract.test.ts`, `tests/admin-youtube-discovery-review-ui.test.ts`, `tests/admin-youtube-discovery-mission-ui.test.ts`, `tests/admin-youtube-discovery-health-ui.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/youtube-discovery-accept.integration.test.ts` or `tests/youtube-discovery-review.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, and `tests/youtube-discovery-health.integration.test.ts`.
- Required new browser-evidence files: `scripts/story-20-5-evidence.ts` and `_bmad-output/implementation-artifacts/evidence/story-20-5/accessibility-matrix.json` plus screenshots. Prefer extending registered unit suites to avoid unnecessary `vitest.config.ts` churn.
- Production UI files are conditional updates only if executable evidence demonstrates a defect: Queue, Mission, Health, review workbench, or `apps/admin/app/admin-access-gate.tsx`.
- No new dependency, migration, provider integration, Worker loop, database table, generic repository, raw event store, dashboard/chart library, policy editor, Knowledge writer, capture scheduler, or blocking/exclusion policy is permitted.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.5]
- [Source: _bmad-output/implementation-artifacts/epic-20-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/20-1-build-the-action-required-discovery-queue.md#Completion Notes List]
- [Source: _bmad-output/implementation-artifacts/20-2-deliver-knowledge-mission-drill-downs.md#Existing implementation to preserve]
- [Source: _bmad-output/implementation-artifacts/20-3-deliver-automation-health-and-safe-incident-detail.md#Existing implementation to preserve]
- [Source: _bmad-output/implementation-artifacts/20-4-control-discovery-enablement-safely.md#Existing implementation to preserve]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1 through AD-8]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Accessibility Floor]
- [Source: _bmad-output/project-context.md#Testing Rules]
- [Source: vitest.config.ts#unitTests and integration project]
- [Source: scripts/story-16-4-evidence.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story analysis completed 2026-08-12 using full sprint status, Epic 20 context, Stories 20.1-20.4, active Discovery architecture and UX, project context, existing test/runtime evidence patterns, current Vitest boundary configuration, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status is ready-for-dev. No implementation, migration, database reset, test execution, browser-evidence run, or commit was performed while creating this story.
- The guide treats Story 20.5 as focused verification, preserves the existing Discovery/Knowledge/manual-capture ownership boundaries, and requires real browser evidence for 320 CSS pixels and 400% zoom rather than static source inspection.
- Final completion remains gated by Story 20.1's outstanding Action Queue pagination repair and rerunning the representative Action Queue flow after that dependency is complete.

### File List

- _bmad-output/implementation-artifacts/20-5-verify-control-tower-accessibility-and-operational-boundaries.md
