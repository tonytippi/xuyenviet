---
title: Architecture Reviewer Gate — Good-Spine Rubric Follow-up
reviewed: 2026-08-11
review_target: ../ARCHITECTURE-SPINE.md
prior_review: review-rubric-walker.md
intent: validate-followup
reviewer: rubric-walker
---

# Architecture Reviewer Gate — Good-Spine Rubric Follow-up

## Verdict

**CONDITIONAL FAIL — three high findings remain before cross-artifact readiness.** Four prior findings are closed, RW-04 and RW-05 are only partially closed, and the repairs introduced or exposed two ownership/execution divergences that independent stories could implement incompatibly.

Mechanical lint passes with zero findings using the required `uv run .../lint_spine.py` command.

## Prior-Finding Closure Matrix

| Finding | Status | Verification |
|---|---|---|
| RW-01 — requirement contribution contract | **Closed** | `RequirementContribution` now binds knowledge/web fact identity, owner/capture revisions, requirement/leg, scope/freshness decisions, and permitted render variants; Retrieval is sole creator and identity changes are explicit (`contracts.md:147-202`; Spine AD-36 at `ARCHITECTURE-SPINE.md:671-675`). `RN-07` proves fact-level non-cross-authorization (`fixtures.md:60`). |
| RW-02 — replayable web query/fact chain | **Closed** | `WebQueryPlanManifest` pins requirements, minimized-query digest, allowed scope terms, excluded private classes, and builder/provider-policy versions; web facts pin text digest and extraction version, with a same-run referential chain to provenance (`contracts.md:252-300`). `WS-07` covers changed query/fact versions (`fixtures.md:72`). |
| RW-03 — route-registry activation boundary | **Closed** | `publishRouteRegistryRelease(...)` is now the sole authorized bounded Worker mutation; validation, projection build, release/assertion activation, CAS, and fail-closed previous-release behavior are fixed (`ARCHITECTURE-SPINE.md:653-659`; `contracts.md:88-118`; `GATE-03`). |
| RW-04 — enforceable gate-profile safety contract | **Partially closed; High remains** | The profile is now closed and enumerates the previously missing metrics, but the contract still permits thresholds that weaken PRD-mandated absolute safety outcomes. See FU-01. |
| RW-05 — physical retirement versus rollback | **Partially closed; Medium remains** | Behavioral and physical retirement are separated and rollback must switch to a runnable known-safe v6 policy before cleanup. However the rollback window is still only “bounded,” with no owner/versioned value, and G3 does not require new `COMP-06`. See FU-04. |
| RW-06 — PJ-01 stable fixtures | **Closed** | Stable `TP-01..TP-04` fixtures now cover accept, decline, continue-without-copy, and private answer; PJ-01 maps directly to them (`fixtures.md:94-116`). |

## Remaining High Findings

### FU-01 — Closed profile shape still allows PRD safety thresholds weaker than the required absolute outcomes

**Origin:** RW-04 residual
**Severity:** High
**Disposition:** Autofix profile validation and gate prose

**Evidence**

- The new `mandatorySafetyLimits` correctly names hard-off-route, unrelated-need, source-metadata leakage, provenance correctness, web-scope misuse, recent-warning-as-live-authority, and provider-failure recovery (`retrieval-trip-aware/contracts.md:319-355`).
- Validation requires fields to exist and rejects unknown/missing metrics, but no rule fixes the permitted values except the generic sentence that values “required to be zero” are zero (`contracts.md:358-360`; `evaluation-and-release-gates.md:99-108`).
- The gate document's explicit zero rule still names only hard-off-route, unrelated-need satisfaction, hypothetical/pending-as-committed, private Trip leakage, silent omission, and critical false exclusion (`evaluation-and-release-gates.md:20-34`).
- PRD outcomes are absolute for unresolved/mismatched web premise use, recent warnings presented as live authority, unsafe recovery after provider failure, and invented material attribution. A profile can currently set non-zero maxima for these fields, or `minimumProvenanceCorrectnessRate < 1`, and still satisfy the TypeScript shape.

**Why this remains a gate blocker**

The repair prevents omission but not weakening. Two evaluation stories can approve incompatible numeric safety policies, including one that knowingly allows behavior the PRD says “never” or “every affected answer” must prevent. That defeats the purpose of a closed mandatory contract.

**Required repair**

Add profile-validation invariants, not only fields:

- maximum hard-off-route contribution = `0`;
- maximum unrelated-need satisfaction = `0`;
- maximum web-scope premise misuse = `0`;
- maximum recent-warning-as-live-authority = `0`;
- maximum provider-failure unsafe recovery = `0`;
- maximum source-metadata leakage = `0` where the PRD forbids display;
- minimum provenance correctness = `1` for material attribution that is emitted;
- critical-cohort hypothetical/pending-as-committed, private leakage, silent gap, hard-filter and cap false exclusion = `0`.

Use literal zero/one fields or validator rules with executable invalid-profile fixtures. `GATE-01` should include a complete-but-weakened profile case, not only a missing-field case.

### FU-02 — AD-36 creates conflicting owners for messages, Retrieval-run sealing, and Usage finalization

**Origin:** Regression introduced by the staged terminal-transaction repair
**Severity:** High
**Disposition:** Discuss once, then tighten the command/transaction boundary

**Evidence**

- AD-6 says Chat/Trips owns messages, Retrieval owns its rows by feature boundary, and Usage owns append-only AI usage events (`ARCHITECTURE-SPINE.md:139-153`).
- AD-36 then says AI Orchestration is the sole writer for terminal assistant messages and “usage finalization,” while finalization also seals a Retrieval-owned run in the same transaction (`ARCHITECTURE-SPINE.md:661-675`).
- The contracts companion repeats that AI Orchestration owns terminal answer/provenance/usage persistence while `finalizeAiAnswer(...)` seals the Retrieval run (`retrieval-trip-aware/contracts.md:248-250`; `retrieval-trip-aware-solution-design.md:145-151`).

**Why this is a divergence/regression**

The atomicity goal is correct, but “sole writer” is now assigned to different modules for the same aggregates. One story can implement `finalizeAiAnswer(...)` in AI Orchestration with direct writes to messages, retrieval runs, and usage; another can require Chat/Trips, Retrieval, and Usage exported commands. Both can cite an AD. This contradicts the existing one-command-owner rule and makes test/lint enforcement unclear.

**Required repair**

Choose and state one transaction coordinator without transferring aggregate ownership. The smallest consistent option is:

- AI Orchestration owns the terminal workflow/idempotency command and answer provenance;
- Chat/Trips owns the assistant-message insert through an exported transaction-aware port;
- Retrieval owns the run seal through an exported transaction-aware port;
- Usage owns the usage-event append through an exported transaction-aware port;
- one database transaction and idempotency fence compose those owner operations;
- no coordinator imports or writes another owner's tables directly.

Alternatively, explicitly amend AD-6 if aggregate ownership is intentionally changing. Do not leave both ownership statements active.

### FU-03 — `v6_shadow` has no canonical execution shape linking the authoritative legacy result to shadow evidence

**Origin:** Newly exposed by the read-policy/run-contract repair
**Severity:** High
**Disposition:** Add one paired-execution invariant and fixtures

**Evidence**

- AD-38 correctly says legacy is the sole traveler-authoritative path in `v6_shadow`, and shadow performs no provider call, response selection, prompt usage, provenance write, or traveler mutation (`ARCHITECTURE-SPINE.md:691-701`).
- `RetrievalReadPolicy` and `QueryExecutionContext` each carry only one mode/read-policy identity (`retrieval-trip-aware/contracts.md:204-224,302-317`).
- No contract states whether a shadow request creates one combined run or paired legacy/shadow runs; no baseline-run/comparison ID or authoritative/shadow role links the two results.
- AD-36 says each run pins selection and prompt-render manifests and derives `usedInPrompt` from the render manifest, while the shadow path must not create prompt usage. The contract does not distinguish a simulated render decision from an actually provider-rendered prompt.
- `COMP-03` checks absence of side effects but not the identity/linkage or which run selected the traveler response (`fixtures.md:83-92`).

**Why this blocks convergent implementation**

Stories can implement shadow as one run containing two result sets, two unlinked runs, or a shadow-only run beside an unrecorded legacy decision. Those choices produce incompatible deletion, comparison, idempotency, finalization, and evidence-window semantics. Without an authoritative-result binding, the evaluation report cannot prove which exact legacy result a shadow run compared against.

**Required repair**

Define one canonical shape, for example:

- a traveler execution containing an authoritative legacy run reference and an optional shadow run reference; or
- two runs linked by one immutable comparison/execution ID with explicit `authoritative | shadow` role;
- only the authoritative run may select/persist traveler response, prompt usage, provenance, and provider usage;
- the shadow run may persist only the specifically allowed bounded decision/eval artifacts;
- comparison/evidence rows pin both run IDs, policies, code/config tuples, and the exact traveler-selected result;
- deletion invalidates the pair together.

Add fixtures for paired identity, retry/idempotency, deletion, and proof that a shadow render simulation never sets `usedInPrompt` or enters traveler provenance.

## Remaining Medium Finding

### FU-04 — Compatibility cleanup lifecycle is safer but not fully executable

**Origin:** RW-05 residual
**Severity:** Medium
**Disposition:** Tighten G3 before its cleanup story is created

The documents now require a bounded legacy rollback window, cleanup report, and a retained runnable `v6_active` rollback policy (`ARCHITECTURE-SPINE.md:697-701`; `evaluation-and-release-gates.md:134-146`). This closes the unsafe target problem, but:

- the rollback-window duration/end condition is not stored in a named versioned profile or cleanup policy and has no explicit owner;
- the cleanup report's required contents/approver are not defined;
- G3 still requires only `COMP-01..COMP-05`, so the new cleanup-rejection fixture `COMP-06` is not actually a gate prerequisite.

Store the cleanup window and physical-retirement eligibility in a versioned policy/report owned by Feedback/Eval or Retrieval, identify approval, and require `COMP-06` at G3 physical cleanup.

## Regression Sweep

No additional critical/high regression was found in these repaired areas:

- brownfield topology now matches the four repository process units without turning them into domain services;
- the PostgreSQL FTS decision is correctly spike-gated against the deployed provider/version, with a deterministic field-aware lexical fallback and no new runtime dependency;
- stale Trip path references now preserve historical meaning while losing current hard authority and requiring owner-confirmed refresh;
- deletion now has a single PostgreSQL transaction coordinator and explicitly handles production-evaluation membership and message-owned web captures;
- registry publication, read-policy activation, CAS, and previous-release fail-closed behavior are coherently owned.

## Final Checklist

| Dimension | Follow-up result |
|---|---|
| Divergence points | **Fail** — terminal aggregate ownership and shadow execution pairing remain open. |
| Rule enforceability | **Fail** — complete gate profiles can still weaken absolute safety outcomes. |
| Deferred safety | **Pass with medium cleanup follow-up**. |
| Brownfield ratification | **Pass**. |
| v6.2 outcome traceability | **Pass**. |
| v6.2 executable contract | **Fail pending FU-01..FU-03**. |
| Operational envelope | **Pass except physical-cleanup policy detail (FU-04)**. |
| Mechanical form | **Pass — zero lint findings**. |

## Recommendation

Resolve FU-01 through FU-03 before treating Architecture as ready for the cross-artifact implementation-readiness gate. FU-04 can be resolved in the same architecture pass; at minimum it must be closed before any physical compatibility-cleanup story is declared ready.
