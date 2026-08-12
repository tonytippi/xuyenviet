# Technology And Brownfield Reality Review

**Reviewed:** 2026-08-11
**Target:** `ARCHITECTURE-SPINE.md` plus the progressive v6.2 companions
**Lens:** Verify that committed architecture is grounded in current official technology behavior or repository reality, and that target-state design is not presented as already implemented.
**Verdict:** **CHANGES REQUIRED before the cross-artifact readiness gate.** The v6.2 ownership model and progressive-disclosure split are strong, and the solution design honestly records the main brownfield delta. However, two load-bearing parts of the Spine still do not ratify the repository/deployment reality, and the committed PostgreSQL FTS baseline is not yet validated for Vietnamese or the actual hosted PostgreSQL target.

The deterministic Spine lint passed with zero findings. The findings below are semantic/reality issues rather than formatting defects.

## Findings

### [HIGH] R-TECH-01 — The top-level runtime/deployment shape is stale

**Evidence**

- The paradigm says the MVP ships "one coherent web application" and that product modules are not separated by deployable services (`ARCHITECTURE-SPINE.md:16-18`).
- The system diagram collapses traveler and operator/admin presentation into one `Web` node (`ARCHITECTURE-SPINE.md:28-34`).
- AD-15 still says the provider is unconfirmed, seeds Vercel compatibility, and defers the final deployment provider (`ARCHITECTURE-SPINE.md:309-319`, `:802`).
- The repository actually contains two Next.js presentation apps plus separate Nest API and Worker packages. The production Dockerfile defines distinct `runner`, `api-runner`, `admin-runner`, and `worker` targets, and explicitly identifies Railway for API and admin deployment (`Dockerfile:47-120`).
- Current Next.js documentation confirms that a Next.js app can run on any Node.js provider; Vercel is not an architectural prerequisite ([Next.js deployment modes](https://nextjs.org/docs/15/app/getting-started/deploying)).

**Why this matters**

The modular-monolith decision remains valid at the domain/data-ownership level, but the written topology can lead implementation and operations stories to assume one presentation/runtime/deployment unit. It also leaves an already-materialized Railway deployment choice looking unresolved.

**Required correction**

Ratify the code as one modular-monolith workspace/domain boundary with four existing process/deployment units: traveler presentation, admin presentation, Nest API, and Worker. Show `apps/admin` separately in System Shape. Replace the Vercel-oriented assumption/deferred item with the actual current deployment state, or explicitly mark Railway as current implementation and keep only the long-term provider decision deferred if that is genuinely still open.

### [HIGH] R-TECH-02 — PostgreSQL FTS is committed before the Vietnamese/provider spike has established fit

**Evidence**

- AD-17 makes field-aware PostgreSQL full-text search the v6.2 production baseline (`ARCHITECTURE-SPINE.md:335-353`), and the solution flow treats it as a settled stage (`retrieval-trip-aware-solution-design.md:29-36`).
- Current repository retrieval is not PostgreSQL FTS: it tokenizes the query, filters `searchable_text` with `ILIKE`, and scores in TypeScript (`packages/database/src/knowledge-search.ts:155-233`).
- The v6.2 technical roadmap itself still requires a `simple + unaccent` spike against the exact deployed PostgreSQL version/provider (`docs/roadmaps/retrieval-va-tri-nho-traveler-v6.2.md:3396`).
- The release companion's G0 checklist does not require this spike or an approved text-search configuration before implementation (`retrieval-trip-aware/evaluation-and-release-gates.md:93-103`).
- PostgreSQL's official documentation confirms that FTS behavior depends on a selected parser/dictionary configuration, while `unaccent` is a separately installed supplied extension/filtering dictionary ([text-search dictionaries](https://www.postgresql.org/docs/current/textsearch-dictionaries.html), [`unaccent`](https://www.postgresql.org/docs/current/unaccent.html)).

**Why this matters**

This is the only newly named production retrieval technology in the v6.2 path. Without evidence from the real provider/version and Vietnamese corpus, the architecture cannot yet claim it is the appropriate deterministic baseline. Accent folding, tokenization, query construction, indexes, and false-exclusion behavior are part of correctness, not a tuning detail.

**Required correction**

Either (a) keep PostgreSQL FTS as the intended baseline but make the exact `simple + unaccent` configuration/provider spike a G0 prerequisite and record the verified result/version in the memlog, or (b) retain the existing indexed lexical comparator as production until the spike and critical candidate-recall/false-exclusion cohorts pass. Do not let `v6_active` depend on an unverified FTS configuration.

### [MEDIUM] R-TECH-03 — Progressive disclosure separates authority well, but does not expose implementation status precisely enough

**Evidence**

- The reading guide clearly establishes `PRD -> Spine -> Solution Design -> Contracts / Fixtures / Gates`, and the solution design includes a useful brownfield delta (`README.md:12-24`; `retrieval-trip-aware-solution-design.md:19-23`).
- After that paragraph, target types and persistence concepts are written in binding form: route registry, canonical Trip path references, retrieval runs/manifests, web-scope projections, gate profiles, and `legacy | v6_shadow | v6_active` read mode (`retrieval-trip-aware/contracts.md:18-197`; `ARCHITECTURE-SPINE.md:637-675`).
- Those v6.2 tables/types/read-mode controls do not exist in the current schema/contracts, while the current target-count path demonstrably does (`packages/database/src/source-bundle.ts:57-68`, `:323-365`).

**Why this matters**

The docs are target architecture, so absence from code is not itself a defect. The risk is that a developer loading only a linked lower-level companion can no longer tell which contracts are implemented, which require migration, and which are compatibility-only. That weakens the intended progressive-disclosure benefit and can produce stories that assume prerequisite schema or control-plane state already exists.

**Required correction**

Add one compact implementation-delta matrix near the solution-design Brownfield Delta with stable capability IDs and columns such as `current code`, `target contract`, `migration/story owner`, and `cutover gate`. Keep it descriptive rather than a second source of requirements. At minimum cover canonical leg path, route registry/coverage, requirement vocabulary, retrieval manifests, web-scope projections, gate profiles, and the authoritative read-mode record.

### [MEDIUM] R-TECH-04 — A current migration diagnostic still contradicts AD-3's no-release-matrix rule

**Evidence**

- AD-3 correctly says the migration runner uses a target-scoped PostgreSQL advisory lock plus Drizzle's applied-migration ledger and explicitly requires no schema release matrix (`ARCHITECTURE-SPINE.md:82-94`).
- The current migration command does use that advisory lock and Drizzle migrator (`scripts/migrate-api-schema.ts:6-39`), which reality-checks most of the AD.
- Its failure message still instructs operators to verify an "approved release matrix and pre-migration schema admission" (`scripts/migrate-api-schema.ts:43-46`).
- Drizzle's current official docs confirm code-first generated migrations and an applied-migration log/ledger as supported behavior ([Drizzle migrations](https://orm.drizzle.team/docs/migrations), [Drizzle migration configuration](https://orm.drizzle.team/docs/drizzle-config-file)).

**Why this matters**

The architecture is right, but the repository still asserts the retired operating model at the exact point an operator sees a migration failure. Readiness should not claim the no-matrix model is fully ratified until that stale diagnostic is removed or corrected.

**Required correction**

Track a narrow code/doc cleanup to replace the message with the real checks (target, advisory-lock acquisition, and Drizzle migration failure) and include it in the applicable implementation story. No architecture redesign is needed.

## Named-Technology Reality Check

| Technology | Result | Basis |
|---|---|---|
| Next.js App Router / React | Verified in repo and current official docs | `next@^15.3.5`, React 19, two App Router presentation apps; App Router remains supported ([official docs](https://nextjs.org/docs/app)). |
| NestJS 11 | Verified in repo and compatible with runtime | `@nestjs/*@^11.1.28`; Docker pins Node 20. NestJS 11 requires Node 20+ ([official migration guide](https://docs.nestjs.com/migration-guide)). |
| Drizzle + postgres.js | Verified in repo and current official docs | Drizzle schema/migrations and `postgres.js` driver are implemented; official docs support this pairing ([PostgreSQL guide](https://orm.drizzle.team/docs/get-started-postgresql)). |
| Tailwind CSS 4 | Verified in repo and official docs | `tailwindcss@^4.1.11` and `@tailwindcss/postcss`; v4 is current and documented ([v4 release](https://tailwindcss.com/blog/tailwindcss-v4)). |
| Playwright persistent context | Verified in repo and official docs | Facebook capture uses `launchPersistentContext`; the API remains supported and explicitly persists cookies/local storage in the selected user-data directory ([official API](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)). |
| Tavily Search | Appropriately provisional | Adapter and tests exist; AD-9 retains `[ASSUMPTION]` and a corridor/failure spike. Current Tavily Search still exposes country/domain/time controls ([official Search API](https://tavilyai.mintlify.app/documentation/api-reference/endpoint/search)). |
| pgvector | Exists, but is not current repo capability | The extension remains active upstream ([official project](https://github.com/pgvector/pgvector)), but no vector extension migration or embedding table is present. Treat the diagram/AD-2 wording as future seed/experiment, not deployed state. |
| PostgreSQL FTS for Vietnamese | Not yet verified | Technology exists, but the exact parser/dictionary/unaccent/provider fit remains an unresolved project spike; see R-TECH-02. |

## Positive Observations

- The v6.2 solution design does not pretend the feature exists: its Brownfield Delta accurately identifies `TripAnswerContext` v1, free-text leg endpoints, target-count fallback, and missing fact-scoped web geography.
- AD-34 through AD-38 correctly isolate new behavior behind versioned profiles, shadow evidence, explicit cutover, and rollback rather than silently replacing the current path.
- Tavily, Vercel, and latency claims retain assumption/spike labeling instead of being presented as proven facts.
- The progressive-disclosure authority hierarchy is coherent; the needed repair is clearer reality/status projection, not a return to one oversized document.

## Gate Recommendation

Do not treat the architecture package as implementation-ready until R-TECH-01 and R-TECH-02 are resolved. R-TECH-03 should be addressed before story generation for v6.2 prerequisites. R-TECH-04 can be assigned as a narrow implementation cleanup but should remain visible in the readiness report.
