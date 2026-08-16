---
id: SPEC-epic-21
companions:
  - story-contracts.md
  - ../../project-context.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md
  - ../../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md
  - ../../planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
sources: []
---

> **Canonical contract.** This SPEC and its companions are the complete dispatch
> contract for Epic 21. The superseded sixteen-story plan is historical only.

# Epic 21: Clean-Break Trip-Aware Planning And Conversion

## Why

Travelers need concise multi-turn clarification, clear separation between applied Trip
state and exploratory ideas, route-aware evidence organized by required planning need,
and an explicit path from useful chat context to a reviewable Trip proposal. There are
no production users or durable traveler data, so the smallest safe implementation is a
direct replacement of legacy card-count behavior on a guarded disposable database.

## Capabilities

- **CAP-1 — Versioned planning-context profiles**
  - **Intent:** Define material fields and compatible scopes for each planning deliverable.
  - **Success:** Typed code-owned profiles validate deterministically without cross-scope leakage.
- **CAP-2 — Durable scoped clarification**
  - **Intent:** Preserve relevant traveler answers across turns.
  - **Success:** One bounded session document accumulates fenced values without stale overwrite.
- **CAP-3 — Bounded clarification preflight**
  - **Intent:** Ask only unresolved material questions before answering.
  - **Success:** Blocked turns terminalize replayably and create no main-answer effects.
- **CAP-4 — Explicit planning modes**
  - **Intent:** Distinguish applied Trip state from exploration, proposals, and unscoped answers.
  - **Success:** Mode resolution is deterministic and only applied Trip state is current authority.
- **CAP-5 — Canonical route paths and coverage**
  - **Intent:** Ground route advice in owner-confirmed paths or supported product coverage.
  - **Success:** Exact, partial, ambiguous, unsupported, and stale routes fail safely; free text creates no authority.
- **CAP-6 — Required-need evidence packing**
  - **Intent:** Cover consequential planning needs rather than optimize related-card volume.
  - **Success:** Fact-level selection keeps every uncovered need explicit regardless of card count.
- **CAP-7 — Scoped web verification**
  - **Intent:** Verify changing facts for the exact relevant place, route, and time.
  - **Success:** Minimized queries and persisted provenance preserve gaps when evidence is unsafe or unavailable.
- **CAP-8 — Atomic answer finalization**
  - **Intent:** Publish one internally consistent terminal AI Ask result.
  - **Success:** Existing fences commit message, Usage, provenance, and one bounded retrieval snapshot without partial state.
- **CAP-9 — Persistent chat-to-Trip opportunity**
  - **Intent:** Keep one current conversion opportunity available while chat context remains eligible.
  - **Success:** Existing recommendation state is recomputed as `eligible`, `accepted`, `dismissed`, or `invalidated` without a manifest or workflow lifecycle.
- **CAP-10 — Reviewable Trip conversion**
  - **Intent:** Convert explicit chat planning values into a proposal for owner review.
  - **Success:** A separate Trip and pending typed proposal are created without transcript copying or pre-Apply mutation.
- **CAP-11 — Deletion invalidation**
  - **Intent:** Stop deleted planning material from influencing future behavior.
  - **Success:** Owner deletion removes reconstructable derived state transactionally and cannot be reversed by stale work.
- **CAP-17 — Clean-break direct activation**
  - **Intent:** Replace card-count retrieval with one required-need path before launch.
  - **Success:** The active system has no count or rollout-control authority and recovers through guarded reset/migrate/seed while data is disposable.

CAP-12 through CAP-16 are retired and must not be reused. They described qualification,
shadow, read-policy cutover, staged retirement, and compatibility-cleanup machinery that
is disproportionate before users or durable data exist.

## Constraints

- Execute only in this order: `21-1 → 21-2 → 21-3 → 21-4 → 21-5 → 21-6 → 21-7 → 21-8`.
- Add at most one new table: `planning_context_sessions`, storing one bounded JSON document per active conversation/session.
- Reuse `assistant_retrieval_decisions` for one bounded required-need/evidence/web/render snapshot. Reuse existing conversation/message, Trip/recommendation/proposal, AI Ask command, Usage, provenance, feedback, and audit storage.
- Planning profiles, required-need definitions, and supported-route registry/coverage are validated versioned code constants, not database tables.
- Use exactly one Epic 21 migration: `drizzle/migrations/0073_clean_break_trip_aware_planning.sql`, finalized in Story 21.1 and never amended by later stories. Migrations `0066` through `0072` already exist.
- Use flat bounded session slots, four planning modes, a static route manifest, four required-need outcomes, and four recommendation states. Add no generic graph, claim, workflow, evaluation, release, or finalization framework.
- Add no backfill, dual write, shadow execution, read mode, read-policy row, gate profile, evaluation run, cutover record, cleanup report, feature flag, parallel endpoint, new service, queue, cache, Worker kind, model purpose, or environment authority.
- Clean break is legal only on an explicitly disposable target. Use the repository's guarded `pnpm db:reset` flow. If durable user data or a non-disposable environment is discovered, stop and require expand-migrate-contract design.
- Before durable data exists, recovery is code rollback plus guarded reset/migrate/seed; there is no legacy runtime fallback.
- Preserve modular-monolith ownership, owner authorization, idempotency, version fences, atomic finalization, deletion boundaries, and stored provenance.
- Use `pnpm test:unit` for infrastructure-free tests and serial `pnpm test:integration` for PostgreSQL tests. Baseline verification is `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- `stories.yaml` is dispatch inventory only. `sprint-status.yaml` remains the sprint tracker; the orchestrator changes only the currently dispatched story.

## Non-goals

- Production-grade migration of unknown existing traveler data.
- Runtime A/B comparison, shadow traffic, numeric release cohorts, human approval persistence, or reversible read-policy cutover.
- A generalized workflow engine, evaluation platform, route-registry service, or second source of truth.
- Copying raw chat, assistant prose, prompts, provider payloads, assumptions, or unresolved values into a Trip.
- Running Epic 21 stories concurrently or marking all stories ready before their predecessor completes.
- Creating a custom clean-break scanner or automatically resetting a database during final verification.

## Success Signal

All eight stories complete sequentially through folder-plus-ID dispatch. The disposable
target resets, migrates through `0073`, and seeds successfully; all canonical fixtures,
focused unit and serial integration tests, lint, typecheck, and build pass; active code,
config, tests, scripts, and runbooks contain no card-count threshold or rollout-control
authority; and `sprint-status.yaml` is synchronized after each story.
