# Story 21.7: Verify Fresh External Facts Through Replayable Web Scope

Status: backlog

## Story

As a traveler, I want changing external information checked for the exact place, route, and time, so that unrelated or old warnings are not presented as live route authority.

## Acceptance Criteria

**Given** a required need is missing, freshness-sensitive, conflicted, or explicitly requests current verification
**When** web fallback is permitted
**Then** Retrieval persists an immutable minimized query-plan manifest with exact requirement keys, allowed canonical scope terms, excluded private-context classes, policy versions, and request digest before Search is called
**And** private Trip notes, child details, budget, or preferences are not sent unless the exact requirement permits that value.

**Given** Search returns a result containing multiple facts or geographic references
**When** fact extraction and scope resolution run
**Then** immutable fact-level assertions pin capture payload, text digest, parser/segmentation, registry, and resolver versions, and one query-specific decision binds the exact assertion to one requirement/leg
**And** mismatched, ambiguous, or unknown scope cannot satisfy coverage or become a factual premise.

**Given** a recent warning describes an earlier closure or the provider fails
**When** the traveler answer is rendered
**Then** the warning retains source, applicable place/time, unverified status, and practical verification action without being described as live closure, traffic, navigation, or guaranteed safety
**And** provider failure preserves the gap and returns bounded useful recovery rather than fail-open certainty.

**Given** the same capture is replayed or a query/parser/resolver dependency changes
**When** projection identity is evaluated
**Then** unchanged dependencies reproduce the same decision while changed dependencies create a new immutable projection
**And** `WS-01` through `WS-07`, FR-35, FR-65, SC-11, and AC-32 pass with complete query-to-fact-to-render provenance.

## Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, add one forward migration for immutable web query-plan manifests, captures, fact assertions, scope projections, query-specific decisions, and their run/requirement/leg/version fences; export Retrieval/Search transaction-aware owner ports from `packages/database/src/web-evidence-scope.ts` and `packages/database/src/index.ts` (AC: 1-4).
- [ ] In `packages/database/src/web-search.ts`, replace whole-question admission with a bounded request built only from Story 21.6 requirement keys and Story 21.5 canonical allowed scope terms; persist the minimized manifest before the provider call and exclude private context unless the exact requirement policy permits it (AC: 1).
- [ ] In `packages/database/src/web-evidence-scope.ts`, segment each captured result into immutable assertions, pin payload/text/parser/segmentation/registry/resolver identities, and persist one exact assertion-to-requirement/leg decision whose replay identity changes whenever a dependency changes (AC: 2, 4).
- [ ] In `packages/database/src/source-bundle.ts` and `packages/database/src/provenance.ts`, admit only applicable exact/reviewed web decisions as contributions, preserve mismatched/ambiguous/unknown results as gaps or verification leads, and render source/place/time/unverified/action fields without live-authority wording (AC: 2-4).
- [ ] In `packages/database/src/web-evidence-scope.ts`, expose immutable prepared decision/contribution rows and transaction-aware sealing ports for Story 21.8. Do not require `finalizeAiAnswer(...)` to exist yet and do not add a second terminalizer; the current AI Ask path may consume the prepared projection until Story 21.8 composes owner ports atomically (AC: 2-4).
- [ ] In `tests/web-evidence-scope.test.ts`, `tests/web-search-adapter.test.ts`, and `tests/web-search-quality.test.ts`, add DB-free minimization/privacy, ordering, exact-scope, replay, prior-warning, provider-failure, and `WS-01` through `WS-07` coverage; in `tests/web-evidence-scope.integration.test.ts`, add serial PostgreSQL query-to-capture-to-assertion-to-decision-to-contribution-to-render provenance and immutable dependency-change coverage with local `resetTestDatabase()` setup (AC: 1-4).

### Verification

- `pnpm test:unit -- tests/web-evidence-scope.test.ts tests/web-search-adapter.test.ts tests/web-search-quality.test.ts`
- `pnpm test:integration -- tests/web-evidence-scope.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

### Block If

- Stories 21.5 and 21.6 are not complete or their pinned route/scope resolution and immutable requirement-key contracts are unavailable.

## Dev Notes

- Available private context is not authorization. Never send notes, child details, budgets, or preferences unless explicitly permitted by the exact key.
- A warning retains source/place/time, unverified status, and verification action; it must never become live closure, traffic, navigation, or guaranteed-safety authority.
- Retrieval owns decisions; AI Orchestration owns prompt-render/provenance. Add no endpoint, service, worker loop, or runtime configuration authority.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-35-and-AD-36]
- [Source: packages/database/src/web-search.ts]
- [Source: tests/web-search-quality.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Web-Evidence-Scope]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Web-Scope-And-Freshness]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.7` is normative. Guide AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
