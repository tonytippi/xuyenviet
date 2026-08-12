# Technology And Brownfield Reality Follow-up

**Reviewed:** 2026-08-11
**Target:** Updated `ARCHITECTURE-SPINE.md` and progressive v6.2 companions
**Prior review:** `review-technology-reality.md`
**Verdict:** **PASS for the technology/reality lens.** R-TECH-01 through R-TECH-04 are now resolved or explicitly bounded by enforceable pre-activation gates. There are no remaining critical or high findings from this lens.

The deterministic Spine lint also passes with zero findings.

## Finding Closure

### R-TECH-01 — Resolved

The top-level topology now ratifies the repository:

- The paradigm names one modular-monolith workspace and data plane with four process units: traveler presentation, admin presentation, NestJS API, and Worker (`ARCHITECTURE-SPINE.md:16-18`).
- System Shape renders the two Next.js applications, NestJS API, and Worker separately (`ARCHITECTURE-SPINE.md:24-58`).
- AD-1 explicitly distinguishes separate process/deployment units from independent domain ownership (`ARCHITECTURE-SPINE.md:62-76`).
- AD-15 now records Railway-oriented Docker deployment as the current repository convention while correctly reserving actual production service/database proof for the operational gate (`ARCHITECTURE-SPINE.md:317-329`).
- The stale Vercel seed and generic “provider not yet final” framing have been removed. Hosted PostgreSQL provider/extension capability remains a bounded evidence item rather than an assumed fact (`ARCHITECTURE-SPINE.md:827-829`).

This accurately reflects the Docker targets without overclaiming that repository configuration proves a live production deployment.

### R-TECH-02 — Resolved by a conditional technology gate

PostgreSQL FTS is no longer an unconditional production commitment:

- AD-17 binds the durable requirement to scope-first, versioned, field-aware lexical retrieval, not to one search implementation (`ARCHITECTURE-SPINE.md:345-361`).
- PostgreSQL FTS with Vietnamese `simple + unaccent` is conditional on the exact deployed provider/version spike plus critical recall and false-exclusion gates. A failed spike leaves FTS inactive and permits `v6_active` to use a deterministic indexed field-aware lexical implementation (`ARCHITECTURE-SPINE.md:351`).
- The solution flow now labels the stage “Versioned field-aware lexical; gated PostgreSQL FTS” (`retrieval-trip-aware-solution-design.md:41-52`).
- G0 explicitly requires exact-provider/version deployability and quality evidence and defines fail-closed behavior (`retrieval-trip-aware/evaluation-and-release-gates.md:95-108`).
- The decision and its fallback are recorded in the memlog (`.memlog.md:128`).

This is the appropriate boundary: PostgreSQL FTS remains a plausible intended implementation, while the architecture no longer treats unverified Vietnamese/provider behavior as established reality.

### R-TECH-03 — Resolved

The solution design now includes a compact implementation-delta matrix (`retrieval-trip-aware-solution-design.md:19-39`) that distinguishes current code from target contract, owner, and activation gate for:

- planning modes and canonical leg paths;
- route registry and coverage;
- required needs and lexical retrieval;
- replay and web-scope manifests;
- gate profiles and read-mode authority;
- compatibility retirement;
- the migration diagnostic cleanup.

The table preserves the progressive-disclosure hierarchy: it reports implementation state and dependency order without becoming a second requirements source.

### R-TECH-04 — Properly bounded and tracked

The repository's stale migration failure diagnostic still exists, but the architecture package no longer silently claims full alignment:

- The implementation-delta matrix identifies the exact current mismatch, target outcome, owning cleanup slice, and gate (`retrieval-trip-aware-solution-design.md:39`).
- G0 requires the diagnostic to stop instructing operators to use a schema release matrix before production retrieval implementation advances (`retrieval-trip-aware/evaluation-and-release-gates.md:106-108`).
- AD-3 continues to match the actual advisory-lock plus Drizzle-ledger migration mechanism (`ARCHITECTURE-SPINE.md:90-100`).

Because this is a small known code cleanup with an explicit blocking gate, it is no longer an architecture-readiness finding. The readiness report should carry it as unfinished implementation work until the code change lands.

## Reality And Technology Consistency

- The updated topology aligns with `apps/web`, `apps/admin`, `apps/api`, `apps/worker`, and the production Docker targets.
- Current retrieval is accurately described as indexed text plus SQL `ILIKE` and TypeScript scoring; the target-count compatibility trigger remains explicitly current/legacy rather than being erased from the brownfield account.
- New v6.2 tables, policies, and manifests are explicitly shown as target contracts in the implementation-delta matrix rather than implied to exist.
- Named technology fit remains appropriately bounded: NestJS 11 matches the Node 20 container runtime; Next.js App Router, Drizzle/postgres.js, Tailwind 4, Playwright persistent context, and Tavily are supported by current repository usage and official documentation; hosted PostgreSQL extension capabilities and Vietnamese FTS remain evidence-gated.

## Remaining Findings

**Critical:** none.
**High:** none.

The stale migration diagnostic is tracked implementation work, not an unresolved architecture decision. Its G0 condition must remain in force until the code is corrected.
