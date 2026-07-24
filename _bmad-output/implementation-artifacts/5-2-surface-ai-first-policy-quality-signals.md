---
baseline_commit: e48723a5ff2fd109303df2e187510b84f7533d42
---

# Story 5.2: Surface AI-First Policy Quality Signals

Status: review

## Story

As an operator,
I want quality views to expose evidence and policy failure patterns,
so that I can prioritize suppression, verification, or stricter sampling before travelers are affected.

## Acceptance Criteria

1. **Given** sampling recommendations, evaluation results, and card state transitions exist, **when** an operator views quality signals, **then** they can inspect active-card sampling pass/fail, policy cohort, evidence-grounding failure, caveat violation, verification-required state, and suppression/escalation signals, **and** usefulness and generic-answer comparison remain linked to stored retrieval decisions/provenance.
2. **Given** a high-severity sampled or evaluated policy failure is recorded, **when** the affected cohort is shown, **then** the view identifies the prompt/model/category/cohort and recommended safe action, **and** it does not expose raw source material, provider payloads, or traveler-private content.
3. **Given** no data is sufficient to calculate a quality signal, **when** the dashboard renders, **then** it reports the missing signal rather than claiming readiness, **and** it preserves role-gated operator access.

## Tasks / Subtasks

- [x] Extend the Feedback/Eval-owned safe quality-dashboard read model (AC: 1-3)
  - [x] Extended `src/features/feedback/quality-dashboard.ts` without a parallel dashboard or persistence aggregate.
  - [x] Preserved server-side authorization before protected reads.
  - [x] Preserved evaluation filters and explicitly scopes sampling as all sampling policies.
  - [x] Added bounded aggregates/diagnostics for evaluation failures, version-bound sampling outcomes, current verification state, cohort escalation/suppression, and existing retrieval/provenance signals.
  - [x] Batched the required safe evaluation, policy, cohort, recommendation, and card reads.
  - [x] Preserved policy flag meanings, version fences, durable severity limits, and deterministic safe-action labels.

- [x] Preserve privacy, provenance, and feature ownership boundaries (AC: 1-3)
  - [x] Feedback/Eval owns the dashboard query/projection; Knowledge continues to own sampling, recommendation resolution, card state, and suppression/escalation commands. Do not bypass module ownership with dashboard mutation code.
  - [x] Reuse persisted answer-time retrieval decisions and row-per-source provenance only as safe identifiers/category-use signals. Do not parse answer prose or reconstruct policy state from mutable cards as a substitute for evaluation-time snapshots.
  - [x] Never select, return, serialize, log, or render `publicMvpEvaluationResults.answerText`, messages/conversation content, raw source/capture text, bounded evidence quote text, source URLs/snippets, full `sourceSnapshot` JSON, provider payloads, query bodies, traveler identity/context, credential-bearing URLs, or sampling rationale. Safe IDs alone are acceptable only where existing diagnostics already use them.
  - [x] Keep all result/cohort data bounded. Reuse the Story 5.1 policy-snapshot limits of at most five selected knowledge items and ten reason codes; aggregate/count rather than expanding JSON payloads.
  - [x] Do not change baseline score aggregation, feedback aggregation, existing counter metrics, the five canonical prompts, the six rubric dimensions, or `buildReadiness()`. Story 5.3 owns active evidence-grounded readiness-gate changes.

- [x] Render additive, read-only operator quality signals (AC: 1-3)
  - [x] Extended `src/app/admin/quality/page.tsx` using the existing Vietnamese-first operator dashboard visual language and its current filter form, counter metrics, readiness panel, and recent diagnostics.
   - [x] Added concise policy-signal summaries plus bounded cohort/result diagnostics showing category, prompt, model version, scenario/category, cohort key when available, severity/state, and recommended safe action. No free-form source/answer/detail content or inert action controls are rendered.
  - [x] Clearly labels missing, unavailable, or uncorrelated signals in Vietnamese without changing readiness behavior.
  - [x] Preserves semantic labels, focus styling inherited from existing controls, adequate contrast, non-color state text, and smaller-width readability.

- [x] Add focused regression coverage and run required verification (AC: 1-3)
  - [x] Extended `tests/public-mvp-quality-dashboard.test.ts` with Story 5.1 policy flags/snapshots and version-bound sampling fixtures.
  - [x] Proved anonymous/traveler role denial before aggregates are returned.
   - [x] Proved sampling pass/fail, cohort state, verification-required cards, evidence/caveat failures, durable escalation/suppression, prompt/model/category, safe actions, unselected members, non-member verification recommendations, and unavailable per-result severity.
  - [x] Proved a later card version does not contaminate historical cohort results and the existing missing-signal/readiness regression remains intact.
  - [x] Preserved usefulness, generic-answer, retrieval/provenance, and filter behavior while exposing sampling as unfiltered scope.
  - [x] Extended serialization-leak assertions for answer text, sampling rationale, provenance snapshot, provider, and raw-source markers.
   - [x] Reused `tests/public-mvp-evaluation.test.ts` and `tests/knowledge-recommendation-queue.test.ts` as ownership regressions.
   - [x] Ran DB-backed focused suites serially using normal repository commands, then lint, typecheck, and build; no `db:reset` was used.

### Review Findings

- [x] [Review][Patch] Render the required individual sampling and verification signals [src/app/admin/quality/page.tsx:123] — AC 1 requires operators to inspect active-card sampling pass/fail and verification-required state, but the page combines passes and failures into one number and never renders `verificationRequiredCurrentCards` or bounded member outcomes. AC 2 also requires a failure's prompt/model/category tuple, while the rendered evaluation diagnostic omits `modelVersion`.
- [x] [Review][Patch] Fail closed when policy evaluation or sampling outcomes are unavailable [src/features/feedback/quality-dashboard.ts:244] — `evaluation.missingSignal` is false for any filtered result even without a persisted policy snapshot, and `sampling.missingSignal` is false whenever cohort members exist even if none has a resolved pass/fail outcome. Unresolved selected recommendations are also classified as `unselected`. This can report zero failures or readiness-adjacent signals from insufficient data, violating AC 3.
- [x] [Review][Patch] Make version-fenced sampling dispositions deterministic [src/features/feedback/quality-dashboard.ts:273] — multiple resolved historical sampling recommendations may share the same policy/card/version/revision fence, but `Array.find()` selects an unordered row. A failed sampled card can therefore be shown as passed. Select the authoritative disposition deterministically and distinguish no recommendation from selected-but-pending work.
- [x] [Review][Patch] Bound policy-signal reads and prioritize actionable cohorts [src/features/feedback/quality-dashboard.ts:251] — every dashboard request loads all policies, cohort members, sampling recommendations, and cards, then scans recommendations per member. The response is capped only after unbounded in-memory work; the arbitrary first ten cohorts may omit suppressed/escalated cohorts. Use bounded, ordered query/aggregate paths and prioritize actionable cohort diagnostics.
- [x] [Review][Patch] Avoid misleading cohort categories [src/features/feedback/quality-dashboard.ts:283] — cohort category is derived from the first mutable current card. Mixed cohorts are mislabeled and historical category can drift after a card update. Aggregate categories deterministically or label the value as current/mixed.
- [x] [Review][Patch] Keep verification recommendations out of sampling disposition lookup [src/features/feedback/quality-dashboard.ts:279] — The dashboard loads `sampling` and `verification` recommendations into one version-fenced candidate set. A `verify_first` recommendation for the same policy/card/version can therefore turn a cohort member with no sampling recommendation into `pending`; it can also consume the global 100-row limit ahead of actual sampling dispositions. This violates the required distinction between unselected and selected-pending sampling work and can misstate an operator's sampling signal. Query/associate only `reason = "sampling"` for sampling outcomes; read verification recommendations separately only if required for current verification signals. [high; substantial risk]
- [x] [Review][Patch] Preserve diagnostics for every prioritized actionable cohort [src/features/feedback/quality-dashboard.ts:271] — Policies are prioritized suppressed/escalated-first, but the globally capped member query is ordered by opaque `policyId`. An earlier active policy with 51 members can consume the entire read and cause a later suppressed/escalated policy to be omitted from `cohorts`, even though it is within the selected policy set. The missing-data warning does not identify the affected high-severity cohort as AC 2 requires. Apply the same actionable priority to members or reserve a bounded quota per selected policy. [high; substantial risk]
- [x] [Review][Patch] Index the policy-scoped recommendation diagnostics query [src/features/feedback/quality-dashboard.ts:279] — The new request-path query filters recommendations by `policyId` and `reason`, then sorts by policy/card/version/reason/resolution timestamps. `knowledge_recommendations` has no supporting index beginning with `policy_id`; PostgreSQL does not automatically index foreign keys. As recommendation history grows, each operator dashboard load can scan and sort the table before applying its 101-row limit. Add a forward-only index tailored to this bounded query. [medium; non-substantial risk]
- [x] [Review][Patch] Aggregate policy verification counters without materializing recommendation rows [src/features/feedback/quality-dashboard.ts:310] — Replaced the policy-scoped verification recommendation row read with a PostgreSQL `count(distinct ...)` over only current required/failed cards. Sampling-member verification counts remain bounded by the existing member/card limits, and their truncation continues to set `missingSignal`.
- [x] [Review][Patch] Remove raw knowledge card IDs from the policy dashboard contract and render [src/features/feedback/quality-dashboard.ts:137] — Sampling diagnostics retain category, outcome, and recommended safe action, but no longer return or render `knowledgeCardId`.

## Dev Notes

### Scope And Business Context

- This is the current Epic 5 AI-first quality-learning delta. Story 5.1 has already persisted six versioned policy scenarios and safe result snapshots; Story 5.2 makes those stored signals actionable to operators without changing evaluation generation, Knowledge commands, or readiness gates.
- The objective is an operator-only, safe projection for early intervention: suppression/escalation, verification, or stricter sampling. It is not a generic analytics product, an answer/source viewer, a new review queue, or a card mutation surface.
- Story 5.3 alone changes the public-evaluation readiness gate. Keep the current dashboard readiness rules intact even when Story 5.2 reports a serious policy signal.

### Existing Implementation To Extend

- `src/features/feedback/quality-dashboard.ts` is the owning server-only read model. It already performs role gating, filters evaluation rows, aggregates feedback/rubric/counter metrics, batches retrieval/provenance reads, and returns safe recent diagnostics. Extend this contract rather than adding a second read path.
- `src/app/admin/quality/page.tsx` is the existing read-only Vietnamese operator dashboard. Preserve its filters, existing metrics, readiness display, counter metrics, and safe recent-result diagnostics while adding policy-quality signals.
- `src/features/feedback/evaluation.ts` provides the authoritative Story 5.1 persistence semantics. `buildPolicySnapshot()` stores selected safe card/version/state/use-policy metadata, excluded counts/reasons, source/evidence outcome, fallback metadata, and finalization outcome. Do not reimplement or overwrite it.
- `src/features/knowledge/recommendations.ts` owns version-fenced sampling and high-severity escalation. A `sampling_fail` with approved high severity suppresses only the policy cohort, disables applicable projections, and writes audits. Story 5.2 reads those durable policy/recommendation/card outcomes only.
- Existing schema supports the required inputs: `publicMvpEvaluationResults`, `publicMvpEvaluationResultPolicySnapshots`, `knowledgeSamplingPolicies`, `knowledgeSamplingCohortMembers`, `knowledgeRecommendations`, and `knowledgeCards`. No migration is expected unless implementation identifies a concrete persisted-data gap.

### Data And Policy Guardrails

- Evaluation policy failure data: `unsupportedCommunityWordingFlag`, `requiredCaveatOmittedFlag`, `staleWithdrawnSourceExposureFlag`, and `rawEvidenceLeakageFlag` represent failures. `conflictedKnowledgeExcludedFlag` and `fallbackVerificationGuidanceMetFlag` represent the required safe behavior and become a failure signal only when false.
- Sampling outcomes are recommendation/version based. Use `resolution` (`sampling_passed`/`sampling_failed`), `samplingDispositionReason`, `policyId`, and matching cohort member `(knowledgeCardId, contentVersion, evidenceSetRevision)`. Do not expose `samplingRationale`.
- `knowledgeSamplingCohortMembers` is the cohort denominator for `sample` policy work; deterministic selection may leave a member without a sampling recommendation. `verify_first` may reference a sampling policy but does not create cohort membership. Join sampling outcomes only by the complete policy/card/version/revision fence.
- Policy state comes from `knowledgeSamplingPolicies.escalatedAt` and `.suppressedAt`; card state must remain current-state information. Do not reconstruct unrecorded historical transitions.
- `escalatedAt`/`suppressedAt` is durable cohort-level evidence of a high-severity sampling escalation, not evidence that every recommendation in the cohort was high severity. Evaluation results have failure flags, not a persisted severity classification.
- The current `PublicMvpQualityDashboard.recentResults` safely exposes source-category booleans and existing safe identifiers. Retain this contract; no full provenance snapshot or answer detail belongs in the dashboard payload.
- Query and render only bounded safe fields. The dashboard must never contain raw/operator-only evidence, provider data, web content/query bodies, traveler conversations/context, or evaluation answer text.

### Architecture Compliance

- PostgreSQL and Drizzle remain the system of record. If persistence truly changes, use a forward-only Drizzle migration and journal update; do not add untracked JSON conventions or modify historical migrations.
- Keep server-only code and `@/*` imports. The app remains a Next.js modular monolith with a feature-owned server read entrypoint.
- Server-side role validation is required for every admin/operator read. Preserve both the dashboard read-model gate and the admin layout gate.
- Stored answer-time provenance and retrieval decisions are the source of truth for quality/evaluation. Do not derive policy from free-form Vietnamese answer text or mutable live Knowledge rows.
- Preserve fail-closed retrieval and Knowledge ownership. A dashboard read must never repair eligibility, publish/suppress a card, or create review/sampling work.

### Project Structure Notes

- Expected production files: `src/features/feedback/quality-dashboard.ts` and `src/app/admin/quality/page.tsx`.
- Expected test file: `tests/public-mvp-quality-dashboard.test.ts`; read existing evaluation and recommendation-queue tests before adding fixtures.
- No separate API, client state store, dashboard component library, background worker, provider integration, or test framework is required.
- Do not modify Story 5.1 evaluation orchestration except for a concrete dashboard-read compatibility defect discovered during implementation. Do not begin Story 5.3.

### Testing Requirements

- Vitest is configured serially (`fileParallelism: false`, `maxWorkers: 1`). Run DB-backed suites one command at a time using `DATABASE_URL_TEST`; never run them concurrently and never use `pnpm db:reset`.
- Start with `DATABASE_URL_TEST="$DATABASE_URL_TEST" pnpm test:run tests/public-mvp-quality-dashboard.test.ts`, then run relevant existing evaluation/recommendation suites as required by changed data contracts.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Record actual commands, results, warnings, and any blockers in the Dev Agent Record when implementing.

### Previous Story Intelligence

- Story 5.1 established a six-scenario AI-first evaluation registry over five canonical prompts, persisted immutable safe policy snapshots, and added dashboard-read compatibility without implementing Story 5.2 UI.
- Story 5.1 intentionally keeps synthetic evaluation fixtures suppressed and unindexed; only exact internal fixture IDs can be read by evaluation. Dashboard work must not make fixture data traveler-retrievable or broaden that capability.
- Evaluation policy assertions must use answer-time persisted snapshots. Evaluation fixtures, current cards, and search state are mutable and cannot replace that record.
- Existing protections to preserve: missing-model preflight writes nothing; no raw/operator-only material reaches evaluator/dashboard contracts; conditional high-risk behavior requires conditions and Vietnamese verification guidance; conflicted/withdrawn data remains excluded; low-confidence/failed fallback requires verification guidance.

### Git Intelligence

- Recent Story 5.1 commits (`9927716`, `7cd2dc6`, `2082145`, `8efea42`) repeatedly hardened fixture isolation, answer-time snapshot use, scenario contracts, leakage counter behavior, and failed-contract retention. Treat this safety behavior as baseline, not optional dashboard detail.
- The finalized status commit `e48723a` marks Story 5.1 done. Its dashboard changes are additive data-contract preparation for this story; preserve their existing baseline metrics and authorization behavior.

### Latest Technical Information

- No external library, provider, or framework upgrade is required. Use the pinned repository stack: Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3, Drizzle ORM 0.44.5, Vitest 4.1.10, and pnpm 10.26.2.
- Do not add dependencies or introduce a separate reporting/analytics/test stack.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.3 Community Knowledge Publication And Conflict Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.5 AI Answer Quality Rubric]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-3, AD-4, AD-5, AD-6, AD-7, AD-11, AD-28]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Operator Workflow]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Admin Shell]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/5-1-evaluate-ai-first-community-knowledge-safety.md]
- [Source: src/features/feedback/quality-dashboard.ts]
- [Source: src/app/admin/quality/page.tsx]
- [Source: src/features/feedback/evaluation.ts]
- [Source: src/features/knowledge/recommendations.ts]
- [Source: src/db/schema.ts]
- [Source: tests/public-mvp-quality-dashboard.test.ts]
- [Source: tests/public-mvp-evaluation.test.ts]
- [Source: tests/knowledge-recommendation-queue.test.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Story creation loaded the complete target Epic 5 context, PRD, architecture spine, community knowledge solution design, UX contract, project context, completed Story 5.1, current Feedback/Eval dashboard/evaluation code, current Knowledge recommendation/sampling implementation, schema, and relevant test suite.
- Architecture and UX artifacts were discovered in sharded planning directories referenced by `epics.md`; no separate technical research was necessary because this story uses repository-pinned implementation patterns and no dependency/provider changes.
- 2026-07-24: Loaded the `bmad-dev-story` workflow, project context, complete Story 5.2, sprint status, current dashboard/read model, schema, evaluation persistence, and related regression suites. The existing schema supplies the required bounded evaluation snapshots and version-fenced sampling cohort inputs; no schema gap or migration was identified.
- 2026-07-24: Added the initial focused dashboard regression fixture for safe policy/sampling projection, then attempted the required red-phase command: `DATABASE_URL_TEST="$DATABASE_URL_TEST" pnpm test:run tests/public-mvp-quality-dashboard.test.ts`. Vitest stopped before loading tests with `DATABASE_URL_TEST is required for integration tests.`

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Status set to `ready-for-dev` after validation against the create-story checklist: scope is additive and read-only, uses existing safe persistence and ownership boundaries, prevents policy-flag inversion and cohort-version drift, preserves Story 5.3 readiness scope, and requires explicit no-data/missing-signal behavior.
- 2026-07-24: Revalidated the target story against the current dashboard, evaluation, sampling, schema, test, PRD, architecture, and UX contracts. Repaired the target-only guidance for cohort membership versus recommendation selection, `verify_first` policy references, durable severity limits, category provenance, and deterministic safe-action mappings. Final validation passed; Story 5.2 remains `ready-for-dev`.
- 2026-07-24: Blocked before implementation verification because `DATABASE_URL_TEST` is unavailable in this execution environment. Story remains `in-progress`; no task or subtask was marked complete and sprint status was not advanced to `review`.
- 2026-07-24: Completed the bounded recovery using normal repository test commands without environment overrides. Added the safe, read-only policy-signal projection and Vietnamese operator rendering; all focused DB-backed suites, typecheck, and build passed. Lint completed with three existing unused-variable warnings in `tests/knowledge-search.test.ts` and no errors.
- 2026-07-24: Addressed only the five first-review actionable findings. The policy projection now uses ordered bounded reads, prioritizes suppressed/escalated cohorts, fails closed for missing/truncated policy data and pending sampling work, deterministically selects the newest resolved version-fenced sampling disposition, and identifies categories as current/mixed. The operator page renders individual pass/fail, verification-required, pending, member-outcome, and model-version signals.
- 2026-07-24: Resolved only the three recorded second-review findings. Sampling outcomes now query only `reason = "sampling"` and use complete version fences; current verification cards remain a separate bounded read. Each selected policy receives an independent bounded member/recommendation diagnostic quota, preserving suppressed/escalated cohort visibility. Added the forward-only `knowledge_recommendations_policy_sampling_diagnostics_idx` migration and DB-backed regression for an earlier active cohort with 51 members plus a same-fence verification recommendation.
- 2026-07-24: Resolved the final two review findings only. Policy verification-required cards now use a PostgreSQL aggregate instead of materializing recommendation rows, while bounded member diagnostics retain explicit truncation `missingSignal` behavior. Removed `knowledgeCardId` from the policy dashboard contract and page render without changing category, cohort, or outcome behavior.

### File List

- _bmad-output/implementation-artifacts/5-2-surface-ai-first-policy-quality-signals.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- tests/public-mvp-quality-dashboard.test.ts
- src/features/feedback/quality-dashboard.ts
- src/app/admin/quality/page.tsx
- src/db/schema.ts
- drizzle/migrations/0056_chief_vampiro.sql
- drizzle/migrations/meta/0056_snapshot.json
- drizzle/migrations/meta/_journal.json

### Review Follow-up File List

- _bmad-output/implementation-artifacts/5-2-surface-ai-first-policy-quality-signals.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- tests/public-mvp-quality-dashboard.test.ts
- src/features/feedback/quality-dashboard.ts
- src/db/schema.ts
- drizzle/migrations/0056_chief_vampiro.sql
- drizzle/migrations/meta/0056_snapshot.json
- drizzle/migrations/meta/_journal.json

### Change Log

- 2026-07-24: Created the implementation-ready Story 5.2 context and synchronized its sprint status to `ready-for-dev`.
- 2026-07-24: Repaired target-only validation gaps and reconfirmed `ready-for-dev`; sprint status remains synchronized.
- 2026-07-24: Began Story 5.2 and added an initial regression fixture; halted because the required `DATABASE_URL_TEST` configuration is missing.
- 2026-07-24: Completed Story 5.2 implementation and verification; status moved to `review`.
- 2026-07-24: Resolved first-review actionable findings only; status remains `review` and sprint status is synchronized.
- 2026-07-24: Resolved all three recorded second-review findings; status returned to `review` and sprint status is synchronized.
- 2026-07-24: Resolved both final review findings; status remains `review` and sprint status is synchronized.

### Verification

- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` - passed (8 tests).
- `pnpm test:run tests/public-mvp-evaluation.test.ts` - passed (15 tests).
- `pnpm test:run tests/knowledge-recommendation-queue.test.ts` - passed (23 tests).
- `pnpm lint` - passed with 3 pre-existing warnings in `tests/knowledge-search.test.ts`.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` - passed (10 tests), including aggregate verification-count, explicit truncation `missingSignal`, and no-card-ID projection assertions.
- `pnpm test:run tests/public-mvp-evaluation.test.ts` - passed (15 tests), run serially.
- `pnpm test:run tests/knowledge-recommendation-queue.test.ts` - passed (23 tests), run serially.
- `pnpm typecheck` - passed.
- `pnpm lint` - passed with 3 pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`; no new warnings.
- `pnpm build` - passed.
- `pnpm db:generate` - generated `0056_chief_vampiro`; migration was reduced to its required forward-only policy recommendation index because the generated diff included already-migrated historical Story 5.1 DDL.
- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` - passed (10 tests), run serially after the second-review regression.
- `pnpm test:run tests/public-mvp-evaluation.test.ts` - passed (15 tests), run serially.
- `pnpm test:run tests/knowledge-recommendation-queue.test.ts` - passed (23 tests), run serially.
- `pnpm typecheck` - passed.
- `pnpm lint` - passed with 3 pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`; no new warnings.
- `pnpm build` - passed.
- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` - passed (9 tests) after first-review fixes.
- `pnpm test:run tests/public-mvp-evaluation.test.ts` - passed (15 tests).
- `pnpm test:run tests/knowledge-recommendation-queue.test.ts` - passed (23 tests).
- `pnpm lint` - passed with 3 pre-existing warnings in `tests/knowledge-search.test.ts`.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
