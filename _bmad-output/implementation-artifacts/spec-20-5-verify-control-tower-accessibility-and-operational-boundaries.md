---
title: 'Verify Control Tower Accessibility and Operational Boundaries'
type: 'feature'
created: '2026-08-12'
status: 'done'
baseline_commit: '7e3ba74d4b508364e63e6b3f5b7d2841f324fbe9'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The Discovery control tower needs executable accessibility and ownership-boundary evidence across its queue, review, Mission, Health, and enablement seams. Static UI checks cannot prove the required 320 CSS-pixel/400%-zoom-equivalent browser flow, and Story 20.1 currently leaves global queue source pagination incomplete.

**Approach:** Extend existing strict contract, UI boundary, API, acceptance, execution, and read-only Health suites; add a controlled operator Playwright evidence harness and durable safe artifacts. Make only narrowly demonstrated production repairs, and do not claim final completion until Story 20.1 has completed its source-pagination repair and the Action Queue representative flow is rerun.

## Boundaries & Constraints

**Always:** Use only safe Discovery metadata, a controlled authorized-operator fixture, strict exact-key parser contracts, direct credentialed admin API transport, and serial integration suites with local clean-table resets. Browser evidence must record runtime URLs, browser version, fixture identity, commands, timestamp, desktop result, a 320 CSS-pixel/400%-zoom-equivalent sequential-reflow result, screenshots, and an accessibility matrix. Preserve Vietnamese-first feedback, persistent polite status, keyboard focus, selected semantics, non-color state cues, and 44px mobile controls. Accept may hand the canonical URL only to existing Knowledge seed-batch intake; Worker-only enablement fencing stays at provider/write/retry boundaries.

**Block If:** Story 20.1 is still in progress or its source-level global Action Queue keyset-pagination repair is absent when the final representative Action Queue browser flow is required. Halt with that dependency and leave this specification in `blocked` or `in-progress`; do not convert static checks into final end-to-end proof.

**Never:** Add routes, persistence, migrations, dashboards, BFFs, direct database access from admin, client-owned authorization, a Knowledge writer, capture scheduler, Gemini/provider call, Worker/API cancellation loop, raw diagnostics/content, or a proactive UI refactor. Do not expose capture, evidence, card, publication, traveler-retrieval, source, claim, prompt, provider, credential, or raw-source information.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Narrow representative flow | Authorized operator, queue item, 320px viewport | Queue to review or Mission/Health, Accept, and enablement remain sequentially reachable with no document horizontal overflow | Record safe failure and screenshot; do not fabricate browser evidence |
| Intake reconciliation | `submitted`, `duplicate`, confirmed failure, or unknown handoff | Only submitted/duplicate report canonical URL entering or already existing in Knowledge intake; failure remains reviewable and unknown reconciles before retry | Never claim capture, analysis, evidence, publication, or traveler retrieval |
| Protected command/read boundary | Anonymous, traveler, malformed, invalid-origin/CSRF, and operator requests | `401`/`403`/safe validation envelope or admitted operator command as applicable; reads remain select-only | Reject before port admission where required and retain safe exact envelopes |
| Revoked policy execution | Disabled or replaced policy run at provider/write/retry fence | Worker terminally cancels stale work with no provider, candidate, retry, Knowledge, or manual-capture side effect; re-enable never revives it | Keep run lifecycle closed and expose only safe status |

</intent-contract>

## Code Map

- `scripts/story-20-5-evidence.ts` -- new controlled Playwright browser evidence runner, modeled only structurally on Story 16.4.
- `apps/admin/app/knowledge/youtube-discovery/{queue.tsx,mission/mission.tsx,health/health.tsx}` and `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` -- existing responsive, focus, status, and typed-transport UI seams; repair only on demonstrated evidence.
- `packages/contracts/src/youtube-discovery/index.ts` and `tests/admin-youtube-discovery-contract.test.ts` -- closed safe-display parser boundary and negative payload evidence.
- `tests/admin-youtube-discovery-{review-ui,mission-ui,health-ui}.test.ts` -- focused DB-free transport, copy, focus, and presentation-boundary tests.
- `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/youtube-discovery-{accept,review,execution,health}.integration.test.ts` -- serial authorization, ownership, fence, and select-only evidence.
- `_bmad-output/implementation-artifacts/evidence/story-20-5/` -- generated matrix and screenshots; never contain unsafe payloads or credentials.

## Tasks & Acceptance

**Execution:**
- [x] `tests/admin-youtube-discovery-contract.test.ts` and focused UI boundary suites -- add closed-parser negative fixtures, truthful reconciliation copy, direct-transport exclusions, and existing accessibility seam assertions without parallel UI implementations.
- [x] `tests/admin-youtube-discovery-api.integration.test.ts` and `tests/youtube-discovery-{accept,review,execution,health}.integration.test.ts` -- fill only missing representative authorization, CSRF/origin, safe-envelope, sole-intake-handoff, Worker fence, and read-only assertions; retain local resets and serial execution.
- [x] `scripts/story-20-5-evidence.ts` and evidence directory -- create the controlled admin browser runner, write the safe matrix/screenshots, and verify desktop plus 320px/400%-zoom-equivalent reflow, focus, status/semantics, and target size.
- [x] Existing implicated UI component only if evidence demonstrates a defect -- apply the smallest correction and focused regression; otherwise make no production UI change.
- [x] Story 20.1 completion dependency -- rerun the representative Action Queue browser flow only after its owner-port keyset pagination repair is complete; retain the exact blocker if unavailable.

### Review Findings

- [x] [Review][Patch] Prove Action Queue keyboard activation reaches its destination [scripts/story-20-5-evidence.ts:73]
- [x] [Review][Patch] Exercise Review Accept and reconciliation in the controlled browser flow [scripts/story-20-5-evidence.ts:75]
- [x] [Review][Patch] Add focus and polite status feedback to Mission detail [apps/admin/app/knowledge/youtube-discovery/mission/[actionId]/detail.tsx:34]
- [x] [Review][Patch] Add load-time focus to Health incident detail [apps/admin/app/knowledge/youtube-discovery/health/[actionId]/detail.tsx:17]
- [x] [Review][Patch] Fail closed for malformed encoded Health action IDs [apps/admin/app/knowledge/youtube-discovery/health/[actionId]/page.tsx:5]
- [x] [Review][Patch] Make the controlled local fixture repeatable [scripts/story-20-5-fixture.ts:35]
- [x] [Review][Patch] Restore the controlled enablement state and verify the configured API runtime [scripts/story-20-5-evidence.ts:7]

**Acceptance Criteria:**
- Given the controlled operator runs the completed evidence matrix, when desktop and narrow queue/review/Mission/Health/enablement flows are exercised, then each authorized function is reachable by keyboard through sequential reflow without document horizontal overflow and with the required focus, semantics, persistent feedback, non-color, and 44px evidence.
- Given safe-display and reconciliation fixtures, when all control-tower projections and Accept outcomes are parsed and presented, then unsafe fields fail before rendering and intake feedback never implies capture or publication.
- Given protected API, Worker, and UI representative paths, when accepted URLs and enablement fences are exercised, then the only allowed cross-domain effect is the existing Knowledge intake handoff and Discovery neither writes Knowledge artifacts nor invokes/schedules/retries manual capture or Gemini work.

## Design Notes

The new evidence script is a verification artifact, not production runtime code. It may mint a disposable local operator session using the established evidence pattern, but it must target the admin/API topology and fixture chosen for this story rather than reuse Story 16.4's traveler fixture. Browser scale factor alone is not proof of 400% zoom; record the explicit narrow reflow method and overflow check.

## Verification

**Commands:**
- `pnpm test:unit -- tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-review-ui.test.ts tests/admin-youtube-discovery-mission-ui.test.ts tests/admin-youtube-discovery-health-ui.test.ts` -- expected: focused infrastructure-free boundary evidence passes.
- `pnpm test:integration -- tests/admin-youtube-discovery-api.integration.test.ts` -- expected: serial protected transport evidence passes.
- `pnpm test:integration -- tests/youtube-discovery-accept.integration.test.ts` -- expected: serial intake ownership/reconciliation evidence passes.
- `pnpm test:integration -- tests/youtube-discovery-review.integration.test.ts` -- expected: serial candidate-review evidence passes.
- `pnpm test:integration -- tests/youtube-discovery-execution.integration.test.ts` -- expected: serial Worker fence evidence passes.
- `pnpm test:integration -- tests/youtube-discovery-health.integration.test.ts` -- expected: serial select-only Health evidence passes.
- `pnpm tsx scripts/story-20-5-evidence.ts` -- expected: controlled browser runtime writes the safe evidence matrix and screenshots; final queue evidence runs only after Story 20.1 completes.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` -- expected: production checks and whitespace validation pass.

## Auto Run Result

Status: done

Story 20.1 is complete, including the source-level Action Queue keyset-pagination repair. The controlled local fixture and API/Admin runtime completed the Chromium matrix at desktop and 320 CSS pixels with no failed or skipped checks. The safe evidence matrix and screenshots are stored under `_bmad-output/implementation-artifacts/evidence/story-20-5/`.

## Dev Agent Record

### Implementation Plan

- Extended exact-key contract regressions across Action Queue, Mission, Health, and Accept outcomes for unsafe fields.
- Added operator/anonymous/traveler/CSRF/origin admission coverage for Discovery enablement and bad-origin coverage for Accept.
- Made submitted and duplicate feedback identify Knowledge intake only, without claiming or naming later capture or publication work.
- Added a fail-closed controlled Playwright runner that records safe accessibility evidence only when a local authorized fixture is supplied.
- Repaired the fixture to use PostgreSQL time for its browser-session expiry, avoiding host/database clock skew during guarded browser admission.
- Added only evidence-backed UI repairs: load-time heading focus for Review and Health, preserved enablement confirmation feedback across refresh, and decoded opaque Health action IDs before validation.

### Debug Log

- The local fixture initially minted sessions with the host clock while PostgreSQL evaluated expiry with a clock over six hours ahead, producing a valid-cookie `401`. The fixture now uses `now() + interval '1 hour'` on PostgreSQL.
- Browser evidence exposed missing Review/Health heading focus, an encoded Health incident action ID rejected before decoding, and a loading status overwriting confirmed enablement feedback; focused regressions cover each repair.
- PostgreSQL integration suites were run one file at a time because they share one physical test database.

### Completion Notes

- Focused unit boundary suite passed: 41 files, 341 tests.
- API integration passed: 20 tests.
- Required Discovery integrations passed serially: Accept 12, Review 1, Execution 35, Health 16, Action Queue 10 tests.
- Controlled Chromium 149.0.7827.55 browser matrix passed without failures or skips for desktop 1440x900 and narrow 320x900 reflow, including Queue, Review, Mission, Mission detail, Health, incident detail, and enablement confirmation.
- `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` passed with 53 pre-existing warnings and no errors.
- The full integration suite remains red on 17 pre-existing out-of-scope tests. The six Story 20.5 integration suites passed serially: API 20, Accept 12, Review 1, Execution 35, Health 16, Action Queue 10.
- Code review resolved all seven findings: destination navigation and browser Accept are now asserted, Mission/Health detail focus and Mission status are covered, malformed encoded Health IDs fail closed, the controlled fixture can rerun its Mission coverage setup, enablement is restored, and browser API requests must reach the configured local API origin.

## File List

- `apps/admin/app/knowledge/youtube-discovery-review/review-copy.ts`
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx`
- `apps/admin/app/knowledge/youtube-discovery/health/[actionId]/page.tsx`
- `apps/admin/app/knowledge/youtube-discovery/health/health.tsx`
- `apps/admin/app/knowledge/youtube-discovery/health/[actionId]/detail.tsx`
- `apps/admin/app/knowledge/youtube-discovery/mission/[actionId]/detail.tsx`
- `scripts/story-20-5-evidence.ts`
- `scripts/story-20-5-fixture.ts`
- `tests/admin-youtube-discovery-api.integration.test.ts`
- `tests/admin-youtube-discovery-contract.test.ts`
- `tests/admin-youtube-discovery-health-ui.test.ts`
- `tests/admin-youtube-discovery-review-ui.test.ts`
- `_bmad-output/implementation-artifacts/evidence/story-20-5/accessibility-matrix.json`
- `_bmad-output/implementation-artifacts/evidence/story-20-5/*.png`

## Change Log

- 2026-08-12: Added safe parser, protected transport, truthful reconciliation, and fail-closed browser-evidence preparation for Story 20.5. Blocked pending controlled local browser runtime and authorized operator fixture.
- 2026-08-12: Completed controlled local browser evidence and evidence-backed accessibility/runtime repairs; Story is ready for code review.
- 2026-08-12: Resolved all seven BMad code-review findings; controlled browser matrix and Story-specific serial verification pass. Story completed.
