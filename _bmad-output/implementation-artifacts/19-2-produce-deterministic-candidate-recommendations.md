---
story_id: 19-2
status: done
baseline_commit: 9a33e10
created: 2026-08-10
epic: 19
---

# Story 19.2: Produce Deterministic Candidate Recommendations

## Story

As an operator,
I want AI triage recommendations constrained by deterministic policy,
so that ranking helps prioritize review without becoming authority over eligibility or truth.

## Acceptance Criteria

1. **Given** a schema-valid triage output is available, **when** Discovery persists its result, **then** it records immutable recommendation `skip | defer | consider`, bounded score factors, penalties, reasons, and safe derived signals.
   - Recommendation remains separate from future mutable candidate state `pending | accepted | deferred | skipped`.

2. **Given** Discovery determines whether a candidate can appear in review, **when** deterministic policy evaluates it, **then** it rechecks canonical URL, public individual-video eligibility, dedupe, Knowledge-owned prior-capture eligibility, and configured score bands.
   - Model scores cannot override any failed hard eligibility condition.

3. **Given** an immutable recommendation is persisted, **when** Story 19.3 projects it to an authorized operator, **then** its closed recommendation, factor, penalty, reason, and signal codes support plain-language rendering without implying correctness, source verification, or publication eligibility.
   - Numeric scores are progressive disclosure only. Story 19.2 does not implement authorization, an API/read projection, Vietnamese display copy, or UI.

## Tasks / Subtasks

- [x] Define the versioned deterministic ranking contract (AC: 1, 2)
  - [x] Extend `packages/domain/src/youtube-discovery/policy.ts` with exactly these finite `0..1` fields: `relevanceWeight`, `expectedValueWeight`, `freshnessFitWeight`, `commercialRiskWeight`, `duplicateRiskWeight`, `deferMinimum`, and `considerMinimum`. Require all five weights to sum to `1` at the shared six-decimal precision, and require `0 <= deferMinimum < considerMinimum <= 1`. The migration owns initial operational values; do not hard-code thresholds in Worker code or create environment-variable policy.
  - [x] Specify a pure, DB-free evaluator in the Discovery domain. For a successful triage assessment, calculate `quality = relevanceScore * relevanceWeight + expectedValueScore * expectedValueWeight + freshnessFitScore * freshnessFitWeight`, `risk = commercialRiskScore * commercialRiskWeight + duplicateRiskScore * duplicateRiskWeight`, and `score = round6(quality * (1 - risk))`. `round6` is decimal half-up to six places before comparisons and persistence. Produce `consider` when `score >= considerMinimum`, `defer` when `score >= deferMinimum`, otherwise `skip`; equality belongs to the higher band.
  - [x] The evaluator must produce only deterministic closed values: factors are the positive score codes ordered `relevance`, `expected_value`, `freshness_fit`; penalties are `commercial_risk`, `duplicate_risk`; reasons are exactly one of `eligible_score_band`, `below_defer_band`, `between_defer_and_consider_band`, `already_compatible`, `canonical_mismatch`, `not_current_run_enriched`; signals are the triage input-derived codes in lexical order. Deduplicate values, retain at most five applicable factors/penalties combined, persist exactly one reason separately, and retain at most six signals. Do not invent codes or prose to fill a display count; Story 19.3 maps these codes to authorized Vietnamese operator copy.
  - [x] Make hard gates dominate calculated score: shared canonicalizer must reproduce the stored `videoId` and canonical URL; a current-run successful enrichment is the sole public-individual-video eligibility proof for this slice, so do not add another YouTube API call or a visibility field; canonical video-ID dedupe must hold; and prior capture outcome must be evaluated. `already_compatible` persists non-reviewable `skip` with its dedicated reason regardless of score; `unavailable` fails closed and is retried, never inferred as eligible. A candidate that lacks the current run's enrichment/appearance is not eligible for recommendation.
  - [x] Do not add content-similarity, channel, query, or near-duplicate infrastructure. Current canonical video-ID uniqueness is the implemented dedupe policy; broader duplicate policy is not specified for this slice.

- [x] Add immutable, safe Discovery-owned recommendation persistence (AC: 1, 2)
  - [x] Add exactly one forward migration `0056_<recommendation-name>.sql` after `0055_harden_discovery_triage_provenance.sql`, update `drizzle/migrations/meta/_journal.json`, and align `packages/database/src/schema.ts`. Add ranking-policy columns as nullable or with defined migration defaults, backfill every existing policy-version row with the selected initial operational values, validate range/normalization, then enforce `NOT NULL` and constraints. Never edit applied migrations or rely on application code to backfill durable rows.
  - [x] Retain legacy `minimumCandidateScore`, `priorityScoreWeight`, and `freshnessScoreWeight` as inert compatibility/audit fields in this migration. Do not read them in recommendation evaluation; the new five weights and two thresholds are its only ranking inputs. Keep legacy fields in policy snapshots/audits until a separately planned removal migration.
  - [x] Update `parseYoutubeDiscoveryPolicy`, `createYoutubeDiscoveryPolicyVersion`, policy audit summary/contracts, policy snapshot readers, and all policy fixtures in the same change. A policy version must fully contain the exact formula inputs used by every recommendation.
  - [x] Create one `youtube_discovery_*` recommendation record linked to candidate, appearance, claimed run, policy version, and triage. Its immutable provenance key is exactly `(candidate_id, appearance_id, run_id, policy_version_id, triage_id)` and is unique. Add the composite unique keys/FKs necessary to prove every component belongs to the same run/candidate/policy graph and that the linked triage status is `succeeded`; do not rely on application joins for this invariant. The database must enforce append-only rows with a `BEFORE UPDATE OR DELETE` trigger: reject every update and reject delete unless a transaction-local retention guard is set solely by `retainYoutubeDiscoveryRecords` immediately before its ordered deletion. The guard resets automatically at transaction end. Do not claim database immutability without an enforcement mechanism.
  - [x] Persist the rounded `score`, five bounded source scores, closed `skip | defer | consider` recommendation, and closed factor/penalty/reason/signal arrays only. Use `numeric(7,6)`, not `real`, for all new ranking-policy, recommendation source-score, and final-score columns. Normalize triage source scores with decimal `round6` half-up before evaluation; evaluate and persist those normalized values, and require policy weight sum to equal exact `numeric(7,6) = 1.000000`. Enforce `0..1` ranges, fixed closed code vocabularies, and bounded cardinality at the database boundary. A retry finding the immutable provenance key is idempotent success: it neither calls the eligibility port nor writes a second recommendation or history row.
  - [x] Extend `youtube_discovery_ranking_history.stage` with exactly `recommended`; retain existing `triaged` semantics. Add `recommendation_id` as a nullable `ON DELETE CASCADE` FK to the recommendation primary key, require it for `recommended` rows and forbid it for all other stages, and enforce a unique recommended history row per recommendation. Write recommendation and history rows atomically.
  - [x] Persist no free-text rationale, arbitrary JSON, raw comments, prompt/model response, provider payload, source/capture identity, evidence, traveler data, credentials, or cookies. Store codes and bounded numeric inputs only.
  - [x] Do not add mutable operator state, decision audit commands, a queue rank/read projection, API endpoints, or admin UI. Stories 19.3-19.5 own those concerns.
  - [x] Extend `retainYoutubeDiscoveryRecords` so it sets the transaction-local retention guard only immediately before deleting recommendation rows; their `recommended` history children are removed by FK cascade, then delete triages, remaining ranking history, appearances, and candidates. Preserve independent generic AI Usage retention.

- [x] Run deterministic recommendation after successful triage under the existing fence (AC: 1, 2)
  - [x] Delete the existing pre-persistence eligibility loop in `runYoutubeDiscoveryExecutionStage`; it must return every canonical search result rather than filtering to `eligible`. Persist canonical candidates, enrich, and triage them first; after a successful triage, perform exactly one eligibility lookup outside every DB transaction. Do not call the port twice for one candidate attempt. This is required so `already_compatible` becomes an immutable `skip` instead of silently disappearing from the graph.
  - [x] Extend `packages/database/src/youtube-discovery/index.ts` beside triage persistence with a guarded recommendation bundle reader and atomic recommendation/history writer. Reuse `guardYoutubeDiscoveryCandidateWrite`; preserve its active-running-lease, fencing token, current policy version, global enablement, and enabled-proposal checks.
  - [x] Re-read the claimed run's successful triage, current-run appearance/enrichment, candidate identity, policy snapshot, and unexpired safe derived signals. Prove current-run enrichment only with a matching `youtube_discovery_ranking_history` row at stage `enriched` for the same candidate, appearance, run, and policy; nullable metadata or empty signals remain valid enrichment outcomes. Never use another run's appearance/signal/triage, never convert a failed triage into a recommendation, and return idempotent completion before the eligibility lookup when recommendation provenance already exists.
  - [x] Call only the existing opaque `YoutubeCaptureEligibilityPort` for prior-capture eligibility. Discovery must not import, query, write, or persist Knowledge `sources`, capture versions, ingestion jobs, evidence, cards, publication/lifecycle state, or source IDs.
  - [x] Persist recommendation and its ranking-history record atomically. A policy/proposal revocation, lease/fence loss, or cancellation after the eligibility lookup must roll back all candidate-graph writes; commit cancellation only through the existing one-terminal-audit path. A contention outcome writes nothing.
  - [x] Use this result matrix: `eligible` or `already_compatible` followed by guarded persistence is `completed`; `unavailable`, aborted eligibility lookup, or insufficient remaining execution deadline writes no recommendation/history and follows the existing transient retry path; guard loss before or after lookup yields `cancelled` only through `cancelYoutubeDiscoveryRunIfDisabled`, while `contended` writes neither graph data nor lifecycle mutation. Do not hold a transaction while calling the opaque port.
  - [x] Integrate the stage in `packages/worker-domain/src/features/youtube-discovery/execution.ts` only after successful enrichment and triage, using the existing run deadline and retry/cancellation behavior. Do not add a new poller, scheduler, YouTube/Gateway provider call, Gateway prompt, Gemini credential, or `youtube:capture` execution.

- [x] Prove policy, privacy, persistence, and fencing boundaries (AC: 1-3)
  - [x] Add DB-free unit coverage in `tests/youtube-discovery-recommendations.test.ts` for exact score-band boundaries including equality, six-decimal rounding, deterministic equal-input results, formula/weight normalization, hard-gate precedence, canonical URL/video-ID mismatch, current-run enrichment requirement, `eligible`/`already_compatible`/`unavailable`, bounded closed explanation ordering/shapes, and invalid policy configuration.
  - [x] Add serial PostgreSQL coverage in `tests/youtube-discovery-recommendations.integration.test.ts`; its clean-state setup must call `resetTestDatabase()` locally. Prove migration-backfilled legacy policy versions can be read and used, normalized `numeric(7,6)` evaluator inputs, immutable candidate/appearance/run/policy/succeeded-triage provenance, idempotency before eligibility lookup, no recommendation for absent/failed triage, `already_compatible` persisted as `skip`, `unavailable` produces no recommendation/history, hard-gate outcomes, and retention order.
  - [x] Use direct SQL/Drizzle insert, update, and delete attempts to prove database rejection of mismatched cross-run/cross-policy provenance, failed-triage linkage, invalid closed arrays, out-of-range or excess-precision numeric values, duplicate recommendation/history keys, every recommendation mutation, and unguarded recommendation deletion. Prove the transaction-locally guarded `retainYoutubeDiscoveryRecords` path remains the sole permitted ordered deletion path.
  - [x] Add race/fence coverage proving policy/proposal revocation or lease loss after the prior-capture lookup persists neither recommendation nor ranking-history record, and leaves exactly one existing terminal run audit when cancellation wins. Cover deadline exhaustion, abort, `cancelled`, and `contended` separately according to the result matrix. Rebind and restore the existing execution port in each Worker test; do not add a second eligibility composition seam or leak the module-global port between tests.
  - [x] Retain and extend ownership/privacy regressions: Discovery has no direct Knowledge-table access and all recommendation fields reject prohibited raw/provider/source/evidence/traveler data.
  - [x] Run focused unit tests with `pnpm exec vitest run --project unit tests/youtube-discovery-recommendations.test.ts tests/youtube-discovery-triage.test.ts tests/youtube-discovery-ownership.test.ts`.
  - [x] Run focused serial integration tests with `pnpm exec vitest run --project integration tests/youtube-discovery-recommendations.integration.test.ts tests/youtube-discovery-triage.integration.test.ts tests/youtube-discovery-execution.integration.test.ts`.
  - [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact external environment blockers without weakening unit/integration separation.

## Dev Notes

### Scope and sequencing

- Story 19.1 is complete and owns governed AI Gateway metadata triage only. Its successful rows contain five finite `0..1` scores and a bounded subset of supplied safe signal codes; failed rows have no assessment. Reuse this boundary rather than changing the prompt, parser, model catalog, Usage writer, or triage invocation key.
- Story 19.2 owns immutable deterministic recommendation persistence and worker execution. Story 19.3 owns ranked operator queue/API/UI; Story 19.4 owns Knowledge intake acceptance; Story 19.5 owns mutable defer/skip decisions and recovery. Do not implement their state, routes, contracts, UI, or commands early.
- Discovery remains URL-only. A recommendation is operational ranking context, never a verified fact, evidence, capture authorization, publication decision, source, or traveler-visible content.

### Existing implementation to preserve

- Reuse `canonicalizeYoutubeVideoUrl` from `packages/domain/src/youtube-video.ts`. Recanonicalize the stored URL and require both returned URL and video ID to exactly equal the stored candidate values; do not write a second parser.
- Candidate identity is uniquely constrained by `youtube_discovery_candidates.video_id`; run-specific provenance is `youtube_discovery_appearances`; the existing ranking history is `discovered | enriched | triaged` and this story adds only `recommended`. Treat a recommendation record as immutable provenance rather than overloading mutable candidate state or inventing unbounded history semantics.
- `YoutubeCaptureEligibilityPort` is the sole permitted Knowledge boundary. `eligible` allows policy evaluation, `already_compatible` is a hard skip, and `unavailable` is transient/fail-closed. Its Knowledge implementation intentionally reveals no source/capture identifiers.
- `guardYoutubeDiscoveryCandidateWrite` establishes the required lock/fence policy. Use it before and after all durable recommendation graph writes. Its cancellation sentinel must roll back the transaction before `cancelYoutubeDiscoveryRunIfDisabled` records the single terminal audit.
- `runYoutubeDiscoveryPoll` owns the five-minute claim, 240-second execution deadline, retry/terminal paths, and candidate loop. Recommendation belongs immediately after triage success and must not change run lifecycle semantics.
- `retainYoutubeDiscoveryRecords` has explicit child deletion ordering. Delete new recommendation children first; do not delete or cascade generic `ai_usage_events`.

### Deterministic policy contract

- The architecture deliberately leaves initial score weights and bands as versioned operational policy values, not architectural constants. Select the initial values once in migration `0056`; persist and audit them in every policy version. The migration/schema/domain parser, policy audit summary, policy creation/update path, and run policy snapshots must move together so a recommendation can explain the exact policy version that produced it. Existing candidate scoring fields remain compatibility/audit data only and are not evaluator inputs.
- The exact evaluator formula, rounding, score-band comparison, and closed explanation vocabularies are normative in the task list above. Scores can influence ranking only after hard gates pass; commercial and duplicate risk must remain explicit penalties and cannot be hidden by popularity or another favorable score.
- Story 19.2 persists closed recommendation/explanation codes and a domain-owned deterministic mapping vocabulary only. Story 19.3 owns authorization, API read projection, Vietnamese display copy, numeric progressive disclosure, queue order, and UI. The UI shows only applicable factors/penalties, up to five, and must not fabricate explanations to meet a count. Do not satisfy AC 3 by adding a route, admin read model, or UI early.

### Data, privacy, and concurrency guardrails

- Persist only bounded safe operational metadata: closed recommendation, factors/penalties/reasons/signal codes, finite bounded score values, and candidate/appearance/run/policy/triage IDs. Keep timestamps UTC.
- Never persist raw comments, reconstructed comment summaries, model prompt or response text, provider diagnostics/payloads, transcripts, media, credentials, cookies, raw source material, evidence spans, source links/IDs, Knowledge identifiers, or traveler data. Truncating unsafe data is insufficient; do not construct it.
- Recommendation must be immutable once created for its provenance. A later run/policy may create a separately provenance-linked result; do not mutate a historic recommendation after policy changes.
- Preserve policy-first guarded write ordering. Do not hold a database transaction during the opaque eligibility call; re-enter guarded persistence after it returns and discard its result if the fence is lost.

### Project Structure Notes

- Expected changes are limited to `packages/domain/src/youtube-discovery/policy.ts`, `packages/database/src/schema.ts`, `packages/database/src/youtube-discovery/index.ts`, `packages/worker-domain/src/features/youtube-discovery/execution.ts`, one new forward migration plus journal entry, and focused tests.
- `packages/contracts/src/youtube-discovery/index.ts` may receive only a shared closed recommendation vocabulary if required by existing package boundaries. Do not create operator queue or admin API projections before Story 19.3.
- Do not change `apps/admin`, `apps/api`, `apps/worker/src/adapters.ts`, AI Gateway/Gemini configuration, Knowledge code, or manual capture runbooks for this story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 19.2]
- [Source: _bmad-output/implementation-artifacts/epic-19-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/19-1-register-discovery-ai-metadata-triage.md#Existing implementation to preserve]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1, AD-2, AD-3, AD-5, AD-6, and AD-7]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Components]
- [Source: docs/proposals/ai-first-youtube-discovery.md#Deterministic Recommendation And Operator Review]
- [Source: packages/domain/src/youtube-discovery/policy.ts]
- [Source: packages/domain/src/youtube-video.ts#canonicalizeYoutubeVideoUrl]
- [Source: packages/database/src/knowledge-youtube-capture-eligibility.ts#createYoutubeCaptureEligibilityPort]
- [Source: packages/database/src/youtube-discovery/index.ts#persistYoutubeDiscoveryTriage, retainYoutubeDiscoveryRecords, and guardYoutubeDiscoveryCandidateWrite]
- [Source: packages/worker-domain/src/features/youtube-discovery/execution.ts#runYoutubeDiscoveryPoll]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis and checklist validation completed 2026-08-10.
- 2026-08-10: Replaced the integration bootstrap subprocess migration with Drizzle migrator execution and flushed deferred policy backfill constraints in migration 0056; focused serial PostgreSQL tests now execute against all 57 migrations.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- The guide reconciles Story 19.2 acceptance criteria with Story 19.1's completed triage contract, Epic 18's fenced Discovery pipeline, the versioned policy boundary, immutable provenance requirements, and the later review/intake story ownership.
- Validation applied the deterministic evaluator contract, policy migration/backfill path, successful-triage and append-only enforcement, recommendation-history transition, eligibility sequencing, retry/fence result matrix, AC 3 scope boundary, and direct database-constraint coverage.
- No implementation, migration, provider call, database reset, test execution, or commit was performed while creating this story.
- Completed deterministic policy evaluation, immutable recommendation provenance persistence, guarded Worker eligibility sequencing, and recommendation retention. Worker coverage proves deadline exhaustion skips the eligibility port and post-lookup policy revocation persists neither recommendation nor recommended history while retaining exactly one terminal cancellation audit.
- Final verification passed: focused unit tests (5), focused serial integration tests (42), `pnpm typecheck`, `pnpm lint` (0 errors, 45 existing warnings), `pnpm build`, and `git diff --check`.
- 2026-08-10: BMad code review repaired ranking-history retention, unexpired signal projection, recommendation/history provenance, execution deadline fencing, malformed eligibility handling, the Discovery unit-test boundary, and the one-migration contract. PostgreSQL `numeric(7,6)` canonicalization was accepted for direct SQL inputs because checks/triggers cannot observe pre-coercion scale. Focused unit tests (7), focused integration tests (36), typecheck, lint (0 errors, 45 existing warnings), build, and diff check passed. Full unit suite retains one unrelated Traveler UI assertion failure.

### File List

- _bmad-output/implementation-artifacts/19-2-produce-deterministic-candidate-recommendations.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0056_add_discovery_recommendations.sql
- drizzle/migrations/0057_harden_discovery_recommendation_invariants.sql
- drizzle/migrations/meta/_journal.json
- packages/contracts/src/youtube-discovery/index.ts
- packages/database/src/schema.ts
- packages/database/src/youtube-discovery/index.ts
- packages/domain/src/youtube-discovery/policy.ts
- packages/worker-domain/src/features/youtube-discovery/execution.ts
- tests/integration-global-setup.ts
- tests/youtube-discovery-recommendations.integration.test.ts
- tests/youtube-discovery-recommendations.test.ts
- vitest.config.ts

### Change Log

- 2026-08-10: Implemented deterministic immutable YouTube Discovery recommendations and moved Story 19.2 to review after focused unit/integration, typecheck, lint, build, and diff validation.
