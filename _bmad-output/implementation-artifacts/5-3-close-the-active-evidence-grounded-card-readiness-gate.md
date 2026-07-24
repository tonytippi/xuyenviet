---
baseline_commit: edbf1db496a4d32107fc663e3bb029ee9a5ca050
---

# Story 5.3: Close the Active Evidence-Grounded Card Readiness Gate

Status: done

## Story

As a product owner,
I want public evaluation to require active, evidence-grounded knowledge rather than historical approvals,
so that the 100-card readiness target represents traveler-usable coverage.

## Acceptance Criteria

1. **Given** the Hanoi-to-HCMC corpus is evaluated for readiness, **when** the active-card target is calculated, **then** it requires at least 100 cards that are active, have code-valid current evidence, and satisfy complete retrieval metadata, **and** suppressed, archived, superseded, evidence-invalid, or incomplete records do not count.
2. **Given** quality sampling and evaluation results exist for the corpus, **when** readiness is reported, **then** every sampled active card must have validated evidence and no high-severity publication-policy failure, **and** unresolved verification, cohort, taxonomy, route, or quality gaps are explicitly listed.
3. **Given** the target or safety evidence is incomplete, **when** public-MVP evaluation is requested, **then** the report blocks a readiness claim and identifies the remaining active-card/sample/coverage gap, **and** it does not substitute approved-card counts for AI-first eligibility.

## Tasks / Subtasks

- [x] Extend the Feedback/Eval-owned public-MVP readiness read model (AC: 1-3)
  - [x] Update `src/features/feedback/quality-dashboard.ts` so `getPublicMvpQualityDashboard()` obtains an unfiltered, current-corpus coverage aggregate from the Knowledge-owned entrypoint before building readiness.
  - [x] Extend `PublicMvpQualityDashboard["readiness"]` and `buildReadiness()` additively. Preserve the existing usefulness-feedback, magic-moment-score, and generic-answer checks; add active-evidence corpus, sampling/evidence, high-severity cohort, verification, and coverage-gap checks.
  - [x] Keep filtered `promptType`/`range` semantics for evaluation and feedback display only. Corpus readiness, current sampling policy state, and active-card eligibility must use the full current corpus and cannot be made healthy by filtering the dashboard.
  - [x] Fail closed: unavailable, pending, unselected where a policy requires selection, truncated, stale-version, or incomplete corpus/sampling/quality inputs must return `not_ready` with a safe explicit gap message. Do not treat an absence of rows as a pass.
  - [x] Use persisted evaluation policy snapshots/results for historical evaluation evidence; do not parse answer prose or reconstruct answer-time policy facts from mutable cards. The readiness evidence set is the newest `publicMvpEvaluationRuns.status = "completed"` run for the current `publicMvpEvaluationPromptSetVersion` that contains all six current scenario/version pairs: `community_observation:v1`, `independent_community_pattern:v1`, `conditional_high_risk_claim:v1`, `conflict_exclusion:v1`, `source_withdrawal:v1`, and `web_fallback_unavailable:v1`. Each result must be `scored`, have its policy snapshot, match the current scenario's canonical prompt type/version, and retain exactly one score for each of the six current rubric dimensions. A run is one coherent model evidence set, so select its persisted results together rather than mixing models/runs. If no qualifying complete run exists, readiness blocks; a newer qualifying run replaces an older run for gate calculation while all historic runs remain auditable.
  - [x] Apply this explicit severity contract: `staleWithdrawnSourceExposure`, `rawEvidenceLeakage`, or `conflictedKnowledgeExcluded = false` is a high-severity publication-policy failure and blocks readiness. `unsupportedCommunityWording`, `requiredCaveatOmitted`, `unsupportedClaim`, or `fallbackVerificationGuidanceMet = false` is an explicit quality gap; it remains listed and is governed by the existing baseline quality checks, but is not represented as fabricated persisted severity. Missing required snapshot/result or incomplete scenario/model evidence blocks readiness.

- [x] Reuse and narrowly expose Knowledge-owned active-evidence corridor coverage (AC: 1, 2)
  - [x] Extend `src/features/knowledge/batch-intake.ts` only as needed for a safe, aggregate readiness input. Reuse `getActiveEvidenceGroundedSeedCoverage()` and its existing active-card predicate rather than reproducing evidence eligibility in Feedback.
  - [x] Preserve the predicate: current `publicationState = "active"`, Hanoi-to-HCMC corridor signal, code-valid active evidence with eligible source/capture/span, complete retrieval fields, and `evaluateKnowledgeTravelerPolicy()` outcome `contextual_use`.
  - [x] Do not count legacy `status = "approved"`, caveat-only high-risk cards, failed verification, uncertain/conflicted/superseded cards, incomplete cards, stale/withdrawn/removed evidence, tombstoned captures, source-ineligible records, or under-supported community patterns.
  - [x] Add only safe aggregate gap fields needed by the combined gate, such as zero-count taxonomy/route buckets and current unresolved review/verification work. Zero-count taxonomy and route/location buckets are required remediation diagnostics, not independent readiness blockers: the PRD defines no per-bucket threshold. If the dashboard needs test DB injection, use a narrow optional/internal helper while retaining the public admin-only `requireAdminSession()` boundary.
  - [x] Keep Knowledge as owner of card/evidence/recommendation/policy mutations. The readiness path is read-only and must not publish, suppress, repair projections, create recommendations, or alter sampling cohorts.

- [x] Apply current version-fenced sampling and high-severity policy semantics to readiness (AC: 2, 3)
  - [x] Add the demonstrated missing immutable sampling facts through a minimal forward-only Drizzle migration: each `knowledge_sampling_cohort_members` row must persist its corridor classification (`corridor_bucket` or explicit `outside_corridor`) and `selected_for_sampling` at the same card/version/evidence fence. Add a policy-window candidate ledger keyed by the terminal ingestion job/outcome plus the complete card/version/evidence fence. In the existing Knowledge pipeline transaction that commits an `auto-active` terminal outcome, call the Knowledge-owned sampling enrollment helper under the policy-boundary lock; it must append exactly one ledger/member row and compute `selected_for_sampling` with `shouldSampleKnowledgeCard()`. This is an event-time transaction step, not a new background job or dashboard mutation. Add a sealed auto-active enrollment proof on the policy/window: candidate count, selected count, deterministic digest of the sorted complete ledger/member fences plus their corridor/selection facts, and completion timestamp. After `windowEndsAt`, an existing operator-invoked Knowledge sampling-maintenance entrypoint may seal only that closed window under the same lock; it must enumerate the immutable ledger, verify one member per candidate, then atomically write the proof. The readiness gate remains read-only and blocks every unsealed active/closed window. It must recompute and match the count, selected count, and digest before it treats the cohort as complete; a missing, partial, mismatched, or unsealed proof blocks rather than inferring completeness from rows that happen to exist. Backfill only when historic classification, selection, and complete enrollment can be proven; otherwise retain null/unknown and fail the readiness gate rather than guessing. Do not alter historical migrations.
  - [x] Scope the sampling gate to cohort members persisted as Hanoi-to-HCMC at their member fence, including a card later suppressed, escalated, or moved to a different route/location. A policy outside the corridor does not block this corpus; a mixed cohort contributes only its persisted corridor members. Unknown/missing persisted classification for a potentially applicable member is incomplete evidence and blocks readiness.
  - [x] Reuse Story 5.2's complete sampling fence: `(policyId, knowledgeCardId, contentVersion, evidenceSetRevision)`. A prior pass must never certify a later card/evidence version.
  - [x] Join only `reason = "sampling"` when determining sampling dispositions. Keep verification recommendations separate: they must not turn an auto-active cohort member into sampled, pending, passed, or failed. Add an immutable `verify_first` obligation ledger keyed by terminal ingestion job/outcome plus complete card/version/evidence fence. In the same Knowledge pipeline transaction that commits a `verify_first` terminal outcome, append exactly one obligation and exactly one version-fenced `reason = "sampling"` recommendation with a persisted required-selection marker and policy ID; it is not an auto-active cohort member. The gate must enumerate this ledger, not mutable current cards or extant recommendation rows, to prove 100% version-fenced `verify_first` sampling: every obligation has exactly one required sampling recommendation and each has current validated evidence plus a deterministic resolved pass/fail disposition. Missing, duplicate/ambiguous, pending, stale-fence, or unavailable obligation/recommendation/disposition proof blocks readiness. Do not substitute a verification recommendation or mutable current card state for this sampling proof.
  - [x] Resolve duplicate historical sampling rows deterministically using the established ordered `selectDistinctOn` approach. Distinguish `sampling_passed`, `sampling_failed`, selected-but-pending, and unselected membership.
  - [x] Treat `knowledgeSamplingPolicies.escalatedAt` and `.suppressedAt` as durable high-severity cohort evidence for any corridor member recorded at the version fence, even after that card becomes suppressed or changes version. Do not claim that every card or evaluation result has a persisted severity when it does not.
  - [x] Define population completeness from persisted enrollment proof and membership, not inference: for every closed policy window, the sealed candidate denominator/digest must match the immutable auto-active candidate ledger and complete version-fenced membership set, and every recorded auto-active candidate must have exactly one membership and persisted deterministic selection flag. Every `selected_for_sampling = true` corridor member must have current validated evidence and a passing resolved sampling disposition; unresolved/pending, missing, duplicate/ambiguous, mismatched enrollment proof, or bounded/truncated membership/selection/disposition evidence blocks the claim. A policy with a sealed zero-candidate population or zero persisted corridor candidates is reported as zero-applicable, not a pass for missing data. `verify_first` remains a separate verification/review signal and has its own complete immutable obligation ledger plus required 100% sampling proof.
  - [x] Use complete SQL aggregates for pass/fail decisions across all applicable policies and cohort members; the Story 5.2 `limit + 1` bounded diagnostics remain presentation-only and cannot determine readiness.

- [x] Render the combined gate in the existing Vietnamese operator dashboard (AC: 1-3)
  - [x] Update `src/app/admin/quality/page.tsx` only. Render the expanded structured readiness checks in the current "Readiness public MVP" panel and top metric; preserve the current filters, counter metrics, Story 5.2 policy section, and recent diagnostics.
  - [x] Clearly state in Vietnamese that readiness is blocked for fewer than 100 active evidence-grounded cards, incomplete safety evidence, failed/pending sampling, suppressed/escalated corridor cohorts, unresolved verification, and high-severity evaluation failures. List current type/route and non-high-severity quality gaps as remediation diagnostics without claiming a per-bucket threshold that the PRD does not define.
  - [x] Revise the Story 5.2 wording that missing policy data does not change readiness: the filtered evaluation display remains filtered, but incomplete corpus-wide safety evidence must now block the readiness claim.
  - [x] Keep the surface read-only, role-gated, responsive, keyboard-readable, and color-independent. Use existing admin visual language and text labels; no inert action controls.
  - [x] Link only to existing safe remediation destinations when useful: `/admin/knowledge/progress`, `/admin/knowledge/recommendations`, and `/admin/knowledge/intake`.

- [x] Preserve the detailed Knowledge progress view without creating a second readiness implementation (AC: 1-3)
  - [x] Update `src/app/admin/knowledge/progress/page.tsx` only if new aggregate-only coverage gaps need a detailed display. Keep `/admin/quality` as the authoritative combined public-MVP readiness gate.
  - [x] Preserve the current 100-card evidence-grounded progress display, historic-approval warning, actionable-work links, and aggregate-only type/route lists.

- [x] Add focused DB-backed regression coverage and run verification (AC: 1-3)
  - [x] Extend `tests/public-mvp-quality-dashboard.test.ts` for 99 versus 100 current eligible cards; legacy-approved exclusions; fail-closed sampling/evaluation/corpus gaps; complete version fences; sealed enrollment count/selection/digest mismatches; required 100% `verify_first` sampling distinct from verification recommendations; durable suppressed/escalated cohorts; explicit verification/type/route/quality gaps; unfiltered corpus behavior; authorization; and serialization safety.
  - [x] Extend `tests/knowledge-batch-source-intake.test.ts` only for any new safe coverage aggregate/helper. Preserve current active-evidence predicate tests, public admin gate, and no-raw-material serialization assertions.
  - [x] Preserve and run `tests/knowledge-recommendation-queue.test.ts`, `tests/public-mvp-evaluation.test.ts`, and `tests/knowledge-search.test.ts` as ownership/safety regressions. Change `tests/knowledge-state.test.ts` only if an intentional policy predicate change is required; none is expected.
  - [x] Run DB-backed Vitest suites sequentially with configured `DATABASE_URL_TEST`; never run them concurrently and never use `pnpm db:reset`. Then run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Dev Notes

### Scope And Business Context

- Story 5.3 is the current Epic 5 AI-first quality delta and closes the public-evaluation gate. It is not the full public launch go/no-go review; Epic 6 owns operational, provider/privacy, worker, retention/removal, and accepted-risk evidence.
- The gate must measure current traveler-usable Hanoi-to-HCMC coverage: 100 current cards with active, code-valid evidence and complete retrieval eligibility. Historical approvals, extraction counts, UI completion, and stale projections are not readiness evidence.
- Story 3.11 already owns the detailed active evidence-grounded seed coverage read model. Story 5.3 composes that result with Feedback/Eval quality evidence; do not replace either module with a parallel aggregate.
- Story 5.1 owns answer-time immutable evaluation policy snapshots. Story 5.2 owns safe quality-signal projection. This story changes `buildReadiness()` intentionally while preserving their safety and display contracts.
- Scope boundary: no new public route, API route, client state store, background job, provider integration, generic analytics system, or card mutation command. The only new operational write is a narrow, existing-admin-only Knowledge sampling-maintenance entrypoint that seals a closed policy window; it does not mutate cards, evidence, publication, or recommendations. A minimal forward-only sampling migration is required because current rows do not preserve corridor classification, deterministic selection, an immutable terminal-outcome ledger, or an auditable complete-enrollment proof; do not edit historical migrations.

### Existing Implementation To Extend

- `src/features/feedback/quality-dashboard.ts` is the server-only Feedback/Eval entrypoint. It authenticates before reads, exposes safe bounded projections, and currently has only three readiness checks. Extend this existing contract instead of creating a second dashboard/readiness service.
- `src/features/knowledge/batch-intake.ts#getActiveEvidenceGroundedSeedCoverage()` already enforces the authoritative current active-evidence corridor predicate and returns target/count/gap, current review/verification signals, actionable work, and fixed type/route distribution buckets. Reuse it rather than reimplementing joins in `quality-dashboard.ts`.
- `src/features/knowledge/state.ts#evaluateKnowledgeTravelerPolicy()` remains the canonical state-aware policy. Only `contextual_use` belongs in the 100-card readiness count; `caveat_only` can remain visible as a gap but cannot satisfy it.
- `src/features/knowledge/recommendations.ts` owns version-fenced sampling recommendations and high-severity cohort escalation/suppression. The dashboard only reads durable policy state.
- `src/app/admin/quality/page.tsx` is the existing Vietnamese operator dashboard and is the authoritative combined gate display. `/admin/knowledge/progress` remains detailed coverage/remediation context, not an independent readiness decision.

### Data And Policy Guardrails

- PostgreSQL/Drizzle are the source of truth. Do not use a browser-computed count, a legacy approval field, a stale search document, or an untracked JSON convention as readiness evidence.
- Current corpus eligibility must preserve the existing code-valid quote/span, active evidence state, eligible source, capture-kind, retained-payload, state-aware policy, and corridor checks. `community_pattern` requires distinct active independence keys.
- Sampling uses complete current fences. An old recommendation resolution cannot satisfy a changed `contentVersion` or `evidenceSetRevision`.
- Auto-active population completeness cannot be inferred from extant cohort rows. A policy/window must carry a sealed count, selected count, digest, and completion marker produced under the policy lock after every candidate membership is persisted; the gate recomputes and matches this proof before it accepts a denominator.
- The Knowledge pipeline is the only writer of auto-active candidate and `verify_first` obligation ledgers, appending the applicable immutable terminal outcome in the same transaction as its card/version fence. The existing-admin-only Knowledge maintenance entrypoint may seal a closed auto-active policy window but does not change any card or recommendation; readiness only reads its persisted proof.
- Evaluation failures are persisted flags, not a generic severity classification. Treat durable policy `escalatedAt`/`suppressedAt` as high-severity sampling evidence, and do not fabricate per-result severity from current card state.
- Missing, pending, unselected, truncated, or unavailable readiness evidence is a blocker. Bounded UI diagnostics are not enough to claim a corpus-wide pass; use SQL aggregates for complete gate counts and reserve bounded reads for display.
- Evaluation severity is deterministic at the readiness layer, not a new persisted evaluation field: stale/withdrawn exposure, raw/evidence leakage, and unsafe conflicted use are high severity. Unsupported wording, caveat omission, unsupported claims, and missing fallback guidance remain listed quality defects and continue through the existing baseline quality gate; do not label them as stored high severity.
- The readiness evaluation evidence set is the newest completed current-prompt-set run containing all six current scenario/version pairs with scored results, exactly six persisted current rubric-dimension scores per result, and snapshots. Its run/result model metadata remains coherent within that one persisted run; never mix result rows from different runs or models. A newer qualifying run replaces the older evidence set for the gate but never deletes historical audit evidence; missing required run/result/score/snapshot evidence blocks.
- The sampling population is Hanoi-to-HCMC cohort membership, not all global policies. Persist the member's `corridor_bucket`/`outside_corridor` classification and `selected_for_sampling` with the complete version fence because mutable card route/location cannot safely classify historical sampling. A durable escalated/suppressed policy blocks if it recorded a corridor member at its fence, even if that member is later suppressed or moved; a purely non-corridor policy does not block this corridor gate. Unknown historic classification/selection blocks rather than being backfilled by guesswork. Use complete aggregate queries, not Story 5.2's capped diagnostic arrays, for this decision.
- Sampling completeness is the sealed persisted enrollment contract: for each applicable policy, scheduler-created membership rows represent all auto-active candidates and their deterministic selection only when the locked policy/window's stored count, selected count, digest, and completion marker match the recomputed member set. Every persisted selected corridor member must resolve at its exact fence with valid current evidence. A policy with no corridor members is explicitly zero-applicable; incomplete or mismatched enrollment proof, unknown selection, pending selection, or incomplete results blocks readiness.
- `verify_first` is not an auto-active cohort member, but its 100% sampling obligation is not optional. Its immutable terminal-outcome obligation ledger is the complete denominator; persist a distinct, version-fenced required sampling recommendation for every ledger row and verify it through sampling dispositions only. A verification recommendation is a separate review signal and cannot satisfy, alter, or mask this proof.
- Type and route/location zero-count buckets are explicit current-coverage remediation diagnostics only. They do not independently block readiness until the PRD supplies a minimum distribution threshold.
- Keep evaluation/feedback filter behavior intact, but do not permit `promptType` or time filters to hide current corpus safety defects.
- Never select, serialize, log, or render answer text, messages/conversations, raw source/capture text, evidence quote text, source URLs/snippets, web query bodies, full policy/provenance snapshots, provider payloads, sampling rationale, traveler identity/context, or card IDs for new readiness diagnostics.

### Architecture Compliance

- Keep `server-only`, strict TypeScript, `@/*` imports, one Next.js modular monolith, and PostgreSQL/Drizzle ownership. No new dependency or test framework.
- Authorize admin/operator reads server-side before any protected readiness aggregate. Preserve the dashboard gate and existing admin layout gate.
- Follow explicit feature ownership: Feedback/Eval owns combined read-model orchestration; Knowledge owns current card/evidence eligibility and all mutations; Retrieval/Search remain projection/source-bundle owners; AI Orchestration provenance remains the answer-time source of truth.
- Retrieval stays fail-closed. A lexical/search projection can never override current publication, state, source, evidence, or complete-metadata eligibility.
- The dashboard is a read model only. It must never change publication state, audit, projection, review, verification, or sampling policy.

### UI And Privacy Requirements

- Keep Vietnamese-first operator copy, existing warm map-paper admin visual language, readable mobile/desktop layout, visible text status, focus styling, and adequate contrast. Do not rely on color alone.
- The readiness panel must explain missing proof and safe next actions without declaring readiness from partial data. Links are navigation to existing remediation surfaces, not dashboard mutations.
- Preserve the separate admin/operator surface. Do not surface readiness internals to travelers or expose raw/operator-only material.

### Previous Story Intelligence

- Story 5.1 introduced six versioned AI-first scenarios while retaining the five canonical prompts and six rubric dimensions. Historical quality assertions must use persisted answer-time decision/provenance snapshots, not mutable cards or answer-prose parsing.
- Story 5.1 fixtures are deliberately suppressed, unindexed, and available only through exact internal evaluation-fixture scope. They must never contribute to active corpus readiness or traveler retrieval.
- Story 5.2 made policy diagnostics safe and bounded. Preserve its separate `sampling` versus `verification` queries, deterministic latest version-fenced disposition, actionable cohort priority, truncation/missing-signal handling, and no-card-ID/read-model privacy boundary.
- Story 5.2 explicitly deferred readiness changes. This story must now update `buildReadiness()` but preserve its existing baseline quality checks and all Story 5.2 policy-signal behavior.

### Testing Requirements

- Vitest is configured serially (`fileParallelism: false`, `maxWorkers: 1`). DB-backed suites share `DATABASE_URL_TEST`; run one command at a time and never use `pnpm db:reset`.
- Test active count and exclusion behavior: 99 fails, 100 passes its corpus-count check, and suppressed/archived/superseded, legacy-approved-only, invalid/removed/withdrawn evidence, tombstoned captures, incomplete metadata, failed verification, caveat-only, stale projection, and under-supported pattern cards do not count.
- Test sampling outcomes and fences: migration/backfill unknown classification, selection, candidate/obligation ledger, or enrollment proof fails closed; the pipeline transaction creates exactly one immutable auto-active ledger/member or `verify_first` obligation at its terminal fence; new membership persists corridor/outside-corridor classification and deterministic selection; the sealed policy enrollment count/selection count/digest detects a missing, extra, altered, or unsealed membership set; and pass, fail, pending, unselected, absent, truncated, stale version/revision, verification-only recommendation, and deterministic duplicate disposition selection are distinct. Cover non-corridor, mixed, and suppressed/escalated-after-version-change cohorts; only durable persisted corridor-member cohort evidence blocks readiness without falsely labeling all members high severity.
- Test the persisted enrollment denominator: the existing-admin-only maintenance entrypoint seals a closed window under the policy lock without card/recommendation mutations; every auto-active ledger candidate has one fenced member/selection record and matches the sealed enrollment proof; selected corridor members require passing resolution/current valid evidence; zero corridor membership is explicit zero-applicable; incomplete member/selection/result rows block. Separately test 100% `verify_first` sampling: every immutable obligation has exactly one required version-fenced sampling recommendation and a deterministic resolved disposition, while verification recommendations alone never satisfy it. Test the explicit evaluation matrix and evidence-set selection: only the newest completed current-prompt-set run with all six named `v1` scenarios, canonical prompt versions, scored results with exactly all six rubric dimensions, and snapshots qualifies; high-severity stale/withdrawn exposure, raw leakage, and unsafe conflict exclusion block; non-high-severity wording/caveat/unsupported/fallback defects are listed and stay governed by baseline quality checks; a later qualifying run replaces an older run; missing snapshots/results/scores block.
- Test full current corpus scope is independent from filtered eval/feedback display. Test unresolved verification, cohort, taxonomy, route, quality, and remaining-card gaps are explicit; only criteria with stated thresholds block, while taxonomy/route zero-count buckets remain diagnostics.
- Continue asserting authorization fails before aggregates and `JSON.stringify()` excludes raw sources/evidence, answer text, URLs, provider fields, full snapshots, sampling rationale, and raw identifiers.
- Required sequential verification: `pnpm test:run tests/public-mvp-quality-dashboard.test.ts`, `pnpm test:run tests/knowledge-batch-source-intake.test.ts`, `pnpm test:run tests/knowledge-recommendation-queue.test.ts`, `pnpm test:run tests/public-mvp-evaluation.test.ts`, `pnpm test:run tests/knowledge-search.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

### Latest Technical Information

- No external research, version upgrade, provider change, or dependency is required. Use the repository-pinned stack: Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3, Drizzle ORM 0.44.5, Vitest 4.1.10, and pnpm 10.26.2.
- Add only the required forward-only sampling-membership schema migration and journal/snapshot updates for persisted corridor classification and deterministic selection. Inspect generated SQL so it contains only the new DDL; do not include already-migrated historical definitions. No external dependency or provider change is required.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.3 Knowledge Cards]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.3 Community Knowledge Publication And Conflict Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.5 AI Answer Quality Rubric]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#12 Success Criteria]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-2, AD-3, AD-4, AD-5, AD-7, AD-11, AD-17, AD-28]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Publication Decision]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Transaction And Indexing Rules]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Admin Shell]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/5-1-evaluate-ai-first-community-knowledge-safety.md]
- [Source: _bmad-output/implementation-artifacts/5-2-surface-ai-first-policy-quality-signals.md]
- [Source: src/features/feedback/quality-dashboard.ts]
- [Source: src/features/knowledge/batch-intake.ts]
- [Source: src/features/knowledge/state.ts]
- [Source: src/features/knowledge/recommendations.ts]
- [Source: src/app/admin/quality/page.tsx]
- [Source: src/app/admin/knowledge/progress/page.tsx]
- [Source: src/db/schema.ts]
- [Source: tests/public-mvp-quality-dashboard.test.ts]
- [Source: tests/knowledge-batch-source-intake.test.ts]
- [Source: tests/knowledge-recommendation-queue.test.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Story creation loaded the complete current Epic 5/Story 5.3 contract, PRD, architecture spine, community-knowledge solution design, UX contract, project context, completed Stories 5.1 and 5.2, sprint status, current readiness/coverage/dashboard implementation, current regression suites, and recent Story 5 commits.
- The current codebase already has a Knowledge-owned active-evidence corridor coverage predicate and Feedback/Eval-owned readiness read model. The story narrows the work to composing these current safe contracts rather than introducing duplicate eligibility, UI, or persistence paths.
- Historical artifact naming Story 5.3 as a web-search feature conflicts with the authoritative current `epics.md` and is intentionally excluded from scope.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Status set to `ready-for-dev` after validation against the create-story checklist: acceptance criteria, module ownership, current code targets, version-fenced sampling, fail-closed readiness behavior, privacy boundaries, Vietnamese admin UI, and DB-backed verification are explicit.
- 2026-07-24: Revalidated against the current PRD, architecture, predecessor stories, schema, read models, and regression suites. Repaired the target-only readiness contract for complete six-dimension evaluation evidence, immutable auto-active enrollment and sealed denominator proof, and distinct 100% `verify_first` obligation sampling. The final contract remains read-only at the dashboard, fail-closed, ownership-safe, and ready for development.
- 2026-07-24: Implemented an initial forward-only enrollment schema, current-corpus dashboard gate, canonical evaluation-run selector, and read-only Vietnamese remediation UI. DB-backed dashboard, coverage, queue, ingestion, evaluation, and search suites passed when run sequentially; lint, typecheck, and build passed. Definition-of-done remains blocked: the sampling readiness aggregate does not yet prove current valid evidence for every selected/verify-first fence, has not implemented complete aggregate duplicate/disposition validation, and the required Story 5.3 regression matrix (99/100 corpus, sealed proof mismatches, and all version-fence cases) is incomplete. Story remains `in-progress`.
- 2026-07-24: Completed the bounded readiness recovery implementation. The sampling aggregate now requires current code-valid evidence at every selected auto-active fence, current active state for selected members, current valid evidence for every verify-first obligation, exact required verify-first sampling recommendation cardinality, and a resolved sampling disposition. Added DB regressions for the 99/100 corpus threshold, selected and verify-first content/evidence version drift, invalid evidence, count/selection/digest/unsealed proof mismatches, and duplicate required dispositions. `tests/public-mvp-quality-dashboard.test.ts` (13 tests), `tests/knowledge-batch-source-intake.test.ts` (14 tests), and `pnpm typecheck` passed. Required serial verification is blocked at `pnpm test:run tests/knowledge-recommendation-queue.test.ts` before collection: installed `next-auth@5.0.0-beta.31` imports a missing `next/server` module from the resolved `next@15.5.20` tree. No dependency change was made; Story remains `in-progress`.
- 2026-07-24: Applied the scoped pnpm patch for `next-auth@5.0.0-beta.31`, changing only its ESM imports to existing `.js` Next server entrypoints. Existing package constraints and resolved `next@15.5.20` remain unchanged. All required serial suites passed: public-MVP quality dashboard (13), batch source intake (14), recommendation queue (23), public-MVP evaluation (15), and knowledge search (42). `pnpm lint` passed with four pre-existing unused-variable warnings; `pnpm typecheck` and `pnpm build` passed. Story advanced to `review`.
- 2026-07-24: Resolved only the six authorized first-review findings. Readiness is now corpus-wide regardless of dashboard filters; current evidence is fenced to `sources.currentCaptureVersionId`; fully non-corridor policies are excluded from the corridor gate; suppressed corridor cards with unresolved review/verification remain remediation diagnostics; and the Knowledge progress surface is an admin-only operational caller for sealing closed sampling windows. Added canonical evaluation-run selector coverage for six scenario/version pairs, missing evidence, newest qualifying replacement, and high versus non-high flags. Required serial verification passed; status returned to `review`.

### Review Findings

- [x] [Review][Patch] Readiness now executes all dashboard, corpus, sampling, and canonical-evaluation reads in one read-only `REPEATABLE READ` transaction [src/features/feedback/quality-dashboard.ts].
- [x] [Review][Patch] Auto-active cohort membership and ledger card foreign keys are deletion-restricted; a forward migration preserves the immutable denominator [src/db/schema.ts, drizzle/migrations/0058_preserve_sampling_readiness_ledgers.sql].
- [x] [Review][Patch] Verify-first obligations retain the same deletion-restricted fence, preserving their required sampling proof [src/db/schema.ts, drizzle/migrations/0058_preserve_sampling_readiness_ledgers.sql].
- [x] [Review][Patch] Magic-moment and generic baseline checks now use only the newest canonical evaluation run selected for readiness [src/features/feedback/quality-dashboard.ts].
- [x] [Review][Patch] The canonical selector requires every result's prompt-set ID and version to match its completed current run, failing closed on mixed evidence [src/features/feedback/quality-dashboard.ts].
- [x] [Review][Patch] Fully non-corridor policies are retained as explicit `zeroApplicablePolicies` diagnostics instead of being silently removed [src/features/knowledge/recommendations.ts].
- [x] [Review][Patch] `/admin/quality` renders corpus-wide zero-count type/route buckets and canonical non-high quality-gap diagnostics [src/app/admin/quality/page.tsx].
- [x] [Review][Patch] Non-high evaluation gaps are now remediation diagnostics only; the undocumented zero-tolerance readiness check was removed [src/features/feedback/quality-dashboard.ts].
- [x] [Review][Patch] Zero-applicable sampling policies can certify readiness without applicable corridor proof [src/features/knowledge/recommendations.ts:128-153]
- [x] [Review][Patch] Sampling policy deletion cascades immutable auto-active enrollment records [src/db/schema.ts:1073,1135]
- [x] [Review][Patch] Canonical evaluation readiness now accepts the coherent persisted AI Ask answer-model evidence set when it differs from the run's evaluator model, while rejecting mixed result model sets [src/features/feedback/quality-dashboard.ts].
- [x] [Review][Patch] Generated `0059` Drizzle snapshot metadata records the policy-ledger `ON DELETE restrict` foreign-key state so future schema generation starts from the applied migration state [drizzle/migrations/meta/0059_snapshot.json].

### File List

- _bmad-output/implementation-artifacts/5-3-close-the-active-evidence-grounded-card-readiness-gate.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0057_active_evidence_readiness_enrollment.sql
- drizzle/migrations/0058_preserve_sampling_readiness_ledgers.sql
- drizzle/migrations/0059_restrict_sampling_policy_ledger_deletion.sql
- drizzle/migrations/meta/0058_snapshot.json
- drizzle/migrations/meta/0059_snapshot.json
- drizzle/migrations/meta/_journal.json
- src/app/admin/quality/page.tsx
- src/db/schema.ts
- src/features/feedback/quality-dashboard.ts
- src/features/knowledge/batch-intake.ts
- src/features/knowledge/corridor.ts
- src/features/knowledge/ingestion-pipeline.ts
- src/features/knowledge/recommendations.ts
- src/features/knowledge/sampling-maintenance.ts
- tests/knowledge-ingestion-pipeline.test.ts
- tests/public-mvp-quality-dashboard.test.ts
- tests/knowledge-batch-source-intake.test.ts
- tests/knowledge-recommendation-queue.test.ts

### Change Log

- 2026-07-24: Created the implementation-ready Story 5.3 context; sprint status synchronization follows final validation.
- 2026-07-24: Validated and repaired the Story 5.3 readiness contract; retained `ready-for-dev`.
- 2026-07-24: Started implementation; added partial enrollment/readiness infrastructure and recorded remaining Definition-of-Done blockers.
- 2026-07-24: Completed bounded aggregate and regression recovery; retained `in-progress` because the required serial queue ownership suite cannot collect under the installed Next/next-auth dependency resolution.
- 2026-07-24: Added the scoped `next-auth` ESM-entrypoint compatibility patch, completed required sequential verification, marked all tasks complete, and synchronized sprint status to `review`.
- 2026-07-24: Repaired only the six authorized first-review findings; required serial suites, lint, typecheck, and build passed. Returned to `review`.
- 2026-07-24: Marked `in-progress` during second-review recovery. The five claimed second-review findings and their severities are absent from the permitted story record, so they cannot be accurately recorded without the original review payload.
- 2026-07-24: Completed a fresh adversarial Story 5.3 review of `cb83ccc`, `cea0a736`, and the present documentation worktree. Recorded eight actionable findings (four high and four medium), all classified as substantial risk. Story remains `in-progress`; no application code, tests, dependencies, or commits were modified by this review.
- 2026-07-24: Resolved only the eight fresh-review findings. Readiness now has one read-only repeatable-read snapshot; immutable auto-active and verify-first rows block card deletion; canonical evaluation evidence fences result prompt-set identity and supplies all baseline checks; zero-applicable non-corridor policies and corpus-wide remediation diagnostics are explicit; non-high evaluation gaps remain baseline-governed diagnostics. Added DB regressions for mixed prompt sets, canonical baseline replacement, zero-applicable policy diagnostics, and immutable row retention. Required serial suites passed: dashboard (19), batch intake (14), recommendation queue (23), evaluation (15), search (42); lint passed with three pre-existing warnings; typecheck and build passed. Status returned to `review`; no commit created.
- 2026-07-24: Final adversarial review centered on repair `268e208` found two unresolved high-severity readiness-integrity defects: an all-zero-applicable policy set can pass the sampling gate without corridor proof, and cascading policy foreign keys can erase auto-active immutable enrollment records before card deletion. Findings were persisted as action items. No application code, tests, dependencies, commits, or new stories were created by this review; story and sprint status set to `in-progress`.
- 2026-07-24: Resolved the two scoped final-review findings. The sampling gate requires at least one corridor-applicable policy and validates sealed proof diagnostics for all policies. Forward migration `0059_restrict_sampling_policy_ledger_deletion` changes immutable auto-active membership and candidate-ledger policy foreign keys from cascade to restrict. Corrected non-corridor proof normalization so persisted `outsideCorridor = true` members retain the canonical empty bucket. Migration application and all required serial suites passed: dashboard (20), batch intake (14), recommendation queue (23), evaluation (15), and search (42). Lint passed with three pre-existing warnings; typecheck and build passed. Status returned to `review`; no commit created.
- 2026-07-24: Status-only finalization after supplied repair commit `2351a0e762ff39302dd84dc9bf1bec7e6545d35d` was verified to exist and the worktree was verified clean. No source, diff, correctness, test, implementation, review, or commit inspection was performed. Story marked `done` and sprint status synchronized.
- 2026-07-24: Resolved the two scoped Epic 5 review findings without a commit. Canonical readiness now treats the persisted run as one coherent AI Ask answer-model evidence set rather than requiring its result model to equal the evaluator model; mixed answer-model result sets still fail closed. Generated the missing `0059` Drizzle snapshot metadata for the policy-ledger `ON DELETE restrict` state. Required serial suites passed: dashboard (21), batch intake (14), recommendation queue (23), evaluation (17), and search (42). Lint passed with three pre-existing warnings; typecheck and build passed. Story returned to `review`; Epic 5 remains `done`.
- 2026-07-24: Status-only finalization after accepted Epic-review repair commit `0eb477a9556263725e226d58fab03d0a482e9b65` was verified present on `main` and the pre-update worktree was verified clean. Story marked `done`; Epic 5 remains `done`.
