---
title: 'Story 3.3: Backfill Bounded Evidence and Verify Legacy Retrieval Safety'
type: 'feature'
created: '2026-07-22'
status: 'done'
baseline_revision: 'bb04906'
final_revision: 'cc6d7a5'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 3.1 intentionally makes every migrated knowledge card ineligible because the product lacks immutable, bounded evidence. Story 3.2 provides immutable source capture versions, but historical source links still cannot prove an exact safe evidence span or retrieval readiness.

**Approach:** Introduce source-versioned evidence and a conservative legacy backfill. Only cards whose existing support can be represented with an exact safe bounded span and complete retrieval metadata become eligible; all other legacy material remains fail-closed with concise, non-sensitive reporting.

## Boundaries & Constraints

**Always:** Own evidence in Knowledge through server-only, typed Drizzle paths. Evidence must reference an exact immutable source capture version, preserve source identity, bounded quote/span, observation/capture time, conditions, support level, display policy, state, and a deterministic independence key. Recheck current card, evidence, source, and capture eligibility in indexing/search/read paths; SQL candidate scans stay bounded. Traveler contracts must expose no raw capture text, metadata, file/storage references, provider data, audit details, or operator-only quote/link. Existing and future legacy approval paths remain ineligible without valid active evidence.

**Block If:** The required migration cannot distinguish a safe exact source-version span from fabricated/ambiguous support, required legacy source/version data is unavailable, or a policy decision is required to promote material without validated evidence.

**Never:** Do not infer a quote from title/summary, use mutable `raw_source_material` as evidence, promote draft/rejected/duplicate/ambiguous legacy records, make Facebook evidence traveler-visible, or implement ingestion jobs, judging thresholds, relation/conflict workflows, review recommendations, or source removal policy from later stories.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Safe legacy backfill | Eligible active card, readable current capture, exact safe span, complete locator | One active supporting evidence row tied to its source/version; card can be indexed/retrieved safely | No raw payload in reports or read models |
| Incomplete/ambiguous legacy support | Missing/tombstoned capture, no exact span, unsafe text, invalid state, or missing locator | No active evidence; card remains/reverts ineligible and stale active projection is disabled | Concise reason-count report only |
| Stale evidence after backfill | Evidence becomes inactive/removed, source/version mismatches, or capture is tombstoned | Retrieval and indexing reject it and disable stale projection where applicable | Fail closed without exposing details |
| Operator-only source | Facebook capture/evidence | Card fact may use safe policy only; quote/link/raw content remain hidden | Default to operator-only/fact-only display policy |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Knowledge tables, enums, same-source constraints, and current card/source state types.
- `drizzle/migrations/0040_*.sql` and `drizzle/migrations/meta/*` -- forward-only evidence schema, conservative data backfill, report, and stale-projection disablement.
- `src/features/knowledge/state.ts` -- canonical fail-closed traveler eligibility predicate.
- `src/features/knowledge/search.ts` -- authoritative owner/evidence recheck and traveler-safe search result projection.
- `src/features/knowledge/indexing-worker.ts` -- bounded evidence-aware indexing/backfill selection and stale document disablement.
- `src/features/knowledge/review.ts` -- operator index status must recognize evidence-backed versus evidence-pending cards.
- `src/features/knowledge/batch-intake.ts` -- seed progress must count only evidence-grounded cards.
- `src/features/retrieval/approved-knowledge.ts` and `src/features/retrieval/source-bundle.ts` -- preserve safe retrieval/source-bundle boundary.
- `tests/helpers/source-captures.ts` -- reusable source-version/evidence fixtures.
- `tests/knowledge-*.test.ts` and `tests/answer-context.test.ts` -- migration, eligibility, search/index, seed, and privacy behavior coverage.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and generated `drizzle/migrations/0040_*.sql` -- add constrained `knowledge_card_evidence` and concise evidence-backfill reporting, source/version same-source integrity, active lookup/indexing constraints, and a forward-only safe migration/backfill -- establishes auditable bounded evidence without rewriting historical migrations.
- [x] `src/features/knowledge/state.ts` -- replace unconditional ineligibility with an evidence-aware, fail-closed predicate requiring active eligible state, complete location/route metadata, and valid active supporting evidence -- prevents legacy lifecycle state from bypassing evidence.
- [x] `src/features/knowledge/search.ts`, `src/features/knowledge/indexing-worker.ts`, `src/features/knowledge/review.ts`, and `src/features/knowledge/batch-intake.ts` -- load and recheck evidence/source/capture state, retain database-side bounded candidate selection, disable stale projections, and keep operator/seed status accurate -- makes every current consumer enforce the same retrieval boundary.
- [x] `src/features/retrieval/approved-knowledge.ts` and `src/features/retrieval/source-bundle.ts` -- existing safe result contract required no code change; traveler bundles receive only the safe search projection.
- [x] `tests/helpers/source-captures.ts`, `tests/knowledge-state-migration.test.ts`, `tests/knowledge-search.test.ts`, `tests/knowledge-approved-cards.test.ts`, `tests/knowledge-batch-source-intake.test.ts`, and `tests/answer-context.test.ts` -- add fixtures and cover valid evidence, invalid/ambiguous support, stale projections, seed counting, and no raw leakage.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- moved Story 3.3 through implementation/review/done after final verification.

**Acceptance Criteria:**
- Given a legacy card has safely representable source support, when the evidence backfill runs, then it creates bounded `knowledge_card_evidence` linked to the exact source/capture version with timestamp, conditions, support/display/evidence states, and deterministic independence key; traveler reads remain free of raw/operator-only/provider data.
- Given a legacy card lacks valid active evidence or required retrieval metadata, when backfill or later indexing/search runs, then it stays ineligible, any stale active projection is disabled, and a concise reason is reported without promotion of draft, rejected, or ambiguous material.

### Review Findings

- [x] [Review][Patch] Fail closed for required verification and unreviewed cards [src/features/knowledge/state.ts:18]
- [x] [Review][Patch] Refresh active projections when evidence or source privacy changes [src/features/knowledge/indexing-worker.ts:79]
- [x] [Review][Patch] Bound AI Ask candidate-count scans and memory accumulation [src/features/knowledge/search.ts:131]
- [x] [Review][Patch] Use PostgreSQL-compatible character offsets for evidence spans [tests/helpers/source-captures.ts:47]

## Spec Change Log

## Review Triage Log

### 2026-07-22 — Review passes
- intent_gap: 0
- bad_spec: 0
- patch: 11 (high 3, medium 8, low 0)
- defer: 1 (medium 1)
- reject: 2 (high 1, medium 1)
- addressed_findings:
  - `[high] [patch]` Bound evidence to its card/source link, retain only evidence-backed traveler citations, and fail closed for conflicted or failed-verification cards.
  - `[medium] [patch]` Repair evidence fields in seed/index status, prevent current-document reindex starvation, redact every operator-only source URL, and exclude private/unvalidated URLs from lexical documents.
   - `[medium] [defer]` Evidence/state mutation dirty markers belong to Story 3.10's atomic projection contract.

### 2026-07-22 — Follow-up code review fixes
- Made traveler eligibility fail closed unless the card is reviewed and verification is either not required or corroborated.
- Added forward-only evidence/source/capture dirty-marker triggers so active search projections reindex after privacy-relevant mutations; `0042_fix_source_touch_trigger.sql` corrects the trigger function for databases that applied the initial migration.
- Capped candidate-count search scans at `maxSearchCandidateDocuments` for AI Ask.
- Derived fixture evidence spans with Unicode character counts, matching PostgreSQL `char_length` and `substring` semantics.

## Design Notes

Backfill is intentionally conservative: a matching source link alone is not evidence. A legacy fact becomes eligible only when the migration can validate a bounded span against immutable capture text and all current retrieval gates. `fact_only` may support traveler-safe card facts without revealing a quote; Facebook remains operator-only.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: generated migration/snapshot is reviewed and extended only forward.
- `pnpm test:run tests/knowledge-state-migration.test.ts tests/knowledge-search.test.ts tests/knowledge-approved-cards.test.ts tests/knowledge-batch-source-intake.test.ts tests/answer-context.test.ts` -- expected: evidence-backed eligibility works and invalid legacy paths fail closed.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: production build passes.

## Dev Agent Record

### Completion Notes

- Added `knowledge_card_evidence` with an immutable capture-version pointer, exact quote/span, observed/captured timestamps, conditions, support and display policy, evidence state, and deterministic source/version independence key.
- The `0040_medical_hercules.sql` migration is forward-only. It records concise ambiguity counts for legacy support rather than inventing evidence from card title or summary, and disables projections without exact active evidence.
- Search, indexing, operator index status, and seed progress require an active primary/supporting evidence row whose quote exactly matches the persisted immutable capture and whose payload is not tombstoned. Invalid, removed, or incomplete evidence disables projections or remains pending.
- Traveler results do not expose evidence quote/span, raw capture payload/metadata, storage fields, or Facebook links. Existing source-bundle code consumes that safe projection unchanged.
- Review hardening filters citations and lexical content to valid evidence-backed sources, redacts operator-only URLs, and preserves immutable historical capture provenance after recapture.
- Legacy links lack validated fact-specific spans, so migration reports ambiguity and does not fabricate evidence.

### Verification

- `pnpm db:generate` -- passed; generated `0040_medical_hercules.sql` and its snapshot/journal entry.
- `pnpm test:run tests/knowledge-state-migration.test.ts tests/knowledge-search.test.ts tests/knowledge-approved-cards.test.ts tests/knowledge-batch-source-intake.test.ts tests/answer-context.test.ts` -- passed, 90 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.
- Follow-up code review verification: `pnpm test:run tests/knowledge-state-migration.test.ts tests/knowledge-search.test.ts tests/knowledge-approved-cards.test.ts tests/knowledge-batch-source-intake.test.ts tests/answer-context.test.ts` -- passed, 94 tests.
- Follow-up code review verification: `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` -- passed.

### File List

- `_bmad-output/implementation-artifacts/spec-3-3-backfill-bounded-evidence-and-verify-legacy-retrieval-safety.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0040_medical_hercules.sql`
- `drizzle/migrations/meta/0040_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema.ts`
- `src/features/knowledge/batch-intake.ts`
- `src/features/knowledge/indexing-worker.ts`
- `src/features/knowledge/review.ts`
- `src/features/knowledge/search.ts`
- `src/features/knowledge/state.ts`
- `tests/answer-context.test.ts`
- `tests/helpers/source-captures.ts`
- `tests/knowledge-search.test.ts`
- `tests/knowledge-state-migration.test.ts`

## Auto Run Result

Status: done

Summary: Added bounded immutable evidence and fail-closed retrieval safety for AI-first knowledge.

Residual risk: Future evidence state/display-policy mutations need the Story 3.10 atomic dirty-marker contract to refresh already-indexed lexical documents.
