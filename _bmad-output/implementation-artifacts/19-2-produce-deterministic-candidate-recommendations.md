---
story_id: 19-2
status: ready-for-dev
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

3. **Given** candidate explanation is projected to an authorized operator, **when** it is rendered, **then** it uses a plain-language recommendation and concise factors/penalties.
   - Numeric scores are progressive disclosure only; they never imply correctness, source verification, or publication eligibility.

## Tasks / Subtasks

- [ ] Define the versioned deterministic ranking contract (AC: 1, 2)
  - [ ] Extend `packages/domain/src/youtube-discovery/policy.ts` with exactly these finite `0..1` fields: `relevanceWeight`, `expectedValueWeight`, `freshnessFitWeight`, `commercialRiskWeight`, `duplicateRiskWeight`, `deferMinimum`, and `considerMinimum`. Require all five weights to sum to `1` at the shared six-decimal precision, and require `0 <= deferMinimum < considerMinimum <= 1`. The migration owns initial operational values; do not hard-code thresholds in Worker code or create environment-variable policy.
  - [ ] Specify a pure, DB-free evaluator in the Discovery domain. For a successful triage assessment, calculate `quality = relevanceScore * relevanceWeight + expectedValueScore * expectedValueWeight + freshnessFitScore * freshnessFitWeight`, `risk = commercialRiskScore * commercialRiskWeight + duplicateRiskScore * duplicateRiskWeight`, and `score = round6(quality * (1 - risk))`. `round6` is decimal half-up to six places before comparisons and persistence. Produce `consider` when `score >= considerMinimum`, `defer` when `score >= deferMinimum`, otherwise `skip`; equality belongs to the higher band.
  - [ ] The evaluator must produce only deterministic closed values: factors are the positive score codes ordered `relevance`, `expected_value`, `freshness_fit`; penalties are `commercial_risk`, `duplicate_risk`; reasons are exactly one of `eligible_score_band`, `below_defer_band`, `between_defer_and_consider_band`, `already_compatible`, `canonical_mismatch`, `not_current_run_enriched`, `dedupe_conflict`; signals are the triage input-derived codes in lexical order. Deduplicate values, retain at most five factors/penalties combined, persist exactly one reason separately, and retain at most six signals. Do not persist prose; Story 19.3 maps these codes to authorized Vietnamese operator copy.
  - [ ] Make hard gates dominate calculated score: shared canonicalizer must reproduce the stored `videoId` and canonical URL; a current-run successful enrichment is the sole public-individual-video eligibility proof for this slice, so do not add another YouTube API call or a visibility field; canonical video-ID dedupe must hold; and prior capture outcome must be evaluated. `already_compatible` persists non-reviewable `skip` with its dedicated reason regardless of score; `unavailable` fails closed and is retried, never inferred as eligible. A candidate that lacks the current run's enrichment/appearance is not eligible for recommendation.
  - [ ] Do not add content-similarity, channel, query, or near-duplicate infrastructure. Current canonical video-ID uniqueness is the implemented dedupe policy; broader duplicate policy is not specified for this slice.

- [ ] Add immutable, safe Discovery-owned recommendation persistence (AC: 1, 2)
  - [ ] Add exactly one forward migration `0056_<recommendation-name>.sql` after `0055_harden_discovery_triage_provenance.sql`, update `drizzle/migrations/meta/_journal.json`, and align `packages/database/src/schema.ts`. Add ranking-policy columns as nullable or with defined migration defaults, backfill every existing policy-version row with the selected initial operational values, validate range/normalization, then enforce `NOT NULL` and constraints. Never edit applied migrations or rely on application code to backfill durable rows.
  - [ ] Update `parseYoutubeDiscoveryPolicy`, `createYoutubeDiscoveryPolicyVersion`, policy audit summary/contracts, policy snapshot readers, and all policy fixtures in the same change. A policy version must fully contain the exact formula inputs used by every recommendation.
  - [ ] Create one `youtube_discovery_*` recommendation record linked to candidate, appearance, claimed run, policy version, and triage. Its immutable provenance key is exactly `(candidate_id, appearance_id, run_id, policy_version_id, triage_id)` and is unique. The database must enforce that every key component belongs to the same run/candidate/policy graph, that the linked triage status is `succeeded`, and that recommendation rows are append-only. Use PostgreSQL triggers where FK/check constraints cannot enforce successful-triage linkage or reject `UPDATE`; retention's internal, ordered deletion path is the sole allowed deletion mechanism and must remain possible. Do not claim database immutability without an enforcement mechanism.
  - [ ] Persist the rounded `score`, five bounded source scores, closed `skip | defer | consider` recommendation, and closed factor/penalty/reason/signal arrays only. Enforce `0..1` numeric ranges, six-decimal precision, fixed closed code vocabularies, and bounded cardinality at the database boundary. A retry finding the immutable provenance key is idempotent success: it neither calls the eligibility port nor writes a second recommendation or history row.
  - [ ] Extend `youtube_discovery_ranking_history.stage` with exactly `recommended`; retain existing `triaged` semantics. Create one `recommended` history row linked by FK to recommendation provenance, enforce one history row per recommendation, and write both rows atomically.
  - [ ] Persist no free-text rationale, arbitrary JSON, raw comments, prompt/model response, provider payload, source/capture identity, evidence, traveler data, credentials, or cookies. Store codes and bounded numeric inputs only.
  - [ ] Do not add mutable operator state, decision audit commands, a queue rank/read projection, API endpoints, or admin UI. Stories 19.3-19.5 own those concerns.
  - [ ] Extend `retainYoutubeDiscoveryRecords` so recommendation rows are deleted before triages, ranking history, appearances, and candidates. Preserve independent generic AI Usage retention.

- [ ] Run deterministic recommendation after successful triage under the existing fence (AC: 1, 2)
  - [ ] Move the existing prior-capture eligibility lookup out of pre-persistence search filtering. Persist canonical candidates, enrich, and triage them first; after a successful triage, perform exactly one eligibility lookup outside every DB transaction. Do not call the port twice for one candidate attempt. This is required so `already_compatible` becomes an immutable `skip` instead of silently disappearing from the graph.
  - [ ] Extend `packages/database/src/youtube-discovery/index.ts` beside triage persistence with a guarded recommendation bundle reader and atomic recommendation/history writer. Reuse `guardYoutubeDiscoveryCandidateWrite`; preserve its active-running-lease, fencing token, current policy version, global enablement, and enabled-proposal checks.
  - [ ] Re-read the claimed run's successful triage, current-run appearance/enrichment, candidate identity, policy snapshot, and unexpired safe derived signals. Never use another run's appearance/signal/triage, never convert a failed triage into a recommendation, and return idempotent completion before the eligibility lookup when recommendation provenance already exists.
  - [ ] Call only the existing opaque `YoutubeCaptureEligibilityPort` for prior-capture eligibility. Discovery must not import, query, write, or persist Knowledge `sources`, capture versions, ingestion jobs, evidence, cards, publication/lifecycle state, or source IDs.
  - [ ] Persist recommendation and its ranking-history record atomically. A policy/proposal revocation, lease/fence loss, or cancellation after the eligibility lookup must roll back all candidate-graph writes; commit cancellation only through the existing one-terminal-audit path. A contention outcome writes nothing.
  - [ ] Use this result matrix: `eligible` or `already_compatible` followed by guarded persistence is `completed`; `unavailable`, aborted eligibility lookup, or insufficient remaining execution deadline writes no recommendation/history and follows the existing transient retry path; guard loss before or after lookup yields `cancelled` only through `cancelYoutubeDiscoveryRunIfDisabled`, while `contended` writes neither graph data nor lifecycle mutation. Do not hold a transaction while calling the opaque port.
  - [ ] Integrate the stage in `packages/worker-domain/src/features/youtube-discovery/execution.ts` only after successful enrichment and triage, using the existing run deadline and retry/cancellation behavior. Do not add a new poller, scheduler, YouTube/Gateway provider call, Gateway prompt, Gemini credential, or `youtube:capture` execution.

- [ ] Prove policy, privacy, persistence, and fencing boundaries (AC: 1-3)
  - [ ] Add DB-free unit coverage in `tests/youtube-discovery-recommendations.test.ts` for exact score-band boundaries including equality, six-decimal rounding, deterministic equal-input results, formula/weight normalization, hard-gate precedence, canonical URL/video-ID mismatch, current-run enrichment requirement, `eligible`/`already_compatible`/`unavailable`, bounded closed explanation ordering/shapes, and invalid policy configuration.
  - [ ] Add serial PostgreSQL coverage in `tests/youtube-discovery-recommendations.integration.test.ts`; its clean-state setup must call `resetTestDatabase()` locally. Prove migration-backfilled legacy policy versions can be read and used, immutable candidate/appearance/run/policy/succeeded-triage provenance, idempotency before eligibility lookup, no recommendation for absent/failed triage, `already_compatible` persisted as `skip`, `unavailable` produces no recommendation/history, hard-gate outcomes, and retention order.
  - [ ] Use direct SQL/Drizzle insert and update attempts to prove database rejection of mismatched cross-run/cross-policy provenance, failed-triage linkage, invalid closed arrays, out-of-range or excess-precision numeric values, duplicate recommendation/history keys, and every recommendation mutation. Prove `retainYoutubeDiscoveryRecords` remains the sole permitted ordered deletion path.
  - [ ] Add race/fence coverage proving policy/proposal revocation or lease loss after the prior-capture lookup persists neither recommendation nor ranking-history record, and leaves exactly one existing terminal run audit when cancellation wins. Cover deadline exhaustion, abort, `cancelled`, and `contended` separately according to the result matrix.
  - [ ] Retain and extend ownership/privacy regressions: Discovery has no direct Knowledge-table access and all recommendation fields reject prohibited raw/provider/source/evidence/traveler data.
  - [ ] Run focused unit tests with `pnpm exec vitest run --project unit tests/youtube-discovery-recommendations.test.ts tests/youtube-discovery-triage.test.ts tests/youtube-discovery-ownership.test.ts`.
  - [ ] Run focused serial integration tests with `pnpm exec vitest run --project integration tests/youtube-discovery-recommendations.integration.test.ts tests/youtube-discovery-triage.integration.test.ts tests/youtube-discovery-execution.integration.test.ts`.
  - [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact external environment blockers without weakening unit/integration separation.

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

- The architecture deliberately leaves initial score weights and bands as versioned operational policy values, not architectural constants. Select the initial values once in migration `0056`; persist and audit them in every policy version. The migration/schema/domain parser, policy audit summary, policy creation/update path, and run policy snapshots must move together so a recommendation can explain the exact policy version that produced it.
- The exact evaluator formula, rounding, score-band comparison, and closed explanation vocabularies are normative in the task list above. Scores can influence ranking only after hard gates pass; commercial and duplicate risk must remain explicit penalties and cannot be hidden by popularity or another favorable score.
- Story 19.2 persists closed recommendation/explanation codes and a domain-owned deterministic mapping vocabulary only. Story 19.3 owns authorization, API read projection, Vietnamese display copy, numeric progressive disclosure, queue order, and UI. Do not satisfy AC 3 by adding a route, admin read model, or UI early.

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

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- The guide reconciles Story 19.2 acceptance criteria with Story 19.1's completed triage contract, Epic 18's fenced Discovery pipeline, the versioned policy boundary, immutable provenance requirements, and the later review/intake story ownership.
- Validation applied the deterministic evaluator contract, policy migration/backfill path, successful-triage and append-only enforcement, recommendation-history transition, eligibility sequencing, retry/fence result matrix, AC 3 scope boundary, and direct database-constraint coverage.
- No implementation, migration, provider call, database reset, test execution, or commit was performed while creating this story.

### File List

- _bmad-output/implementation-artifacts/19-2-produce-deterministic-candidate-recommendations.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
