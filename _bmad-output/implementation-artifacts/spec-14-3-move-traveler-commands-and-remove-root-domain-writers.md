---
title: 'Remove residual root traveler command writers'
type: 'refactor'
created: '2026-08-03'
status: 'done'
baseline_revision: 'f7e1e8108f2201b3e7e1d0aecb88bd4c7ece7829'
review_loop_iteration: 4
followup_review_recommended: true
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/spec-14-2-atomic-traveler-direct-api-cutover.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 14.2 moved the active traveler shell commands and referral capture to admitted Nest APIs, but obsolete root command wrappers and legacy traveler referral helpers remain importable. They preserve a second direct database/Auth.js implementation of migrated traveler state.

**Approach:** Remove only residual root traveler command and referral writers after proving no non-test caller depends on them. Preserve root-admin Auth.js and separate-admin boundaries until their later cutover stories, and retain root modules that still serve non-browser AI or worker responsibilities.

## Boundaries & Constraints

**Always:** Nest remains the only traveler command/referral writer; presentation code uses relative direct APIs and no fallback. Preserve the existing package-owned command transactions, browser-session Origin/CSRF admission, owner isolation, audit/history, deletion, proposal, annotation, feedback, and Nest OAuth referral behavior. Keep root-admin and `apps/admin` behavior unchanged.

**Block If:** A residual root writer has a live non-test traveler or worker caller without an equivalent package/API owner, or removing it would change an established transaction or ownership invariant.

**Never:** Do not add a bridge, compatibility wrapper, duplicate writer, BFF, server action, Next route handler, browser credential, migration, or deployment configuration. Do not remove root Admin/Auth.js, BFF runtime, or separate-admin code reserved for Stories 14.4 and 14.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Migrated traveler command | Browser uses trip, conversation, proposal, annotation, or feedback control | The direct Nest API remains the sole admitted owner | Invalid ownership, Origin, CSRF, stale, or malformed input remains a safe API failure before mutation |
| Referral sign-in | Public `ref` reaches Nest OAuth | Nest transaction-bound referral attribution remains the only traveler referral writer | Invalid, replayed, or self-referral remains rejected without attribution |
| Retained admin path | Root admin signs out through its current layout | Its intentionally retained Auth.js action remains available | No traveler UI imports or invokes the retained action |

</intent-contract>

## Code Map

- `src/features/chat-trips/conversations.ts` -- contains the obsolete root Auth.js/direct-DB conversation deletion wrapper alongside retained read helpers.
- `src/features/chat-trips/trip-projects.ts` -- contains obsolete root trip create/delete wrappers alongside retained non-command helpers.
- `src/features/auth/actions.ts` and `src/features/referrals/attribution.ts` -- contain unused traveler Auth.js sign-in and legacy referral-cookie/direct-write ownership; root-admin sign-out remains intentionally retained.
- `src/features/chat-trips/direct-shell-loader.tsx`, `src/features/ai/direct-api-client.ts`, and `apps/api/src/conversations/traveler-commands.controller.ts` -- canonical direct traveler command path that must remain the only presentation-reachable writer.
- `packages/database/src/traveler-proposal-commands.ts` and `packages/database/src/index.ts` -- existing package-owned command/referral implementations to preserve.
- `tests/api-platform-contract.test.ts`, `tests/api-request-principal.integration.test.ts`, `tests/browser-identity.integration.test.ts`, `tests/ai-ask-direct-api.test.ts`, and targeted legacy-wrapper tests -- direct-owner and cleanup regression coverage.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/chat-trips/conversations.ts`, `src/features/chat-trips/trip-projects.ts`, `src/features/chat-trips/trip-change-proposals.ts`, `src/features/chat-trips/trip-proposal-expiry-worker.ts`, and `src/features/chat-trips/context-extraction.ts` -- removed root traveler mutation exports and transaction entry points; package-owned direct API and worker implementations remain the only writers, while retained root reads are side-effect-free and preserve persisted primary-conversation selection.
- [x] `src/features/auth/actions.ts` and `src/features/referrals/attribution.ts` -- removed dead traveler Auth.js sign-in and legacy referral-cookie/attribution ownership; retained only the root-admin sign-out boundary.
- [x] `packages/worker-domain/src/features/chat-trips/trip-change-proposals.ts` and `tests/` -- restored complete untrusted draft validation and added direct API/browser-session/referral and source-inventory coverage across traveler presentation, workers, and expiry scripts.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- recorded the final one-writer inventory, retained admin boundary, verification evidence, and Story 14.5 retirement handoff.

**Acceptance Criteria:**
- Given a traveler creates/deletes a conversation or trip, applies/dismisses a proposal or annotation action, sends feedback, or signs in via a referral, when the command executes, then the admitted Nest endpoint is the sole reachable writer and no root Next server action, Auth.js principal, or direct database writer remains for that traveler capability.
- Given an invalid owner, expired/stale command, invalid Origin/CSRF, malformed payload, or invalid/replayed referral is supplied, when the direct API processes it, then it preserves the existing safe rejection and leaves no duplicate or partial mutation.
- Given the root admin layout and `apps/admin` remain uncut, when Story 14.3 cleanup runs, then their retained Auth.js/BFF/domain behavior is unchanged and explicitly excluded from the traveler writer inventory.
- Given source inventory runs against traveler presentation and worker entrypoints, when it examines production imports, then no reachable root traveler command/referral writer remains and worker functionality does not depend on deleted root wrappers.

## Design Notes

- The approved Story 14.2 atomic cutover superseded its original deferred command work. This story must not reimplement the direct Nest endpoints or proposal aggregate; it removes every remaining root traveler mutation boundary and may retain a root helper only when it is side-effect-free and has an active non-browser consumer.
- A route handler remains live even without an in-repository caller. Auth.js/BFF route retirement therefore belongs to Story 14.5 unless a deletion is independently safe under the retained root-admin boundary.

## Spec Change Log

### 2026-08-03 - Review repair
- Finding: the initial inventory limited root writer removal to conversation/trip create/delete wrappers and referral code, leaving root plan-item, constraint, primary-conversation, and proposal persistence exports able to bypass the admitted Nest command boundary.
- Amendment: expanded the cleanup to enumerate and remove every root traveler mutation entry point, moving active AI/worker callers only to existing package-owned equivalents; the inventory regression must reject all such entry points rather than named wrappers alone.
- Avoids: declaring one-writer cleanup complete while an importable root direct-DB mutation path survives.
- Keep: preserve root-admin/Auth.js/BFF and `apps/admin` boundaries for Stories 14.4-14.5; retain only genuinely side-effect-free root read helpers with active non-browser callers.

### 2026-08-03 - Follow-up review repair
- Finding: the cleanup omitted the importable root proposal-expiry worker, and the newly read-only summary fallback selected the latest conversation instead of an existing valid persisted primary conversation. Package-owned draft persistence also lacked full proposal-operation validation.
- Amendment: include root expiry exports in the removal inventory, require read projections to prefer a valid stored primary conversation, and retain full package-owned proposal-operation validation before draft persistence.
- Avoids: a surviving root expiry writer, read-model disagreement with direct command state, and invalid AI proposals entering persistence.
- Keep: direct Nest command behavior and package-owned worker execution remain the only traveler mutation owners.

### 2026-08-03 - Final review repair
- Finding: package proposal validation accepted invalid item states, malformed optional item fields, and unsafe/multiline traveler-visible draft text; unknown item references could throw rather than reject. The inventory also omitted the production expiry script.
- Amendment: require complete enum, type, reference, cycle, and safe-text validation before package draft persistence, with safe invalid rejection; inventory the expiry script alongside worker sources.
- Avoids: invalid or unsafe AI proposals persisting after root writer removal and a future root expiry import escaping the inventory.
- Keep: validate with established shared validators and preserve direct API command semantics.

### 2026-08-03 - Final validation review repair
- Finding: visible item fields remained unsafe, remove operations could leave dangling parent/backup references, empty updates persisted no-op proposals, and root context extraction was omitted from the writer inventory.
- Amendment: validate all visible item fields and nonempty updates, model removals before final reference validation, and remove or migrate root context extraction as part of the complete writer inventory.
- Avoids: unsafe visible content, deferred invalid proposal failures, no-op aggregate version changes, and an untracked root direct-DB writer.
- Keep: reject invalid drafts before persistence and retain only package-owned worker mutation paths.

## Review Triage Log

### 2026-08-03 - Review pass
- intent_gap: 0
- bad_spec: 3: (high 2, medium 1)
- patch: 0
- defer: 0
- reject: 1
- addressed_findings:
  - `[high]` `[bad_spec]` Root plan-item/constraint and proposal persistence mutation exports survived the named-wrapper cleanup; expanded the task and inventory to remove all root traveler mutation boundaries.
  - `[medium]` `[bad_spec]` A retained summary helper mutates primary-conversation state; it must be removed or made side-effect-free before any root helper is retained.

### 2026-08-03 - Follow-up review pass
- intent_gap: 0
- bad_spec: 2: (high 1, medium 1)
- patch: 1: (medium 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[bad_spec]` Root proposal-expiry exports were omitted from the writer inventory; expanded cleanup to remove them.
  - `[medium]` `[bad_spec]` Package-owned proposal drafting lacked full operation validation after root persistence removal; require package validation before persistence.
  - `[medium]` `[patch]` Root read summary selected latest instead of its valid persisted primary conversation; restore read-only persisted-primary preference.

### 2026-08-03 - Final review pass
- intent_gap: 0
- bad_spec: 1: (medium 1)
- patch: 4: (medium 3, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[bad_spec]` Package persistence validation did not preserve the root draft-validation contract; expanded the validation task to cover enums, types, references, cycles, and safe visible text.
  - `[medium]` `[patch]` Reject invalid states, malformed optional fields, unknown references, and unsafe rationale/alternatives before persistence.
  - `[low]` `[patch]` Include the production expiry script in root-writer inventory coverage.

### 2026-08-03 - Final validation review pass
- intent_gap: 0
- bad_spec: 1: (medium 1)
- patch: 3: (medium 3)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[bad_spec]` Root context extraction was omitted from the inventory; expanded cleanup to remove or migrate the root context writer.
  - `[medium]` `[patch]` Validate all traveler-visible item fields and reject empty update operations.
  - `[medium]` `[patch]` Model removals before validating parent and backup references.

### 2026-08-03 - Bounded final review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (medium 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Exclude elapsed pending proposals from root read projections without restoring expire-on-read mutation.
  - `[medium]` `[patch]` Reject draft operations that target an item removed by an earlier operation.

### 2026-08-03 - Closing review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (medium 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Require dependent reference cleanup before an item removal can validate.
  - `[medium]` `[patch]` Exclude elapsed pending proposals from direct owner-review reads as well as workspace lists.

### 2026-08-03 - Final closure review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (medium 1)
- defer: 1: (medium 1)
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Add accepted create-item records to the ordered validation projection before subsequent removals and final reference checks.
  - `[medium]` `[defer]` The pre-existing package shell loader expires proposals during a read; defer its package read-path refactor because it predates this root-writer cleanup and no matching package file changed in this story.

## Auto Run Result

Status: done

### Summary

- Removed all root traveler direct-database/Auth.js command, referral, proposal persistence, expiry, and context-extraction writers. The admitted Nest APIs and package-owned worker paths are now the only traveler mutation owners.
- Preserved root-admin Auth.js sign-out, root Auth.js/BFF runtime, and `apps/admin` for Stories 14.4-14.5.
- Restored strict package proposal-draft validation, including safe visible text, runtime types, enums, ordered reference cleanup/removal, and cycle checks.

### Verification

- Passed serial focused integration coverage: direct API admission, browser identity/referrals, root-writer inventory, trip project/proposal, and expiry-worker suites (up to 90 tests across seven files).
- Passed `pnpm lint` with zero errors and five existing unrelated warnings in legacy test files.
- Passed `pnpm typecheck`, `pnpm build`, and `git diff --check` during the review cycle.
- Full wrapper suites remain unsuitable as focused commands: `pnpm test:unit` has two unrelated `traveler-ui-foundation` token expectation failures, and `pnpm test:integration` runs unrelated serial suites with existing contention/failures.

### Residual Risk

- Deferred: `packages/database/src/index.ts` still terminalizes elapsed proposals while loading the direct Nest traveler shell. This pre-existing package read-path mutation is recorded in `deferred-work.md`; it was not expanded into this root-writer cleanup.
- A follow-up review is recommended because the bounded repair cycle materially hardened shared package proposal validation and moved multiple writer boundaries.

## Verification

**Commands:**
- `pnpm exec vitest run tests/api-platform-contract.test.ts tests/ai-ask-direct-api.test.ts` -- expected: strict direct client/API command contracts and no legacy fallback pass.
- `pnpm exec vitest run tests/api-request-principal.integration.test.ts tests/browser-identity.integration.test.ts` -- expected: serial browser-session command/referral authorization and ownership behavior passes.
- `pnpm typecheck` -- expected: all workspace strict typechecks pass.
- `pnpm lint` -- expected: no new errors.
- `pnpm build` -- expected: production builds pass.
- `git diff --check` -- expected: no whitespace errors.
