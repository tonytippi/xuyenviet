---
title: 'Accept a Candidate Through Knowledge Intake'
type: 'feature'
created: '2026-08-10'
status: 'done'
baseline_revision: '168f603'
final_revision: 'eeafb59'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-19-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** An operator can inspect a valid Discovery recommendation but cannot safely hand its server-resolved canonical URL to Knowledge intake. A retry or timeout must not create a second intake or incorrectly mark Discovery accepted.

**Approach:** Add a minimal Knowledge-owned, opaque one-URL handoff ledger and a Discovery-owned reconciliation marker. Expose an audited, role- and CSRF-protected Accept command that accepts only a recommendation ID, then update the existing review inspector without adding other decision commands.

## Boundaries & Constraints

**Always:** Revalidate and lock the exact Story 19.3 review association (`pending`, immutable `consider`, query-provenanced run) before first admission; derive the canonical URL server-side. Knowledge alone owns sources, seed batches, intake identity binding, and terminal handoff lookup. Discovery retains only an opaque reference plus safe reconciling state, transitions only `pending -> accepted` after `submitted` or `duplicate`, and writes exactly one bounded audit event with that transition. Keep all browser/API results as closed safe outcomes and use the existing admin capability, session, Origin, and CSRF boundary.

**Block If:** The existing Knowledge adapter cannot own a durable URL/actor-bound handoff identity while preserving the current seed-batch contract, or its canonical/advisory-lock admission primitive cannot be reused without direct Discovery access to Knowledge persistence.

**Never:** Accept a URL from the browser; write or query Knowledge sources from Discovery; expose batch/source/capture identifiers, URLs, raw errors, or provider data; infer success from a duplicate retry; invoke Gemini or `youtube:capture`; change triage/ranking/canonicalization; add Defer/Skip commands, a general action queue, or a modal confirmation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Terminal admission | Authorized valid pending review and fresh opaque handoff | Knowledge returns `submitted` or `duplicate`; Discovery atomically accepts and audits; queue advances | Return only the matching closed outcome and exact Vietnamese feedback |
| Known admission failure | Knowledge ledger records `failed` | Review remains pending and actionable | Return typed safe failure with retry feedback; no accepted audit |
| Ambiguous admission | Timeout, unavailable, malformed, incomplete, or missing handoff result | Persist/reuse opaque reference; pending review remains visible but non-actionable | Return/project `reconciling` and resolve durable original handoff before another admission |
| Repeat/concurrent Accept | Existing handoff reference or locked same candidate | Join/reconcile the original identity, never create another intake or audit | Terminal state is stable; rejected inactive/stale state does not call Knowledge |
| Invalid command | Invalid ID, non-exact `{}`, absent/non-active association | No URL/intake/disclosure occurs | `400 validation_error` for syntax; `404 not_found` for unavailable review; guard-owned auth/CSRF errors; unsafe infrastructure is `503` |

</intent-contract>

## Code Map

- `packages/domain/src/admin-knowledge-intake.ts` and `packages/database/src/admin-knowledge-intake.ts` -- existing owner-owned normalization, advisory lock, source admission, and seed-batch public contract.
- `packages/database/src/schema.ts` and `drizzle/migrations/meta/_journal.json` -- Knowledge ledger plus Discovery reconciliation schema and next forward migration registration.
- `packages/domain/src/youtube-discovery/admin.ts` and `packages/database/src/admin-youtube-discovery.ts` -- admin command port, locked association revalidation, Discovery state/audit transition, and safe review projection.
- `packages/contracts/src/youtube-discovery/index.ts` -- strict exact Accept request, closed outcomes/action availability, and safe queue/detail parsers.
- `apps/api/src/main.ts` and `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- explicit handoff-port composition and protected POST transport.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` and `review-copy.ts` -- typed CSRF mutation, Accept interaction, exact feedback, and success recovery.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, and `tests/admin-youtube-discovery-review-ui.test.ts` -- contract, persistence, API, and UI safety seams.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/admin-knowledge-intake.ts`, `packages/database/src/admin-knowledge-intake.ts`, `packages/database/src/schema.ts`, `drizzle/migrations/*`, and migration journal -- added an internal one-URL handoff ledger, opaque identity/actor/URL binding, strict terminal classification, and closed lookup while preserving public seed-batch behavior and Knowledge-only source writes.
- [x] `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/admin-youtube-discovery.ts`, schema, and forward migration -- injected the Knowledge handoff port; locked/revalidated the exact active review association; durably reused only opaque handoff/reconciling data; atomically accepted plus audited only after terminal success; exposed a closed safe action-availability projection.
- [x] `packages/contracts/src/youtube-discovery/index.ts` -- parses only JSON `{}` for Accept and only `submitted | duplicate | failed | reconciling` results; rejects unsafe/out-of-contract fields from requests, command responses, and read projections.
- [x] `apps/api/src/main.ts` and `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- compose the owner port once and add protected `POST review/:recommendationId/accept` with safe status envelopes and no Knowledge identifiers.
- [x] `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` and `review-copy.ts` -- replace only Accept preview with immediate credentialed CSRF POST; disable all actions pending/reconciling; retain detail, announce closed Vietnamese results, and refetch/select next active item after terminal success. Defer/Skip remain inert.
- [x] Relevant unit, integration, API, and UI tests -- prove strict contracts, identity binding, command idempotency/reconciliation, transition/audit atomicity, source/capture isolation, guards/envelopes, exact feedback, and Accept-only client transport. Every clean-state integration file locally resets its serial test database.

**Acceptance Criteria:**
- Given an authorized active review, when the operator accepts it, then the browser provides only its recommendation ID and the locked server association sends exactly its canonical URL through the Knowledge-owned handoff.
- Given the durable handoff returns terminal `submitted` or `duplicate`, when Discovery completes its transaction, then the candidate is accepted once, audited once, removed from active review, and reports only the required distinct Vietnamese result.
- Given failure or ambiguity, when the original handoff cannot be known terminally, then accepted is never inferred, no repeat intake occurs, and the pending candidate is respectively safely retryable or durably non-actionable while reconciling.
- Given reload, concurrent request, invalid body, stale state, or unauthorized/invalid-CSRF request, when the command is processed, then no historic state or Knowledge internals leak and no unapproved source/capture/provider side effect occurs.
- Given a successful Accept in the inspector, when the queue refreshes, then it selects the first remaining active review or the established completion state without a dialog; Defer and Skip remain disabled previews.

### Review Findings

- [x] [Review][Patch] Inactive accepted review exposes a historic terminal outcome [packages/database/src/admin-youtube-discovery.ts:65] — Removed the terminal-outcome fallback when no pending association can be locked; inactive/stale retries now return `404 not_found` without disclosing historic state (AC 1).
- [x] [Review][Patch] Discovery retains the Knowledge handoff actor identity [drizzle/migrations/0060_remove_discovery_handoff_actor.sql:1] — Lookup now accepts only the opaque reference, Discovery no longer models or writes `actor_user_id`, and migration `0060` removes the previously deployed column. Knowledge retains actor/URL binding for admission.
- [x] [Review][Patch] Interrupted Accept is presented as confirmed failure [apps/admin/app/knowledge/youtube-discovery-review/review.tsx:83] — An error after dispatch latches reconciling feedback and refreshes the selected detail server-side; only failures before dispatch remain retryable client failures (AC 4).

## Spec Change Log

## Review Triage Log

### 2026-08-10 - Final review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

### 2026-08-10 - Review repair passes
- intent_gap: 0
- bad_spec: 0
- patch: 17 (high 6, medium 11, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [high] [patch] Made non-terminal handoff outcomes, missing ledgers, lost review associations, and unavailable owner calls fail closed as reconciling without inferred acceptance.
  - [high] [patch] Preserved actor-correct audits, migration validity, terminal retry outcomes, retention reconciliation bridges, and exact single-transition behavior under concurrent finalizers.
  - [medium] [patch] Bounded page reconciliation, kept a reconciled cursor anchor valid, retained terminal Vietnamese feedback, and fenced stale inspector/queue operations.

### 2026-08-10 - Post-review repair
- intent_gap: 0
- bad_spec: 0
- patch: 3 (high 0, medium 3, low 0), all resolved
- defer: 0
- reject: 1
- addressed_findings:
  - Removed stale terminal result disclosure after the review leaves its active pending state.
  - Removed Discovery's durable actor copy and kept closed actor/URL binding within Knowledge's opaque handoff ledger.
  - Made a post-dispatch browser interruption visibly reconciling and server-refreshed before retry.

## Design Notes

Knowledge and Discovery commit independently by ownership. The durable opaque handoff identity is the recovery bridge: Knowledge establishes its terminal record first, then Discovery uses that record to make the review transition and audit idempotent. `duplicate` only succeeds when it is the original handoff's terminal ledger result, not when Discovery guesses from a later source lookup.

## Verification

**Commands:**
- `pnpm test:unit -- <affected DB-free test files>` -- strict parsers, closed outcomes/copy, and no unsafe UI transport fields pass without PostgreSQL.
- `pnpm test:integration -- <affected integration test files>` -- serial ledger, locking/reconciliation, API guards, audit, and source-boundary tests pass with local resets.
- `pnpm lint` -- no new lint errors.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production builds pass.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

Status: done

Summary: Added immediate, audited Discovery candidate acceptance through a Knowledge-owned one-URL handoff ledger. The browser sends only an immutable recommendation ID; server-side admission resolves the canonical URL, applies existing authorization and CSRF boundaries, preserves opaque reconciliation state, and never gives Discovery ownership of sources or capture.

Files changed:
- `drizzle/migrations/0058_add_discovery_knowledge_handoffs.sql`, `drizzle/migrations/0059_retain_discovery_terminal_handoff_outcomes.sql`, schema, and migration journal -- durable owner-bound handoff and safe terminal retry state.
- Knowledge and Discovery domain/database modules -- idempotent ledger lookup, locked review admission, reconciliation, atomic accepted audit, retention-safe lifecycle, and bounded queue reconciliation.
- Discovery contracts, API composition/controller, and admin review client -- exact empty command body, safe closed outcomes, protected Accept transport, Vietnamese feedback, and stale-operation fencing.
- Focused unit and serial integration suites -- contract, ownership, idempotency, migration, retention, API, and UI recovery coverage.

Review findings: Multiple independent adversarial and edge-case passes produced 17 patches. The final independent pass found no actionable findings. The review-driven changes materially strengthened transaction, retention, retry, and UI concurrency behavior, so a future follow-up review is recommended.

Verification:
- Passed `pnpm exec vitest run --project unit tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-review-ui.test.ts tests/knowledge-target-vocabulary-boundary.test.ts` (3 files, 8 tests).
- Passed `pnpm exec vitest run --project integration tests/youtube-discovery-accept.integration.test.ts tests/admin-knowledge-one-url-handoff.integration.test.ts tests/youtube-discovery-review.integration.test.ts tests/admin-youtube-discovery-api.integration.test.ts tests/youtube-discovery-retention.integration.test.ts` (4 files, 27 tests).
- Passed `pnpm lint` with 0 errors and 46 existing warnings, `pnpm typecheck`, `pnpm build`, and `git diff --check`.

Residual risks: The full repository integration suite has unrelated pre-existing failures when invoked through `pnpm test:integration`; all Story 19.4 focused suites pass using direct serial Vitest invocation.
