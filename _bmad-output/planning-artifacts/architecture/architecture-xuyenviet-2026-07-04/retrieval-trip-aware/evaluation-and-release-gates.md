---
title: Retrieval Evaluation And Release Gates
status: final
updated: 2026-08-12
source_spine: ../ARCHITECTURE-SPINE.md
---

# Retrieval Evaluation And Release Gates

## Ownership

Feedback/Eval owns immutable datasets, cohort definitions, run results, and versioned numeric `RetrievalGateProfile` records. Retrieval and owning modules produce replayable decisions and safely execute shadow, cutover, and rollback. The Product Owner approves production cutover and compatibility retirement from an exact recorded report.

No story may use prose such as “approved threshold” without a gate-profile version. No optional retrieval experiment may share a cutover decision with the deterministic v6.2 baseline.

## Required Cohorts

### Critical-authoritative

These cohorts use zero-tolerance safety constraints where mandated by PRD SC-8 through SC-12 and AC-28 through AC-33:

- selected and complete canonical path boundaries;
- mixed-fact and multi-leg non-cross-authorization;
- current-plan versus hypothetical/pending/applied state;
- private/unscoped Trip-context isolation;
- material-context completeness, partial-reply accumulation, and scoped-preference non-leakage;
- unrelated evidence satisfying a required need;
- silent required-need omission;
- stale/removed evidence and final-version revocation;
- web scope mismatch/unresolved premise use;
- recent warning represented as live authority;
- Trip/primary-conversation deletion and derived-context invalidation;
- stale conversion-manifest use, transcript copy/linkage, duplicate Trip conversion, and any conversion value applied before proposal Apply;
- critical must-include candidate-cap cases.

The maximum known hard-off-route contribution, unrelated-need satisfaction, source-metadata leakage, web-scope premise misuse, recent-warning-as-live-authority, provider-failure unsafe recovery, hypothetical/pending-as-committed, private Trip leakage, silent required-gap omission, silent material default, false-ready progression, unresolved material-field omission, cross-scope preference leakage, missing assumption disclosure, partial-reply value-loss, stale conversion-manifest use, transcript copy/linkage, duplicate Trip conversion, and pre-Apply conversion mutation values are literal zero. Critical must-include hard-filter and cap false exclusion values are literal zero. Material provenance correctness is literal one. A complete profile with weaker values is invalid.

### Standard statistical

Standard cohorts cover noisy or preference-sensitive quality:

- candidate recall and final-set precision by facet/query class;
- required/useful need coverage;
- useful partial-answer rate;
- Vietnamese answer usefulness and generic-ChatGPT comparison;
- web-call, model-call, latency, token, and cost distributions;
- source-metadata isolation;
- broad-query compatibility non-regression;
- provider failure and practical recovery quality.
- false-blocking rate and clarification-turn burden by deliverable class.
- eligible-opportunity usefulness, CTA persistence, and conversion completion rate; mutation/isolation/idempotency safety remains in the critical-authoritative cohort.

Their numeric thresholds are benchmarked and approved in the first evaluation story, then stored in the exact gate profile. A report with null, prose-only, or inherited unstated thresholds cannot advance a gate.

## Profile Identity

Each result pins:

- `RetrievalGateProfile.version`;
- immutable corpus and fixture manifest IDs;
- planning-mode and Trip fixture versions;
- retrieval read mode;
- route-registry snapshot and coverage assertion revisions;
- requirement/facet vocabulary and intent-profile versions;
- planning-context profile, `ClarificationPlanPolicy`, instance-discovery rule, clarification-plan/extraction prompt, scope-graph, scope-comparator, and assumption-policy versions;
- Trip-conversion projection-policy, proposal-schema, and canonical-serialization versions;
- eligibility, ranking, selector, runtime, parser, and resolver versions;
- prompt/model/evaluator versions where applicable;
- run count, start/end timestamps, and environment;
- exact code revision or release identifier.

The profile owns minimum run count and minimum duration for its evidence window. Changing a threshold, cohort, denominator, or evidence-window value creates a new profile version and restarts evidence accumulation for the affected gate.

One evidence window contains one exact comparable tuple of code revision, read policy, corpus/fixtures, route registry and coverage assertions, requirement/facet and planning-context profiles, clarification-plan structural policy, instance-discovery/completeness/clarification-plan/extraction/scope/assumption policies, Trip-conversion projection policy, Trip proposal schema, conversion canonical serialization, eligibility, ranking, selector, runtime, parser, resolver, prompt, and evaluator versions. A changed member restarts the window; results from different tuples are not averaged into one cutover pass.

## Metrics

At minimum, every baseline/cutover report includes:

- rendered hard-off-route contribution rate;
- route-scope precision;
- hard-filter false-exclusion rate;
- candidate recall;
- candidate-cap false-exclusion rate;
- final-set precision;
- required-need coverage;
- source-metadata leakage rate;
- provenance and rendered-handle correctness;
- planning-mode correctness;
- material-context readiness correctness and unresolved-field omission rate;
- cross-scope preference leakage rate;
- silent material-default, false-ready, partial-reply value-loss, and missing-assumption-disclosure rates;
- false-blocking rate and clarification turns per ready deliverable instance;
- stale conversion-manifest use, transcript-copy, duplicate conversion, and pre-apply Trip-state mutation rates;
- hypothetical/pending-as-committed rate;
- private Trip-context leakage rate;
- silent required-gap omission rate;
- useful partial-answer rate;
- p50/p95/p99 stage and total latency;
- web/model call rates, prompt tokens, and cost per successful answer.

Metric definitions and denominators are versioned with the profile or dataset manifest. A denominator change is not comparable historical evidence without an explicit migration note.

## Gates

### G0 — Contract and fixture readiness

Required before production retrieval implementation beyond evaluation isolation:

- AD-34 through AD-40 approved and companions current;
- all `CLAR`, `PM`, `RP`, `RN`, `WS`, `DEL`, `COMP`, `TP`, `TC`, and `GATE` fixtures represented in an immutable manifest;
- numeric gate profile populated and approved;
- profile validator rejects any missing/unknown mandatory SC-8..12, AC-28..33, AD-39, or AD-40 metric, any weakened literal `0/1` safety value, and pins metric-definition versions;
- clarification-plan validator rejects over-limit, cyclic, duplicate, orphaned, or structurally unbounded output under the exact pinned policy;
- conversion-policy validator rejects empty, over-limit, duplicate, conflicting, unknown, or schema-incompatible mappings under the exact pinned policy/proposal-schema tuple;
- current legacy baseline measured;
- source-metadata leakage cases executable;
- Trip schema migration and proposal-operation design reviewed;
- exact deployed PostgreSQL version/provider spike proves the selected Vietnamese field-aware lexical configuration; `simple + unaccent` FTS remains inactive if deployability, candidate recall, or critical false-exclusion gates fail;
- current migration failure diagnostic no longer instructs operators to use a schema release matrix;
- no unresolved critical cross-artifact readiness finding.

### G1 — Shadow readiness

Required before `v6_shadow` evidence counts:

- registry and coverage assertions validate and activate atomically;
- `publishRouteRegistryRelease(...)` is the only writer, runs through the bounded existing-Worker operation, and leaves the previous release active on partial failure;
- projection generations and dependency identities are replayable;
- PostgreSQL read-policy CAS rejects a stale activation and every run pins the committed policy at start;
- shadow path performs no traveler, web, model, prompt-usage, or provenance side effect;
- current deletion and retention behavior covers shadow payloads;
- all critical fixtures pass deterministically.

### G2 — Production v6 cutover

Required before `v6_active`:

- deterministic baseline passes the exact gate profile for the full evidence window;
- zero stale/missing required projections for the cutover corpus;
- every critical-authoritative cohort passes;
- clarification readiness, partial-reply, contradiction, and scoped-preference cohorts pass with no silent material default or cross-scope leakage;
- clarification terminal, synchronous-extraction suppression, failure, CAS race, stale-answer, exact-evidence, and assumption-disclosure fixtures pass;
- persistent conversion uses only the latest eligible manifest, creates no duplicate Trip, copies no transcript, and leaves all transferred values pending until proposal Apply;
- standard cohort, latency, web/model call, and cost guardrails pass;
- rollback read mode is tested;
- cutover uses `activateRetrievalReadPolicy(...)` with reason `cutover`, the exact passing qualification report, Product Owner approval, expected current policy, and runnable rollback policy;
- Product Owner approves the exact recorded report.

### G3 — Card-count compatibility retirement

Required before removing the historical fewer-than-three trigger and target-count semantics:

- AD-34 requirement vocabulary and profile are active;
- versioned broad-query compatibility and missing-need cohorts pass;
- `COMP-01` through `COMP-06` pass;
- exact shadow evidence window passes non-regression gates;
- evaluation report identifies the legacy policy and target-count fields being retired;
- Product Owner approves retirement;
- cutover record identifies the rollback read mode.

Behavioral retirement updates active behavior and telemetry first. Legacy code/schema/config remains for the gate profile's `minimumLegacyRollbackWindowHours`. Feedback/Eval owns a cleanup report containing the window, exact evidence tuple, `COMP-06`, unresolved rollback incidents, and the qualified known-safe v6 target; the Product Owner approves it. Retrieval performs cleanup through read-policy CAS only after changing the rollback target, and must not leave an undocumented parallel trigger or name removed legacy behavior as runnable.

### G4 — Optional experiment

`pg_trgm`, embeddings, RRF, reranking, AI grey-band adjudication, or topic briefs each require a separate experiment ID, primary metric, minimum absolute uplift, safety/latency/cost guardrails, offline result, bounded shadow/staging evidence, and explicit go/no-go. A failed experiment is removed or remains inactive; it does not become fallback production complexity.

## Release Report

The recorded report contains:

1. Decision: pass, fail, or rollback.
2. Exact profile, corpus, fixtures, configs, registry, clarification policy, Trip-conversion projection policy, Trip proposal schema, conversion canonical serialization, code/release, and evidence window.
3. Critical cohort results with individual failing fixture IDs.
4. Standard cohort and operational metric results versus numeric thresholds.
5. Known exclusions and why they do not hide a PRD acceptance case.
6. Projection freshness/backfill and deletion evidence.
7. Compatibility comparison and proposed retirement scope when applicable.
8. Rollback procedure and validated target read mode.
9. Feedback/Eval owner sign-off and Product Owner cutover/retirement decision.

## Rollback

Any critical cohort regression triggers immediate read-policy rollback. The CAS transition reason is `rollback`: it uses the failing report/incident as trigger evidence, an authorized actor, expected current policy, and a target already recorded as runnable and previously qualified/approved. It does not wait for a new passing report or Product approval. Standard or operational regression follows the exact profile's guardrail action. Rollback preserves immutable registry, projections, run evidence, and schema for investigation; it does not restore unsafe traveler behavior through a fail-open fallback.

After rollback, new evidence accumulates under a new or unchanged profile only when the change is comparable. A modified metric, fixture, threshold, registry, or runtime policy must be explicitly versioned.
