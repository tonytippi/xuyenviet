---
title: 'Story 3.10: Propagate Source Removal and State Changes to Search Eligibility'
type: 'feature'
created: '2026-07-23'
status: 'done'
baseline_revision: '01fcf82'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '01fcf82'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-9-operate-the-ai-recommended-review-and-sampling-queue.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** A source can be retained or its evidence can become ineligible, but Knowledge has no source-withdrawal command that atomically propagates that fact to dependent evidence, cards, and active search projections. A stale projection must never keep withdrawn or otherwise unsafe facts available to travelers.

**Approach:** Represent source eligibility/removal durably and add a retryable Knowledge-owned removal command. It serializes against capture and ingestion work, removes traveler evidence, re-evaluates each affected card, records only safe operational history, marks versions dirty, and disables ineligible projections in the committing transaction.

## Boundaries & Constraints

**Always:** Serialize source removal with the established source advisory lock; retain source/capture foreign-key provenance while tombstoning private payloads; increment `evidence_set_revision` for removed evidence and `content_version` for material card changes; audit and write a versioned dirty marker atomically for every changed card; recheck source eligibility in pipeline publication and traveler retrieval; fail closed for conflicts, failed verification, missing support, and source removal.

**Block If:** The existing source/capture and card/evidence model cannot express a source becoming ineligible without deleting provenance, or the command cannot atomically commit source state, dependent evidence/card changes, audit entries, dirty markers, and active-projection disablement.

**Never:** Do not delete sources or raw operational history ahead of dependency propagation; do not expose raw captures, evidence quotes, PII, provider/browser data, or internal removal details in action results, redirects, audits, or UI; do not rely solely on timestamp triggers or asynchronous indexing for safety; do not implement the Epic 4.2 dirty-marker consumer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Source withdrawal | Eligible source with dependent active evidence/cards | Source becomes ineligible; linked evidence becomes removed; cards re-evaluate, increment applicable versions, audit/mark dirty, and disable ineligible projections atomically | Repeated command returns completed without duplicate mutations |
| Remaining support | A card has valid evidence from another eligible source | Only removed-source evidence is retired; card stays eligible only if current state and remaining independent support meet policy | Never reactivate conflicted, failed-verification, archived, or superseded cards |
| Pipeline race | Claimed ingestion job finishes while source removal commits | Source lock establishes ordering; publication rechecks source eligibility and cannot attach or activate removed-source evidence | Fenced worker terminates safely without restoring removed state |
| Index lag | Active document survives a failed owner/evidence eligibility check | Traveler retrieval excludes the card and disables stale document | No stale source content is returned |

</intent-contract>

## Code Map

- `src/db/schema.ts` and generated `drizzle/migrations/0047_*.sql` -- add source eligibility/removal state and safe metadata needed for idempotent propagation.
- `src/features/knowledge/source-removal.ts` -- own serialized source-removal, evidence/card re-evaluation, safe audits, dirty markers, and projection disablement.
- `src/features/knowledge/source-captures.ts` -- reject new capture versions for ineligible sources and align payload retention with completed removals.
- `src/features/knowledge/ingestion-pipeline.ts` -- recheck current source eligibility inside fenced terminal mutations before publication or evidence attachment.
- `src/features/knowledge/search.ts` and `state.ts` -- require currently eligible sources/captures for retrieval and current-card eligibility.
- `src/features/knowledge/actions.ts` and admin knowledge source surface -- expose a server-authorized Vietnamese operator removal form with safe status feedback.
- `tests/knowledge-source-removal.test.ts`, `tests/knowledge-search.test.ts`, `tests/knowledge-source-capture-retention.test.ts`, and `tests/knowledge-ingestion-pipeline.test.ts` -- cover propagation, safety, idempotency, and races.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts`, generated migration, journal, and snapshot -- persist bounded source eligibility/removal reason, actor, and completion state while preserving source provenance and indexed lookup.
- [x] `src/features/knowledge/source-removal.ts` -- implement the retryable, source-lock-first command that retires linked evidence, recomputes safe card state from remaining eligible evidence, supersedes stale recommendations, increments versions, audits/marks dirty, disables projections, and tombstones removable payloads without raw-data leakage.
- [x] `src/features/knowledge/source-captures.ts` and `src/features/knowledge/ingestion-pipeline.ts` -- prevent captures and fenced terminal publication from restoring removed-source eligibility; keep retention idempotent and compatible with the command.
- [x] `src/features/knowledge/state.ts` and `src/features/knowledge/search.ts` -- make source eligibility a current owner-row retrieval condition and preserve stale-document disablement.
- [x] `src/features/knowledge/actions.ts` and `src/app/admin/knowledge/*` -- add protected, Vietnamese-first source removal controls and safe completed/already-completed feedback.
- [x] `tests/knowledge-source-removal.test.ts` and related knowledge tests -- prove source reasons, one/multi-source support, downgrade/suppression, idempotency, concurrent publication/resolution safety, retention, privacy, and immediate retrieval exclusion.

**Acceptance Criteria:**
- Given Knowledge changes publication, knowledge, review, verification, evidence, or source eligibility, when its owning command commits, then it atomically updates the card state, applicable version, safe audit, and dirty marker; suppression, archival, superseding, high-risk conflict, and source withdrawal disable active projection in that transaction.
- Given a source is withdrawn, inaccessible, or removed, when its retryable command runs, then it locks dependent evidence/cards, removes traveler evidence, re-evaluates remaining support, downgrades or suppresses cards before hiding payloads, and resumes harmlessly after retry.
- Given indexing lags a source/state mutation, when retrieval occurs, then it rechecks current owner, source, capture, and evidence eligibility, excludes ineligible cards, and disables stale projections without returning private material.

## Design Notes

The source is retained as a provenance tombstone rather than deleted because capture, evidence, and card-source foreign keys are deliberately restrictive. The command takes the existing source advisory lock before source/card/evidence row locks, which aligns it with capture retention and prevents a fenced ingestion worker from publishing after removal. Removal is a safety downgrade only: remaining evidence can preserve an already eligible card, but cannot resolve conflicts, failed verification, or archival/supersession.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: one forward-only migration for Story 3.10 schema changes.
- `pnpm test:run tests/knowledge-source-removal.test.ts tests/knowledge-source-capture-retention.test.ts tests/knowledge-ingestion-pipeline.test.ts tests/knowledge-recommendation-queue.test.ts tests/knowledge-search.test.ts` -- expected: propagation, race, privacy, and retrieval safety pass.
- `pnpm lint` -- expected: success.
- `pnpm typecheck` -- expected: success.
- `pnpm build` -- expected: success.

## Review Triage Log

### 2026-07-23 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 1, medium 3)
- defer: 1 (medium 1)
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Corrected migration journal ordering so an environment already migrated through 0046 applies source eligibility migration 0047.
  - `[medium]` `[patch]` Included linked cards without active evidence, downgraded under-supported community patterns, and serialized stale recommendation supersession during removal.
  - `[medium]` `[patch]` Bound legacy extraction, suggestion, and draft-approval mutations to source eligibility and capture availability, preventing removed-source drafts from being persisted or reactivated.
  - `[medium]` `[defer]` Provider dispatch can still receive a capture already loaded before concurrent removal; durable final publication/attachment/retrieval remains fail-closed. A lease-based coordination design is recorded in `deferred-work.md` because holding the transaction advisory lock across provider calls deadlocks established recapture/fencing paths.

## Auto Run Result

Status: done

Implemented a durable, retryable source-removal command for Knowledge. It records source withdrawal, retires dependent traveler evidence, re-evaluates affected cards, downgrades unsupported patterns, writes safe audit and dirty-marker history, disables active projections, and tombstones source payloads only after propagation.

Source eligibility is enforced in capture intake, fenced ingestion publication, legacy extraction/suggestion paths, draft approval, indexing, and retrieval. The protected Vietnamese Knowledge Intake action reports safe completion state without exposing source payload data.

Verification passed: `pnpm db:generate`, focused Knowledge integration tests (88 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.

No commit was created because it was not requested. `final_revision` records the unchanged repository HEAD; implementation changes remain in the working tree.
