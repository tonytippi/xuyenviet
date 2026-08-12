# Adversarial Architecture Seam Review — Follow-up

Date: 2026-08-11  
Target: updated `ARCHITECTURE-SPINE.md` and retrieval/Trip-aware companions  
Prior review: `review-adversarial-seams.md`

## Verdict

**Not clean yet: 0 critical, 2 high findings.** Seven of the eight prior seam areas are closed at the behavioral-contract level. H1 is substantially improved by the staged/idempotent transaction, but its writer wording now conflicts with standing aggregate ownership. H2’s normal cutover CAS is closed, but the same command has no unambiguous emergency-rollback admission rule. H3–H6 and M1–M2 are closed.

## Remaining High Findings

### HIGH-1 — Finalization command ownership conflicts with aggregate writer ownership

**Relevant prior seam:** H1, finalization ownership.

**Evidence:**

- AD-6 says Usage owns append-only AI usage events and non-owning modules must not write another module’s aggregate (`ARCHITECTURE-SPINE.md:147-153`).
- AD-10 repeats that the Usage module persists provider usage metadata (`:251-253`).
- Updated AD-36 says Retrieval is the sole writer of the Retrieval run records, while AI Orchestration is the sole writer for “usage finalization”; the same finalization transaction seals the Retrieval-owned run and persists usage (`:667-675`).
- The solution-design ownership table assigns the terminal answer/provenance/**usage transaction** to AI Orchestration, and the contract says AI Orchestration owns terminal answer/provenance/usage persistence (`retrieval-trip-aware-solution-design.md:63-73`; `retrieval-trip-aware/contracts.md:248-250`).

**Incompatible implementations:**

1. The AI Orchestration team follows “sole writer” literally and gives `finalizeAiAnswer(...)` repositories that update `retrieval_runs` and insert `ai_usage_events` directly so the transaction is atomic.
2. The Retrieval and Usage teams follow AD-6 and AD-36’s first sentence literally and expose transaction-aware owner functions; AI Orchestration only coordinates them and never owns those repositories.

The first violates the established aggregate boundary; the second contradicts the companion statement that Orchestration owns usage persistence unless “owns the transaction” is distinguished from “owns the row writer.” This affects repository APIs, test ownership, retry semantics, and enforcement of AD-6.

**Required tightening:** Preserve the atomic/idempotent protocol, but name the layers precisely: AI Orchestration owns `finalizeAiAnswer(...)` and transaction coordination; Retrieval alone performs the fenced run-state transition through an exported transaction-aware function; Usage alone inserts the append-only event through its exported transaction-aware function; AI Orchestration alone writes the message, prompt manifest, and provenance. Explicitly prohibit Orchestration repositories from directly writing Retrieval or Usage tables.

### HIGH-2 — The CAS contract does not distinguish qualification evidence for cutover from trigger evidence for emergency rollback

**Relevant prior seam:** H2, read-policy CAS/cutover/rollback.

**Evidence:**

- Updated AD-37 makes `activateRetrievalReadPolicy(...)` the Retrieval-owned CAS writer and requires an exact **passing** gate report, Product Owner approval, and a runnable rollback policy for the activation (`ARCHITECTURE-SPINE.md:677-689`; `retrieval-trip-aware/contracts.md:302-317`).
- The gate companion says any critical cohort regression triggers **immediate** rollback, and release reports may have decision `pass | fail | rollback` (`retrieval-trip-aware/evaluation-and-release-gates.md:152-170`).
- The read-policy type has only `gateReportId` and `productApprovalId`; it does not distinguish the target policy’s historical qualification report from the current regression/incident report that triggers rollback (`retrieval-trip-aware/contracts.md:304-314`).

**Incompatible implementations:**

1. Operations reactivates the already-qualified rollback target using that target’s prior passing report and prior Product approval, while recording the current failing/rollback report separately.
2. The activation command treats `gateReportId` as evidence for the current transition and refuses the rollback because the triggering report is not passing, or waits for a new Product approval despite the “immediate” rule.

Both readings are plausible. The second makes the safety rollback unavailable exactly when required; the first relies on an unmodeled incident/rollback evidence link and an unstated pre-approval rule.

**Required tightening:** Give `activateRetrievalReadPolicy(...)` two explicit transition reasons under one CAS writer:

- `cutover | shadow | cleanup`: requires the exact current passing qualification report and Product approval.
- `rollback`: requires a recorded failing/rollback report or incident, an authorized operator/system actor, expected-current CAS, and a target already recorded as runnable and previously qualified/approved; it must not require a new passing report. Persist both `targetQualificationReportId` and `triggerReportOrIncidentId`, plus the prior and new policy IDs.

## Prior Finding Closure Matrix

| Prior finding | Status | Verification |
|---|---|---|
| H1 — run finalization owner/atomicity | **Partial** | `prepareAiAnswerRun(...)` / `finalizeAiAnswer(...)`, one run/idempotency fence, atomic terminal transaction, provider-failed terminal, and duplicate prevention are now binding (`ARCHITECTURE-SPINE.md:671`; contracts `:248-250`). Writer ownership still conflicts as HIGH-1. |
| H2 — read-mode authority/CAS | **Partial** | PostgreSQL authority, Retrieval-owned CAS, expected-current fence, pinned run-start policy, and config-as-seed/cache are binding (`ARCHITECTURE-SPINE.md:687`, `:821`; contracts `:302-317`). Emergency rollback admission remains ambiguous as HIGH-2. |
| H3 — shadow/retirement semantics | **Closed** | Legacy is sole traveler authority in `v6_shadow`; shadow has no provider/traveler/prompt/provenance side effects; behavioral retirement and physical cleanup are separate; removed legacy cannot remain a rollback target (`ARCHITECTURE-SPINE.md:697-701`; fixtures `COMP-03`, `COMP-06`). |
| H4 — stale Trip path authority | **Closed** | `stale_selected_path` is an exact state, grants no hard authority, uses current active rules, forbids automatic replacement, and refreshes only through owner-confirmed `set-leg-path` (`ARCHITECTURE-SPINE.md:653-659`; contracts `:92-118`; fixture `RP-07`). |
| H5 — deletion coordination | **Closed** | Chat/Trips commands coordinate all owners in one PostgreSQL transaction, fence the owner, return success only after every invalidation, remove production eval membership, and prevent message-owned captures becoming reusable knowledge (`ARCHITECTURE-SPINE.md:291-307`; contracts `:362-373`). |
| H6 — web authorization chain | **Closed** | First-class query manifest, atomic fact identity, scope decision owner row, exact requirement contribution, render-manifest linkage, and provenance chain are binding (`ARCHITECTURE-SPINE.md:673-675`, `:752-754`; contracts `:252-300`). |
| M1 — requirement identity/granularity | **Closed** | Content-addressed deterministic identity includes the intent-profile and canonical key fields; the profile owns expansion, per-leg duplication, and coalescing; generation changes version the identity (`ARCHITECTURE-SPINE.md:673`; contracts `:120-202`). |
| M2 — gate evidence comparability | **Closed** | One exact configuration tuple per window is mandatory and any member change restarts the window; profile completeness is closed against the mandatory PRD metrics (`ARCHITECTURE-SPINE.md:689`; gate companion `:56-68`; fixtures `GATE-01`, `GATE-02`). |

## Additional Observations

No new critical/high seam was found in registry publication, web-query privacy minimization, compatibility cleanup, or owner deletion after the update. Once HIGH-1 and HIGH-2 are tightened, the adversarial seam gate can pass without another architecture expansion.
